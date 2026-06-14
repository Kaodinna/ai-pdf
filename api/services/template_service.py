import json
import uuid
from datetime import datetime
from pathlib import Path

TEMPLATES_FILE = Path(__file__).parent.parent / "data" / "templates.json"
TEMPLATES_FILE.parent.mkdir(parents=True, exist_ok=True)


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


def create_template(
    name: str,
    template_type: str,
    direct_link_fields: list[str],
    table_fields: list[str],
    special_conditions: list[str],
) -> dict:
    template = {
        "id": str(uuid.uuid4()),
        "name": name,
        "template_type": template_type,
        "direct_link_fields": direct_link_fields,
        "table_fields": table_fields,
        "special_conditions": special_conditions,
        "created_at": datetime.utcnow().isoformat(),
    }
    templates = _load()
    templates.append(template)
    _save(templates)
    return template


def delete_template(template_id: str) -> bool:
    templates = _load()
    new_list = [t for t in templates if t["id"] != template_id]
    if len(new_list) == len(templates):
        return False
    _save(new_list)
    return True
