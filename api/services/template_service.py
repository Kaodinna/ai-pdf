import json
import uuid
from datetime import datetime
from pathlib import Path

TEMPLATES_FILE = Path(__file__).parent.parent / "data" / "templates.json"
TEMPLATES_FILE.parent.mkdir(parents=True, exist_ok=True)

DATA_TYPES = ("Text", "Date", "Number", "Currency", "Boolean")


def _empty_field_entry() -> dict:
    return {
        "description": "",
        "required": False,
        "data_type": "Text",
        "data_type_restriction": "",
        "synonyms": [],
        "library_derived": None,   # {library_id, match_field, return_field} | None
        "doc_type_priority": None, # str | None — sub-type this field belongs to
        "display_doc_audit": True,
        "add_separator_below": False,
    }


def _load() -> list[dict]:
    if not TEMPLATES_FILE.exists():
        return []
    return json.loads(TEMPLATES_FILE.read_text())


def _save(templates: list[dict]) -> None:
    TEMPLATES_FILE.write_text(json.dumps(templates, indent=2))


def list_templates() -> list[dict]:
    return _load()


def get_template(template_id: str) -> dict | None:
    return next((t for t in _load() if t["id"] == template_id), None)


def keyword_match_template(text: str, templates: list[dict]) -> dict | None:
    """
    Free, no-AI template match: score each template by how many of its field
    labels (weighted heavily toward unique_id_fields) appear as substrings in
    already-extracted page text. Returns the template dict only when there's a
    single confident winner — ambiguous or weak matches return None so the
    caller can fall back to the AI-based detector instead of guessing.
    """
    haystack = (text or "").lower()
    if not haystack.strip():
        return None

    def keywords(t: dict) -> set[str]:
        labels = list(t.get("direct_link_fields", [])) + list(t.get("unique_id_fields", []))
        for syns in (t.get("field_synonyms") or {}).values():
            labels.extend(syns)
        return {l.lower() for l in labels if l and len(l) > 2}

    scored = []
    for t in templates:
        unique_labels = {f.lower() for f in t.get("unique_id_fields", []) if f}
        direct_labels = keywords(t)
        unique_hits = sum(1 for k in unique_labels if k in haystack)
        direct_hits = sum(1 for k in direct_labels if k in haystack)
        if not unique_labels or unique_hits == 0:
            continue  # no confident anchor for this template — don't even consider it
        score = unique_hits * 10 + direct_hits
        scored.append((score, t))

    if not scored:
        return None
    scored.sort(key=lambda x: x[0], reverse=True)
    if len(scored) > 1 and scored[0][0] == scored[1][0]:
        return None  # tie — genuinely ambiguous, let the AI path disambiguate
    return scored[0][1]


def create_template(
    name: str,
    template_type: str,
    direct_link_fields: list[str],
    table_fields: list[str],
    special_conditions: list[str],
    field_synonyms: dict | None = None,
    field_config: dict | None = None,
    table_config: dict | None = None,
    unique_id_fields: list[str] | None = None,
    secondary_id_fields: list[str] | None = None,
    reference_id_fields: list[str] | None = None,
    editable_in_file: bool = True,
    extraction_engine: str = "claude",
) -> dict:
    fc: dict = {}
    for fname in direct_link_fields:
        entry = dict(_empty_field_entry())
        if field_config and fname in field_config:
            entry.update(field_config[fname])
        if not entry["synonyms"] and field_synonyms and fname in field_synonyms:
            entry["synonyms"] = field_synonyms[fname]
        fc[fname] = entry

    tc: dict = {}
    for fname in table_fields:
        entry = dict(_empty_field_entry())
        if table_config and fname in table_config:
            entry.update(table_config[fname])
        tc[fname] = entry

    template = {
        "id": str(uuid.uuid4()),
        "name": name,
        "template_type": template_type,
        "direct_link_fields": direct_link_fields,
        "table_fields": table_fields,
        "special_conditions": special_conditions,
        "field_synonyms": field_synonyms or {},
        "field_config": fc,
        "table_config": tc,
        "unique_id_fields": unique_id_fields or [],
        "secondary_id_fields": secondary_id_fields or [],
        "reference_id_fields": reference_id_fields or [],
        "editable_in_file": editable_in_file,
        "extraction_engine": extraction_engine,
        "comments": [],
        "created_at": datetime.utcnow().isoformat(),
    }
    templates = _load()
    templates.append(template)
    _save(templates)
    return template


def update_template(template_id: str, updates: dict) -> dict | None:
    templates = _load()
    for i, t in enumerate(templates):
        if t["id"] == template_id:
            # Merge field_config / table_config at the per-field level so existing
            # fields not in the update payload are preserved.
            if "field_config" in updates and isinstance(updates["field_config"], dict):
                merged_fc = dict(t.get("field_config", {}))
                for fname, cfg in updates["field_config"].items():
                    merged_fc[fname] = {**_empty_field_entry(), **merged_fc.get(fname, {}), **cfg}
                updates = {**updates, "field_config": merged_fc}
            if "table_config" in updates and isinstance(updates["table_config"], dict):
                merged_tc = dict(t.get("table_config", {}))
                for fname, cfg in updates["table_config"].items():
                    merged_tc[fname] = {**_empty_field_entry(), **merged_tc.get(fname, {}), **cfg}
                updates = {**updates, "table_config": merged_tc}
            templates[i] = {**t, **updates}
            _save(templates)
            return templates[i]
    return None


def delete_template(template_id: str) -> bool:
    templates = _load()
    new_list = [t for t in templates if t["id"] != template_id]
    if len(new_list) == len(templates):
        return False
    _save(new_list)
    return True


def copy_field_config_from(target_id: str, source_id: str) -> dict | None:
    source = get_template(source_id)
    if not source:
        return None
    updates = {
        "field_config": source.get("field_config", {}),
        "table_config": source.get("table_config", {}),
    }
    return update_template(target_id, updates)


def add_comment(template_id: str, user: str, text: str) -> dict | None:
    templates = _load()
    for i, t in enumerate(templates):
        if t["id"] == template_id:
            comment = {
                "id": str(uuid.uuid4()),
                "user": user,
                "text": text,
                "timestamp": datetime.utcnow().isoformat(),
            }
            comments = list(t.get("comments", []))
            comments.insert(0, comment)
            templates[i] = {**t, "comments": comments}
            _save(templates)
            return comment
    return None


def list_comments(template_id: str) -> list[dict]:
    t = get_template(template_id)
    return t.get("comments", []) if t else []
