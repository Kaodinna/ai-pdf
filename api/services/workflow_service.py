import json
import uuid
from pathlib import Path

from services.request_context import current_company, visible

WORKFLOW_FILE = Path(__file__).parent.parent / "data" / "workflow.json"
WORKFLOW_FILE.parent.mkdir(parents=True, exist_ok=True)

DEFAULT_STATES = [
    {"id": "state-new",          "name": "New",          "order": 0},
    {"id": "state-validation",   "name": "Validation",   "order": 1},
    {"id": "state-pre-approved", "name": "Pre-Approved", "order": 2},
    {"id": "state-approved",     "name": "Approved",     "order": 3},
    {"id": "state-rejected",     "name": "Rejected",     "order": 4},
]


def _load() -> list[dict]:
    if not WORKFLOW_FILE.exists():
        _save(DEFAULT_STATES)
        return list(DEFAULT_STATES)
    return json.loads(WORKFLOW_FILE.read_text())


def _save(states: list[dict]) -> None:
    WORKFLOW_FILE.write_text(json.dumps(states, indent=2))


def _visible_states(states: list[dict]) -> list[dict]:
    return [s for s in states if visible(s)]


def _ensure_company_defaults() -> None:
    """A company's first use of workflow gets its own copy of the default stages."""
    company = current_company.get()
    if not company or _visible_states(_load()):
        return
    states = _load()
    for i, d in enumerate(DEFAULT_STATES):
        states.append({**d, "id": str(uuid.uuid4()), "company_id": company, "order": i})
    _save(states)


def list_states() -> list[dict]:
    _ensure_company_defaults()
    return sorted(_visible_states(_load()), key=lambda s: s.get("order", 0))


def add_state(name: str) -> dict:
    _ensure_company_defaults()
    states = _load()
    mine = _visible_states(states)
    new_state = {"id": str(uuid.uuid4()), "name": name, "order": len(mine), "company_id": current_company.get()}
    states.append(new_state)
    _save(states)
    return new_state


def update_state(state_id: str, name: str) -> dict | None:
    states = _load()
    for i, s in enumerate(states):
        if s["id"] == state_id and visible(s):
            states[i] = {**s, "name": name}
            _save(states)
            return states[i]
    return None


def delete_state(state_id: str) -> bool:
    states = _load()
    new_list = [s for s in states if not (s["id"] == state_id and visible(s))]
    if len(new_list) == len(states):
        return False
    order = 0
    for s in new_list:
        if visible(s):
            s["order"] = order
            order += 1
    _save(new_list)
    return True


def reorder_states(ordered_ids: list[str]) -> list[dict]:
    all_states = _load()
    states = _visible_states(all_states)
    by_id = {s["id"]: s for s in states}
    reordered = []
    for i, sid in enumerate(ordered_ids):
        if sid in by_id:
            reordered.append({**by_id[sid], "order": i})
    # Append any states not in ordered_ids at the end
    seen = {s["id"] for s in reordered}
    for s in states:
        if s["id"] not in seen:
            reordered.append({**s, "order": len(reordered)})
    others = [s for s in all_states if not visible(s)]
    _save(others + reordered)
    return sorted(reordered, key=lambda s: s["order"])
