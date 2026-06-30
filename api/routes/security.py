from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from services.security_service import (
    get_config, list_roles, create_role, update_role, delete_role,
    list_users, create_user, update_user, delete_user,
    list_api_keys, create_api_key, revoke_api_key, delete_api_key,
    get_settings, update_settings, ALL_PERMISSIONS,
)

router = APIRouter()


class RoleCreate(BaseModel):
    name: str
    description: str = ""
    permissions: list[str] = []


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[list[str]] = None


class UserCreate(BaseModel):
    name: str
    email: str
    role_id: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role_id: Optional[str] = None
    active: Optional[bool] = None


class ApiKeyCreate(BaseModel):
    name: str
    role_id: str


class SettingsUpdate(BaseModel):
    require_mfa: Optional[bool] = None
    session_timeout_minutes: Optional[int] = None
    max_file_size_mb: Optional[int] = None
    allowed_file_types: Optional[list[str]] = None
    audit_log_enabled: Optional[bool] = None
    ip_whitelist_enabled: Optional[bool] = None
    ip_whitelist: Optional[list[str]] = None


@router.get("/security/config")
async def security_config():
    try:
        config = get_config()
        config["all_permissions"] = ALL_PERMISSIONS
        keys = config.get("api_keys", [])
        config["api_keys"] = [{**k, "key": k["key"][:8] + "…" + k["key"][-4:]} for k in keys]
        return {"success": True, "data": config, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


# ─── Roles ─────────────────────────────────────────────────────────────────

@router.get("/security/roles")
async def get_roles():
    return {"success": True, "data": list_roles(), "error": None}


@router.post("/security/roles")
async def save_role(body: RoleCreate):
    if not body.name.strip():
        return {"success": False, "data": None, "error": "name is required"}
    role = create_role(body.name, body.description, body.permissions)
    return {"success": True, "data": role, "error": None}


@router.put("/security/roles/{role_id}")
async def edit_role(role_id: str, body: RoleUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = update_role(role_id, updates)
    if not updated:
        return {"success": False, "data": None, "error": "Role not found"}
    return {"success": True, "data": updated, "error": None}


@router.delete("/security/roles/{role_id}")
async def remove_role(role_id: str):
    if not delete_role(role_id):
        return {"success": False, "data": None, "error": "Role not found"}
    return {"success": True, "data": {"deleted": role_id}, "error": None}


# ─── Users ─────────────────────────────────────────────────────────────────

@router.get("/security/users")
async def get_users():
    return {"success": True, "data": list_users(), "error": None}


@router.post("/security/users")
async def save_user(body: UserCreate):
    user = create_user(body.name, body.email, body.role_id)
    return {"success": True, "data": user, "error": None}


@router.put("/security/users/{user_id}")
async def edit_user(user_id: str, body: UserUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = update_user(user_id, updates)
    if not updated:
        return {"success": False, "data": None, "error": "User not found"}
    return {"success": True, "data": updated, "error": None}


@router.delete("/security/users/{user_id}")
async def remove_user(user_id: str):
    if not delete_user(user_id):
        return {"success": False, "data": None, "error": "User not found"}
    return {"success": True, "data": {"deleted": user_id}, "error": None}


# ─── API Keys ──────────────────────────────────────────────────────────────

@router.get("/security/api-keys")
async def get_api_keys():
    return {"success": True, "data": list_api_keys(), "error": None}


@router.post("/security/api-keys")
async def create_key(body: ApiKeyCreate):
    key = create_api_key(body.name, body.role_id)
    return {"success": True, "data": key, "error": None}


@router.patch("/security/api-keys/{key_id}/revoke")
async def revoke_key(key_id: str):
    if not revoke_api_key(key_id):
        return {"success": False, "data": None, "error": "Key not found"}
    return {"success": True, "data": {"revoked": key_id}, "error": None}


@router.delete("/security/api-keys/{key_id}")
async def remove_key(key_id: str):
    if not delete_api_key(key_id):
        return {"success": False, "data": None, "error": "Key not found"}
    return {"success": True, "data": {"deleted": key_id}, "error": None}


# ─── Settings ──────────────────────────────────────────────────────────────

@router.get("/security/settings")
async def read_settings():
    return {"success": True, "data": get_settings(), "error": None}


@router.put("/security/settings")
async def write_settings(body: SettingsUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    saved = update_settings(updates)
    return {"success": True, "data": saved, "error": None}
