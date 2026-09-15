"""
Simple, dependency-free auth: pbkdf2 password hashing (stdlib) + server-side
sessions keyed by an opaque token, stored in api/data alongside everything
else. No public signup — accounts are created by an admin only. The very
first admin is seeded from ADMIN_EMAIL/ADMIN_PASSWORD env vars the first time
the app runs with no users yet (same bootstrap pattern used for mailboxes).
"""

import hashlib
import json
import os
import secrets
import uuid
from datetime import datetime, timedelta
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
USERS_FILE = DATA_DIR / "users.json"
SESSIONS_FILE = DATA_DIR / "sessions.json"
DATA_DIR.mkdir(parents=True, exist_ok=True)

SESSION_TTL = timedelta(days=7)
PBKDF2_ITERATIONS = 200_000


def _load(path: Path) -> list | dict:
    if not path.exists():
        return [] if path == USERS_FILE else {}
    return json.loads(path.read_text())


def _save(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2))


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"{salt.hex()}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, _ = stored.split("$", 1)
    except ValueError:
        return False
    return secrets.compare_digest(_hash_password(password, bytes.fromhex(salt_hex)), stored)


def _seed_admin_if_empty() -> None:
    if USERS_FILE.exists():
        return
    email = os.environ.get("ADMIN_EMAIL")
    password = os.environ.get("ADMIN_PASSWORD")
    if not (email and password):
        return
    _save(USERS_FILE, [{
        "id": str(uuid.uuid4()),
        "email": email.strip().lower(),
        "name": "Admin",
        "password_hash": _hash_password(password),
        "role": "admin",
        "created_at": datetime.utcnow().isoformat(),
    }])


def list_users() -> list[dict]:
    _seed_admin_if_empty()
    return [{k: v for k, v in u.items() if k != "password_hash"} for u in _load(USERS_FILE)]


def get_user_by_email(email: str) -> dict | None:
    _seed_admin_if_empty()
    email = email.strip().lower()
    return next((u for u in _load(USERS_FILE) if u["email"] == email), None)


def get_user_by_id(user_id: str) -> dict | None:
    return next((u for u in _load(USERS_FILE) if u["id"] == user_id), None)


def create_user(email: str, name: str, password: str, role: str = "member") -> dict:
    users = _load(USERS_FILE)
    email = email.strip().lower()
    if any(u["email"] == email for u in users):
        raise ValueError(f"A user with email {email} already exists")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": name.strip(),
        "password_hash": _hash_password(password),
        "role": role,
        "created_at": datetime.utcnow().isoformat(),
    }
    users.append(user)
    _save(USERS_FILE, users)
    return {k: v for k, v in user.items() if k != "password_hash"}


def delete_user(user_id: str) -> bool:
    users = _load(USERS_FILE)
    new_users = [u for u in users if u["id"] != user_id]
    if len(new_users) == len(users):
        return False
    _save(USERS_FILE, new_users)
    # Also invalidate any active sessions for this user.
    sessions = _load(SESSIONS_FILE)
    sessions = {t: s for t, s in sessions.items() if s["user_id"] != user_id}
    _save(SESSIONS_FILE, sessions)
    return True


def authenticate(email: str, password: str) -> dict | None:
    user = get_user_by_email(email)
    if not user or not _verify_password(password, user["password_hash"]):
        return None
    return user


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    sessions = _load(SESSIONS_FILE)
    sessions[token] = {
        "user_id": user_id,
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": (datetime.utcnow() + SESSION_TTL).isoformat(),
    }
    _save(SESSIONS_FILE, sessions)
    return token


def get_session_user(token: str | None) -> dict | None:
    if not token:
        return None
    sessions = _load(SESSIONS_FILE)
    session = sessions.get(token)
    if not session:
        return None
    if datetime.fromisoformat(session["expires_at"]) < datetime.utcnow():
        del sessions[token]
        _save(SESSIONS_FILE, sessions)
        return None
    return get_user_by_id(session["user_id"])


def destroy_session(token: str | None) -> None:
    if not token:
        return
    sessions = _load(SESSIONS_FILE)
    if token in sessions:
        del sessions[token]
        _save(SESSIONS_FILE, sessions)
