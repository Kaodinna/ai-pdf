import json
import uuid
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
AUDIT_FILE = DATA_DIR / "audit_log.json"

MAX_ENTRIES = 5000


def _load() -> list[dict]:
    if not AUDIT_FILE.exists():
        return []
    return json.loads(AUDIT_FILE.read_text())


def _save(entries: list[dict]) -> None:
    AUDIT_FILE.write_text(json.dumps(entries, indent=2))


def log_event(
    action: str,
    entity_type: str,
    entity_id: str,
    entity_name: str = "",
    user: str = "system",
    details: dict | None = None,
) -> dict:
    entries = _load()
    entry = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.utcnow().isoformat(),
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_name": entity_name,
        "user": user,
        "details": details or {},
    }
    entries.insert(0, entry)
    if len(entries) > MAX_ENTRIES:
        entries = entries[:MAX_ENTRIES]
    _save(entries)
    return entry


def list_events(
    entity_type: str | None = None,
    entity_id: str | None = None,
    action: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[dict]:
    entries = _load()
    if entity_type:
        entries = [e for e in entries if e["entity_type"] == entity_type]
    if entity_id:
        entries = [e for e in entries if e["entity_id"] == entity_id]
    if action:
        entries = [e for e in entries if e["action"] == action]
    return entries[offset: offset + limit]


def get_summary() -> dict:
    entries = _load()
    actions: dict[str, int] = {}
    entity_types: dict[str, int] = {}
    for e in entries:
        actions[e["action"]] = actions.get(e["action"], 0) + 1
        entity_types[e["entity_type"]] = entity_types.get(e["entity_type"], 0) + 1
    return {
        "total": len(entries),
        "actions": actions,
        "entity_types": entity_types,
        "latest": entries[:5] if entries else [],
    }
