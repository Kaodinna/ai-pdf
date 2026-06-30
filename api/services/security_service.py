import json
import uuid
import hashlib
import secrets
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
SECURITY_FILE = DATA_DIR / "security.json"

DEFAULT_CONFIG = {
    "roles": [
        {"id": "role-admin", "name": "Admin", "description": "Full access to all features", "permissions": ["*"]},
        {"id": "role-reviewer", "name": "Reviewer", "description": "Can view and approve/reject files", "permissions": ["files.read", "files.status", "templates.read"]},
        {"id": "role-viewer", "name": "Viewer", "description": "Read-only access to files", "permissions": ["files.read", "templates.read"]},
    ],
    "users": [
        {"id": str(uuid.uuid4()), "name": "Admin User", "email": "admin@example.com", "role_id": "role-admin", "active": True, "created_at": datetime.utcnow().isoformat()},
    ],
    "api_keys": [],
    "settings": {
        "require_mfa": False,
        "session_timeout_minutes": 60,
        "max_file_size_mb": 100,
        "allowed_file_types": ["pdf"],
        "audit_log_enabled": True,
        "ip_whitelist_enabled": False,
        "ip_whitelist": [],
    },
}

ALL_PERMISSIONS = [
    "files.read", "files.write", "files.delete", "files.status",
    "templates.read", "templates.write", "templates.delete",
    "rules.read", "rules.write", "rules.delete",
    "workflow.read", "workflow.write",
    "library.read", "library.write", "library.delete",
    "users.read", "users.write",
    "settings.read", "settings.write",
]


def _load() -> dict:
    if not SECURITY_FILE.exists():
        _save(DEFAULT_CONFIG)
        return DEFAULT_CONFIG
    return json.loads(SECURITY_FILE.read_text())


def _save(config: dict) -> None:
    SECURITY_FILE.write_text(json.dumps(config, indent=2))


def get_config() -> dict:
    return _load()


# ─── Roles ─────────────────────────────────────────────────────────────────

def list_roles() -> list[dict]:
    return _load()["roles"]


def create_role(name: str, description: str, permissions: list[str]) -> dict:
    config = _load()
    role = {"id": str(uuid.uuid4()), "name": name, "description": description, "permissions": permissions}
    config["roles"].append(role)
    _save(config)
    return role


def update_role(role_id: str, updates: dict) -> dict | None:
    config = _load()
    for role in config["roles"]:
        if role["id"] == role_id:
            for k, v in updates.items():
                if k != "id":
                    role[k] = v
            _save(config)
            return role
    return None


def delete_role(role_id: str) -> bool:
    config = _load()
    original = len(config["roles"])
    config["roles"] = [r for r in config["roles"] if r["id"] != role_id]
    if len(config["roles"]) == original:
        return False
    _save(config)
    return True


# ─── Users ─────────────────────────────────────────────────────────────────

def list_users() -> list[dict]:
    return _load()["users"]


def create_user(name: str, email: str, role_id: str) -> dict:
    config = _load()
    user = {
        "id": str(uuid.uuid4()), "name": name, "email": email,
        "role_id": role_id, "active": True,
        "created_at": datetime.utcnow().isoformat(),
    }
    config["users"].append(user)
    _save(config)
    return user


def update_user(user_id: str, updates: dict) -> dict | None:
    config = _load()
    for user in config["users"]:
        if user["id"] == user_id:
            for k, v in updates.items():
                if k not in ("id", "created_at"):
                    user[k] = v
            _save(config)
            return user
    return None


def delete_user(user_id: str) -> bool:
    config = _load()
    original = len(config["users"])
    config["users"] = [u for u in config["users"] if u["id"] != user_id]
    if len(config["users"]) == original:
        return False
    _save(config)
    return True


# ─── API Keys ──────────────────────────────────────────────────────────────

def list_api_keys() -> list[dict]:
    keys = _load()["api_keys"]
    return [{**k, "key": k["key"][:8] + "…" + k["key"][-4:]} for k in keys]


def create_api_key(name: str, role_id: str) -> dict:
    config = _load()
    raw_key = "sk_" + secrets.token_hex(24)
    key = {
        "id": str(uuid.uuid4()), "name": name, "role_id": role_id,
        "key": raw_key, "key_hash": hashlib.sha256(raw_key.encode()).hexdigest(),
        "active": True, "created_at": datetime.utcnow().isoformat(), "last_used": None,
    }
    config["api_keys"].append(key)
    _save(config)
    return key


def revoke_api_key(key_id: str) -> bool:
    config = _load()
    for key in config["api_keys"]:
        if key["id"] == key_id:
            key["active"] = False
            _save(config)
            return True
    return False


def delete_api_key(key_id: str) -> bool:
    config = _load()
    original = len(config["api_keys"])
    config["api_keys"] = [k for k in config["api_keys"] if k["id"] != key_id]
    if len(config["api_keys"]) == original:
        return False
    _save(config)
    return True


# ─── Settings ──────────────────────────────────────────────────────────────

def get_settings() -> dict:
    return _load()["settings"]


def update_settings(updates: dict) -> dict:
    config = _load()
    config["settings"].update(updates)
    _save(config)
    return config["settings"]
