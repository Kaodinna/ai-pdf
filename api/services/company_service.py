"""
Companies (customers). Every user belongs to exactly one company, and every
stored record (files, templates, ...) carries the company it belongs to.

The platform owner is not stored in data. It's the account whose email is in
PLATFORM_OWNER_EMAIL, so granting cross-company access always needs a deliberate
config change, never a data edit.
"""

import json
import os
import threading
import uuid
from datetime import datetime
from pathlib import Path

COMPANIES_FILE = Path(__file__).parent.parent / "data" / "companies.json"
COMPANIES_FILE.parent.mkdir(parents=True, exist_ok=True)
LEGACY_NAME = "Legacy (data from before company separation)"

_lock = threading.Lock()


def _load() -> list[dict]:
    if not COMPANIES_FILE.exists():
        return []
    return json.loads(COMPANIES_FILE.read_text())


def _save(companies: list[dict]) -> None:
    COMPANIES_FILE.write_text(json.dumps(companies, indent=2))


def list_companies() -> list[dict]:
    return _load()


def get_company(company_id: str | None) -> dict | None:
    if not company_id:
        return None
    return next((c for c in _load() if c["id"] == company_id), None)


def create_company(name: str) -> dict:
    name = name.strip()
    if not name:
        raise ValueError("Company name is required")
    with _lock:
        companies = _load()
        if any(c["name"].lower() == name.lower() for c in companies):
            raise ValueError(f"A company named '{name}' already exists")
        company = {"id": str(uuid.uuid4()), "name": name, "created_at": datetime.utcnow().isoformat()}
        companies.append(company)
        _save(companies)
    return company


def is_platform_owner(user: dict | None) -> bool:
    owner = (os.environ.get("PLATFORM_OWNER_EMAIL") or "").strip().lower()
    return bool(user and owner and (user.get("email") or "").lower() == owner)


def ensure_legacy_company() -> str:
    """Before separation, everything belonged to one shared workspace. Keep that
    data together under a single Legacy company, and attach any user or record
    that has no company yet. Idempotent: running it again changes nothing."""
    from services.auth_service import _load as load_users, _save as save_users, USERS_FILE
    from services.file_record_service import RECORDS_FILE
    from services.template_service import TEMPLATES_FILE

    with _lock:
        companies = _load()
        legacy = next((c for c in companies if c["name"] == LEGACY_NAME), None)
        if legacy is None:
            legacy = {"id": str(uuid.uuid4()), "name": LEGACY_NAME, "created_at": datetime.utcnow().isoformat()}
            companies.append(legacy)
            _save(companies)

    users = load_users(USERS_FILE)
    changed = False
    for u in users:
        if not u.get("company_id") and not is_platform_owner(u):
            u["company_id"] = legacy["id"]
            changed = True
    if changed:
        save_users(USERS_FILE, users)

    from services.mailbox_config_service import MAILBOXES_FILE
    from services.inbox_service import INBOX_FILE
    from services.audit_service import AUDIT_FILE
    from services.ai_memory_service import MEMORIES_FILE
    from services.security_service import SECURITY_FILE
    if SECURITY_FILE.exists():
        security = json.loads(SECURITY_FILE.read_text())
        if "roles" in security:
            SECURITY_FILE.write_text(json.dumps({legacy["id"]: security}, indent=2))

    for path in (RECORDS_FILE, TEMPLATES_FILE, MAILBOXES_FILE, INBOX_FILE, AUDIT_FILE, MEMORIES_FILE):
        if not path.exists():
            continue
        items = json.loads(path.read_text())
        dirty = False
        for item in items:
            if not item.get("company_id"):
                item["company_id"] = legacy["id"]
                dirty = True
        if dirty:
            path.write_text(json.dumps(items, indent=2))
    return legacy["id"]
