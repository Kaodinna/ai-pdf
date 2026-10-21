import hashlib
import hmac
import json
import os

import httpx
from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services.credit_service import (
    PACKAGES, PAGE_CREDITS, USD_PER_CREDIT, TRIAL_CREDITS,
    get_balance, history, grant, grant_once,
)
from services.fx_service import get_rates

router = APIRouter()

PAYSTACK_API = "https://api.paystack.co"

# Currencies Paystack can settle for an African merchant account, plus USD
# for everyone else. Whether yours actually has each one *enabled* is a
# Paystack dashboard setting (Settings -> Preferences) we can't see from
# here — billing_checkout asks Paystack directly and falls back to NGN
# (every Nigerian Paystack account has that one) if a currency is rejected.
CURRENCIES = {
    "NGN": {"label": "Nigerian Naira", "symbol": "₦", "round_to": 50},
    "USD": {"label": "US Dollar", "symbol": "$", "round_to": 1},
    "GHS": {"label": "Ghanaian Cedi", "symbol": "GH₵", "round_to": 1},
    "ZAR": {"label": "South African Rand", "symbol": "R", "round_to": 1},
    "KES": {"label": "Kenyan Shilling", "symbol": "KSh", "round_to": 5},
}
DEFAULT_CURRENCY = "NGN"  # the merchant's home currency — always available


def _resolve_currency(code: str | None) -> str:
    code = (code or "").upper()
    return code if code in CURRENCIES else DEFAULT_CURRENCY


def _priced(usd_amount: float, currency: str, rate: float) -> float:
    step = CURRENCIES[currency]["round_to"]
    if currency == "USD":
        return round(usd_amount, 2)
    return round(round(usd_amount * rate / step) * step)


def _priced_packages(currency: str, rate: float) -> list[dict]:
    return [
        {**p, "price": _priced(p["usd"], currency, rate), "currency": currency}
        for p in PACKAGES
    ]


class CheckoutRequest(BaseModel):
    package_id: str
    currency: str | None = None  # one of CURRENCIES; falls back to NGN if omitted or unknown


class GrantRequest(BaseModel):
    user_id: str
    credits: int
    note: str = "Manual grant"


def _public_app_url() -> str:
    return os.environ.get("PUBLIC_APP_URL", "http://localhost:3001").rstrip("/")


@router.get("/billing/me")
async def billing_me(request: Request, currency: str | None = None):
    user_id = request.state.user["id"]
    cur = _resolve_currency(currency)
    fx = await run_in_threadpool(get_rates)
    rate = fx["rates"].get(cur, 1.0)
    return {"success": True, "data": {
        "balance": get_balance(user_id),
        "page_credits": PAGE_CREDITS,
        "usd_per_credit": USD_PER_CREDIT,
        "currency": cur,
        "currencies": CURRENCIES,
        "credit_price": round(USD_PER_CREDIT * rate, 4) if cur != "USD" else USD_PER_CREDIT,
        "trial_credits": TRIAL_CREDITS,
        "packages": _priced_packages(cur, rate),
        "payments_enabled": bool(os.environ.get("PAYSTACK_SECRET_KEY")),
        "fx_source": fx["source"],
        "fx_as_of": fx["as_of"],
        "fx_stale": fx["stale"],
    }, "error": None}


@router.get("/billing/history")
async def billing_history(request: Request):
    return {"success": True, "data": history(request.state.user["id"]), "error": None}


async def _try_paystack_init(key: str, user: dict, package: dict, currency: str, amount: float, base: str) -> tuple[dict, httpx.Response]:
    # Paystack amounts are in the currency's smallest unit (kobo/cents/
    # pesewas/etc) — all five currencies we offer use 2 decimal places, so
    # *100 is correct for each of them.
    payload = {
        "email": user["email"],
        "amount": int(round(amount * 100)),
        "currency": currency,
        "callback_url": f"{base}/?billing=success",
        "metadata": {
            "user_id": user["id"],
            "credits": package["credits"],
            "package_id": package["id"],
        },
    }
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            f"{PAYSTACK_API}/transaction/initialize",
            json=payload,
            headers={"Authorization": f"Bearer {key}"},
        )
    return (resp.json() if resp.content else {}), resp


def _looks_like_unsupported_currency(data: dict) -> bool:
    message = (data.get("message") or "").lower()
    return "currency" in message


@router.post("/billing/checkout")
async def billing_checkout(body: CheckoutRequest, request: Request):
    key = os.environ.get("PAYSTACK_SECRET_KEY")
    if not key:
        return {"success": False, "data": None, "error": "Payments are not configured yet."}
    package = next((p for p in PACKAGES if p["id"] == body.package_id), None)
    if not package:
        return {"success": False, "data": None, "error": "Unknown package"}

    user = request.state.user
    base = _public_app_url()
    currency = _resolve_currency(body.currency)
    fx = await run_in_threadpool(get_rates)
    rate = fx["rates"].get(currency, 1.0)
    amount = _priced(package["usd"], currency, rate)

    data, resp = await _try_paystack_init(key, user, package, currency, amount, base)
    downgraded = False
    if (resp.status_code != 200 or not data.get("status")) and currency != DEFAULT_CURRENCY and _looks_like_unsupported_currency(data):
        # Your Paystack account doesn't have this currency enabled — fall
        # back to NGN, which every Nigerian Paystack account has, instead
        # of failing the checkout outright.
        currency = DEFAULT_CURRENCY
        rate = fx["rates"].get(currency, 1.0)
        amount = _priced(package["usd"], currency, rate)
        data, resp = await _try_paystack_init(key, user, package, currency, amount, base)
        downgraded = True

    if resp.status_code != 200 or not data.get("status"):
        return {"success": False, "data": None, "error": data.get("message") or "Could not start checkout. Try again."}
    return {"success": True, "data": {
        "url": data["data"]["authorization_url"],
        "currency": currency,
        "downgraded_to_ngn": downgraded,
    }, "error": None}


def _verify_paystack_signature(payload: bytes, header: str | None, secret: str) -> bool:
    if not header:
        return False
    expected = hmac.new(secret.encode(), payload, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, header)


@router.post("/billing/webhook")
async def billing_webhook(request: Request):
    secret = os.environ.get("PAYSTACK_SECRET_KEY")
    if not secret:
        return JSONResponse(status_code=503, content={"success": False, "error": "Webhook not configured"})
    payload = await request.body()
    if not _verify_paystack_signature(payload, request.headers.get("x-paystack-signature"), secret):
        return JSONResponse(status_code=400, content={"success": False, "error": "Bad signature"})

    event = json.loads(payload)
    if event.get("event") == "charge.success":
        data = event.get("data") or {}
        if data.get("status") == "success":
            meta = data.get("metadata") or {}
            user_id = meta.get("user_id")
            credits = int(meta.get("credits", 0) or 0)
            reference = data.get("reference")
            if user_id and credits > 0 and reference:
                grant_once(reference, user_id, credits, f"Purchased {meta.get('package_id', '')} package")
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
