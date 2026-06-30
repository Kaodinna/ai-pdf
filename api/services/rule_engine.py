"""Evaluate rules against extracted document data and apply actions."""


def _evaluate_condition(cond: dict, data: dict) -> bool:
    field = cond.get("field", "")
    op = cond.get("operator", "equals")
    value = str(cond.get("value", ""))
    raw = data.get(field)
    field_str = str(raw).lower() if raw is not None else ""
    val_lower = value.lower()

    if op == "equals":        return field_str == val_lower
    if op == "not_equals":    return field_str != val_lower
    if op == "contains":      return val_lower in field_str
    if op == "not_contains":  return val_lower not in field_str
    if op == "is_null":       return raw is None or raw == ""
    if op == "is_not_null":   return raw is not None and raw != ""
    if op == "starts_with":   return field_str.startswith(val_lower)
    if op == "ends_with":     return field_str.endswith(val_lower)
    return False


def evaluate_rule(rule: dict, data: dict) -> bool:
    """Return True if the rule's conditions match the flat field dict."""
    conditions = rule.get("conditions", [])
    if not conditions:
        return False
    logic = rule.get("logic_operator", "AND").upper()
    results = [_evaluate_condition(c, data) for c in conditions]
    return any(results) if logic == "OR" else all(results)


def collect_field_data(pages: list[dict]) -> dict:
    """Flatten extracted fields from all pages into a single dict (first non-null wins)."""
    flat: dict = {}
    for page in pages:
        for k, v in (page.get("fields") or {}).items():
            if flat.get(k) is None and v is not None:
                flat[k] = v
    return flat


def apply_rule_actions(rule: dict) -> dict:
    """Return file_record update dict from a triggered rule."""
    updates: dict = {}
    for action in rule.get("actions", []):
        if action.get("type") == "set_status":
            updates["status"] = action.get("value", "")
    return updates


def run_rules_on_file(rules: list[dict], pages: list[dict]) -> list[dict]:
    """
    Evaluate all active rules against the extracted pages.
    Returns list of triggered rule dicts with an 'applied_updates' key.
    """
    data = collect_field_data(pages)
    triggered = []
    for rule in rules:
        if not rule.get("active", True):
            continue
        if evaluate_rule(rule, data):
            triggered.append({**rule, "applied_updates": apply_rule_actions(rule)})
    return triggered
