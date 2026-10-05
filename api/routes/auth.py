from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

from services.credit_service import grant_trial
from services.company_service import get_company, is_platform_owner
from pydantic import BaseModel
from services.auth_service import (
    authenticate, create_session, get_session_user, destroy_session,
    list_users, create_user, delete_user, get_user_by_id,
)

router = APIRouter()

SESSION_COOKIE = "session_token"


class LoginRequest(BaseModel):
    email: str
    password: str


class UserCreate(BaseModel):
    email: str
    name: str
    password: str
    role: str = "member"


def _set_session_cookie(response: Response, request: Request, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="none" if request.url.scheme == "https" else "lax",
        max_age=7 * 24 * 3600,
        path="/",
    )


@router.post("/auth/login")
async def login(body: LoginRequest, request: Request, response: Response):
    user = authenticate(body.email, body.password)
    if not user:
        return {"success": False, "data": None, "error": "Invalid email or password"}
    token = create_session(user["id"])
    _set_session_cookie(response, request, token)
    return {
        "success": True,
        "data": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]},
        "error": None,
    }


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    destroy_session(request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"success": True, "data": None, "error": None}


@router.get("/auth/me")
async def me(request: Request):
    user = get_session_user(request.cookies.get(SESSION_COOKIE))
    if not user:
        return {"success": False, "data": None, "error": "Not authenticated"}
    company = get_company(user.get("company_id"))
    return {
        "success": True,
        "data": {
            "id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"],
            "company_id": user.get("company_id"),
            "company_name": company["name"] if company else None,
            "is_platform_owner": is_platform_owner(user),
        },
        "error": None,
    }


# ── User management — admin only (enforced by the auth middleware) ─────────

@router.get("/users")
async def get_users(request: Request):
    requester = request.state.user
    users = list_users()
    if not is_platform_owner(requester):
        users = [u for u in users if u.get("company_id") == requester.get("company_id")]
    return {"success": True, "data": users, "error": None}


class CompanyUserCreate(BaseModel):
    email: str
    name: str
    password: str
    role: str = "member"
    company_id: str | None = None


@router.post("/users")
async def add_user(body: CompanyUserCreate, request: Request):
    requester = request.state.user
    if is_platform_owner(requester):
        company_id = body.company_id or requester.get("company_id")
    else:
        company_id = requester.get("company_id")
    if not get_company(company_id):
        return {"success": False, "data": None, "error": "Choose which company this user belongs to"}
    if body.role not in ("admin", "member"):
        return {"success": False, "data": None, "error": "role must be admin or member"}
    try:
        user = create_user(body.email, body.name, body.password, body.role, company_id=company_id)
        grant_trial(user["id"])
        return {"success": True, "data": user, "error": None}
    except ValueError as e:
        return {"success": False, "data": None, "error": str(e)}


@router.delete("/users/{user_id}")
async def remove_user(user_id: str, request: Request):
    requester = get_session_user(request.cookies.get(SESSION_COOKIE))
    if requester and requester["id"] == user_id:
        return {"success": False, "data": None, "error": "You can't delete your own account while logged in as it"}
    target = next((u for u in list_users() if u["id"] == user_id), None)
    if not target:
        return {"success": False, "data": None, "error": "User not found"}
    if not is_platform_owner(requester) and target.get("company_id") != requester.get("company_id"):
        return {"success": False, "data": None, "error": "User not found"}
    deleted = delete_user(user_id)
    if not deleted:
        return {"success": False, "data": None, "error": "User not found"}
    return {"success": True, "data": {"deleted": user_id}, "error": None}
