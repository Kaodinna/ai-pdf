import json
import uuid
from datetime import datetime
from pathlib import Path

from services.file_record_service import list_file_records_for
from services.audit_service import list_events

ROUTES_FILE = Path(__file__).parent.parent / "data" / "approval_routes.json"
ROUTES_FILE.parent.mkdir(parents=True, exist_ok=True)


def _load() -> list[dict]:
    if not ROUTES_FILE.exists():
        return []
    return json.loads(ROUTES_FILE.read_text())


def _save(routes: list[dict]) -> None:
    ROUTES_FILE.write_text(json.dumps(routes, indent=2))


def list_routes() -> list[dict]:
    return _load()


def get_route_for_state(state_name: str) -> dict | None:
    return next((r for r in _load() if r["state_name"] == state_name), None)


def create_route(state_name: str, approver: str, escalation_hours: int | None = None) -> dict:
    routes = _load()
    routes = [r for r in routes if r["state_name"] != state_name]
    route = {
        "id": str(uuid.uuid4()),
        "state_name": state_name,
        "approver": approver,
        "escalation_hours": escalation_hours,
    }
    routes.append(route)
    _save(routes)
    return route


def delete_route(route_id: str) -> bool:
    routes = _load()
    new_list = [r for r in routes if r["id"] != route_id]
    if len(new_list) == len(routes):
        return False
    _save(new_list)
    return True


def _entered_state_at(file_id: str, state_name: str) -> str | None:
    events = list_events(entity_type="file", entity_id=file_id, action="status_changed", limit=500)
    for e in events:
        if e.get("details", {}).get("to") == state_name:
            return e["timestamp"]
    return None


def list_pending_approvals(user: dict) -> list[dict]:
    routes = {r["state_name"]: r for r in _load()}
    if not routes:
        return []
    pending = []
    now = datetime.utcnow()
    for record in list_file_records_for(user):
        route = routes.get(record.get("status"))
        if not route:
            continue
        entered_at = _entered_state_at(record["id"], record["status"]) or record.get("uploaded_at")
        hours_waiting = None
        overdue = False
        if entered_at:
            hours_waiting = round((now - datetime.fromisoformat(entered_at)).total_seconds() / 3600, 1)
            if route.get("escalation_hours") is not None:
                overdue = hours_waiting >= route["escalation_hours"]
        pending.append({
            "file_id": record["id"],
            "filename": record["filename"],
            "status": record["status"],
            "assigned_to": record.get("assigned_to"),
            "approver": route["approver"],
            "entered_at": entered_at,
            "hours_waiting": hours_waiting,
            "escalation_hours": route.get("escalation_hours"),
            "overdue": overdue,
        })
    pending.sort(key=lambda p: p["hours_waiting"] or 0, reverse=True)
    return pending
