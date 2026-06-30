import json
import uuid
from pathlib import Path

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


def list_states() -> list[dict]:
    return sorted(_load(), key=lambda s: s.get("order", 0))


def add_state(name: str) -> dict:
    states = _load()
    new_state = {"id": str(uuid.uuid4()), "name": name, "order": len(states)}
    states.append(new_state)
    _save(states)
    return new_state


def update_state(state_id: str, name: str) -> dict | None:
    states = _load()
    for i, s in enumerate(states):
        if s["id"] == state_id:
            states[i] = {**s, "name": name}
            _save(states)
            return states[i]
    return None


def delete_state(state_id: str) -> bool:
    states = _load()
    new_list = [s for s in states if s["id"] != state_id]
    if len(new_list) == len(states):
        return False
    for i, s in enumerate(new_list):
        s["order"] = i
    _save(new_list)
    return True


def reorder_states(ordered_ids: list[str]) -> list[dict]:
    states = _load()
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
    _save(reordered)
    return sorted(reordered, key=lambda s: s["order"])
