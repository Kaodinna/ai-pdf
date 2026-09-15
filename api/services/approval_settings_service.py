import json
from pathlib import Path

SETTINGS_FILE = Path(__file__).parent.parent / "data" / "settings.json"
SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)

DEFAULTS = {
    "auto_approve_enabled": False,
    "auto_approve_threshold": 90,
    "auto_reject_enabled": False,
    "auto_reject_doc_types": [],
}


def get_settings() -> dict:
    if not SETTINGS_FILE.exists():
        return dict(DEFAULTS)
    stored = json.loads(SETTINGS_FILE.read_text())
    return {**DEFAULTS, **stored}


def update_settings(updates: dict) -> dict:
    current = get_settings()
    current.update({k: v for k, v in updates.items() if v is not None})
    SETTINGS_FILE.write_text(json.dumps(current, indent=2))
    return current


def should_auto_reject(doc_types: list[str]) -> bool:
    """True if auto-reject is on, at least one doc type was found, and every one is in the rejected set."""
    settings = get_settings()
    if not settings.get("auto_reject_enabled", False):
        return False
    rejected = {t.lower() for t in settings.get("auto_reject_doc_types", [])}
    found = [t for t in doc_types if t]
    if not found or not rejected:
        return False
    return all(t.lower() in rejected for t in found)


def all_fields_cleared(pages: list[dict]) -> bool:
    """True if the record has at least one extracted field and every field's status is 'approved'."""
    any_field = False
    for page in pages:
        for fname in (page.get("fields") or {}):
            any_field = True
            meta = (page.get("field_meta") or {}).get(fname, {})
            if meta.get("status") != "approved":
                return False
    return any_field
