import hashlib
import hmac
import json
import os
import time

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services.credit_service import (
    PACKAGES, PAGE_CREDITS, USD_PER_CREDIT, TRIAL_CREDITS,
    get_balance, history, grant, grant_once,
)

router = APIRouter()

STRIPE_API = "https://api.stripe.com/v1/checkout/sessions"
WEBHOOK_TOLERANCE_SECONDS = 300


class CheckoutRequest(BaseModel):
    package_id: str


class GrantRequest(BaseModel):
    user_id: str
    credits: int
    note: str = "Manual grant"


def _public_app_url() -> str:
    return os.environ.get("PUBLIC_APP_URL", "http://localhost:3001").rstrip("/")


@router.get("/billing/me")
async def billing_me(request: Request):
    user_id = request.state.user["id"]
    return {"success": True, "data": {
        "balance": get_balance(user_id),
        "page_credits": PAGE_CREDITS,
        "usd_per_credit": USD_PER_CREDIT,
        "trial_credits": TRIAL_CREDITS,
        "packages": PACKAGES,
        "payments_enabled": bool(os.environ.get("STRIPE_SECRET_KEY")),
    }, "error": None}


@router.get("/billing/history")
async def billing_history(request: Request):
    return {"success": True, "data": history(request.state.user["id"]), "error": None}


@router.post("/billing/checkout")
async def billing_checkout(body: CheckoutRequest, request: Request):
    key = os.environ.get("STRIPE_SECRET_KEY")
    if not key:
        return {"success": False, "data": None, "error": "Payments are not configured yet."}
    package = next((p for p in PACKAGES if p["id"] == body.package_id), None)
    if not package:
        return {"success": False, "data": None, "error": "Unknown package"}

    user = request.state.user
    base = _public_app_url()
    form = {
        "mode": "payment",
        "success_url": f"{base}/?billing=success",
        "cancel_url": f"{base}/?billing=cancelled",
        "client_reference_id": user["id"],
        "customer_email": user["email"],
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": str(int(package["usd"] * 100)),
        "line_items[0][price_data][product_data][name]": f"{package['name']} — {package['credits']} credits",
        "metadata[user_id]": user["id"],
        "metadata[credits]": str(package["credits"]),
        "metadata[package_id]": package["id"],
    }
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(STRIPE_API, data=form, auth=(key, ""))
    if resp.status_code != 200:
        return {"success": False, "data": None, "error": "Could not start checkout. Try again."}
    return {"success": True, "data": {"url": resp.json()["url"]}, "error": None}


def _verify_stripe_signature(payload: bytes, header: str | None, secret: str) -> bool:
    if not header:
        return False
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    timestamp = parts.get("t")
    if not timestamp or not timestamp.isdigit():
        return False
    if abs(time.time() - int(timestamp)) > WEBHOOK_TOLERANCE_SECONDS:
        return False
    signed = f"{timestamp}.".encode() + payload
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    signatures = [v for k, v in (p.split("=", 1) for p in header.split(",") if "=" in p) if k == "v1"]
    return any(hmac.compare_digest(expected, sig) for sig in signatures)


@router.post("/billing/webhook")
async def billing_webhook(request: Request):
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    if not secret:
        return JSONResponse(status_code=503, content={"success": False, "error": "Webhook not configured"})
    payload = await request.body()
    if not _verify_stripe_signature(payload, request.headers.get("stripe-signature"), secret):
        return JSONResponse(status_code=400, content={"success": False, "error": "Bad signature"})

    event = json.loads(payload)
    if event.get("type") == "checkout.session.completed":
        session = event["data"]["object"]
        if session.get("payment_status") == "paid":
            meta = session.get("metadata") or {}
            user_id = meta.get("user_id")
            credits = int(meta.get("credits", "0"))
            if user_id and credits > 0:
                grant_once(session["id"], user_id, credits, f"Purchased {meta.get('package_id', '')} package")
    return {"success": True}


@router.post("/billing/grant")
async def billing_grant(body: GrantRequest, request: Request):
    requester = request.state.user
    if requester.get("role") != "admin":
        return JSONResponse(status_code=403, content={"success": False, "data": None, "error": "Admin access required"})
    from services.auth_service import get_user_by_id
    from services.company_service import is_platform_owner
    target = get_user_by_id(body.user_id)
    if not target or (not is_platform_owner(requester) and target.get("company_id") != requester.get("company_id")):
        return {"success": False, "data": None, "error": "User not found"}
    if body.credits <= 0:
        return {"success": False, "data": None, "error": "credits must be positive"}
    balance = grant(body.user_id, body.credits, body.note, ref=f"admin:{request.state.user['id']}")
    return {"success": True, "data": {"balance": balance}, "error": None}
