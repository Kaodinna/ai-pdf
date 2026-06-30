import json
import uuid
from datetime import datetime
from pathlib import Path

RULES_FILE = Path(__file__).parent.parent / "data" / "rules.json"
RULES_FILE.parent.mkdir(parents=True, exist_ok=True)

TRIGGER_TYPES = [
    "on_extraction",
    "on_file_creation",
    "on_file_upload",
    "on_export",
    "on_email_queue_send",
    "on_email_reply",
]

CONDITION_OPERATORS = [
    "equals", "not_equals", "contains", "not_contains",
    "is_null", "is_not_null", "starts_with", "ends_with",
]

ACTION_TYPES = ["set_status", "set_field"]


def _load() -> list[dict]:
    if not RULES_FILE.exists():
        return []
    return json.loads(RULES_FILE.read_text())


def _save(rules: list[dict]) -> None:
    RULES_FILE.write_text(json.dumps(rules, indent=2))


def list_rules(trigger_type: str | None = None) -> list[dict]:
    rules = sorted(_load(), key=lambda r: r.get("sequence", 999))
    if trigger_type:
        rules = [r for r in rules if r.get("trigger_type") == trigger_type]
    return rules


def get_rule(rule_id: str) -> dict | None:
    return next((r for r in _load() if r["id"] == rule_id), None)


def create_rule(
    name: str,
    trigger_type: str,
    logic_operator: str,
    conditions: list[dict],
    actions: list[dict],
    description: str = "",
    created_by: str = "",
) -> dict:
    rules = _load()
    same_type = [r for r in rules if r.get("trigger_type") == trigger_type]
    rule = {
        "id": str(uuid.uuid4()),
        "name": name,
        "trigger_type": trigger_type,
        "logic_operator": logic_operator.upper(),
        "conditions": conditions,
        "actions": actions,
        "description": description,
        "created_by": created_by,
        "active": True,
        "sequence": len(same_type) + 1,
        "created_at": datetime.utcnow().isoformat(),
    }
    rules.append(rule)
    _save(rules)
    return rule


def update_rule(rule_id: str, updates: dict) -> dict | None:
    rules = _load()
    for i, r in enumerate(rules):
        if r["id"] == rule_id:
            rules[i] = {**r, **updates}
            _save(rules)
            return rules[i]
    return None


def toggle_rule(rule_id: str) -> dict | None:
    rules = _load()
    for i, r in enumerate(rules):
        if r["id"] == rule_id:
            rules[i] = {**r, "active": not r.get("active", True)}
            _save(rules)
            return rules[i]
    return None


def delete_rule(rule_id: str) -> bool:
    rules = _load()
    new_list = [r for r in rules if r["id"] != rule_id]
    if len(new_list) == len(rules):
        return False
    _save(new_list)
    return True
