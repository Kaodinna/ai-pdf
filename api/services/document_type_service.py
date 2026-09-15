import json
import uuid
from datetime import datetime
from pathlib import Path

DOC_TYPES_FILE = Path(__file__).parent.parent / "data" / "document_types.json"
DOC_TYPES_FILE.parent.mkdir(parents=True, exist_ok=True)

DEFAULT_TYPES = [
    {"document_type": "Credit Note", "abbreviation": "CN"},
    {"document_type": "Debit Note", "abbreviation": "DN"},
    {"document_type": "Delivery Note", "abbreviation": "DL"},
    {"document_type": "Email Body", "abbreviation": "EB"},
    {"document_type": "Invoice", "abbreviation": "INV"},
    {"document_type": "Other", "abbreviation": "UND"},
]


def _seed() -> list[dict]:
    now = datetime.utcnow().isoformat()
    return [
        {
            "id": str(uuid.uuid4()),
            "document_type": t["document_type"],
            "client_document_type": "",
            "abbreviation": t["abbreviation"],
            "keywords": [],
            "description": "",
            "allow_processing": t["abbreviation"] in ("CN", "INV"),
            "created_at": now,
            "updated_at": now,
        }
        for t in DEFAULT_TYPES
    ]


def _load() -> list[dict]:
    if not DOC_TYPES_FILE.exists():
        seeded = _seed()
        _save(seeded)
        return seeded
    return json.loads(DOC_TYPES_FILE.read_text())


def _save(doc_types: list[dict]) -> None:
    DOC_TYPES_FILE.write_text(json.dumps(doc_types, indent=2))


def list_doc_types() -> list[dict]:
    return _load()


def get_doc_type(doc_type_id: str) -> dict | None:
    return next((d for d in _load() if d["id"] == doc_type_id), None)


def create_doc_type(
    document_type: str,
    abbreviation: str,
    client_document_type: str = "",
    keywords: list[str] | None = None,
    description: str = "",
    allow_processing: bool = False,
) -> dict:
    doc_type = {
        "id": str(uuid.uuid4()),
        "document_type": document_type,
        "client_document_type": client_document_type,
        "abbreviation": abbreviation,
        "keywords": keywords or [],
        "description": description,
        "allow_processing": allow_processing,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    doc_types = _load()
    doc_types.append(doc_type)
    _save(doc_types)
    return doc_type


def update_doc_type(doc_type_id: str, updates: dict) -> dict | None:
    doc_types = _load()
    for i, d in enumerate(doc_types):
        if d["id"] == doc_type_id:
            doc_types[i] = {**d, **updates, "updated_at": datetime.utcnow().isoformat()}
            _save(doc_types)
            return doc_types[i]
    return None


def delete_doc_type(doc_type_id: str) -> bool:
    doc_types = _load()
    new_list = [d for d in doc_types if d["id"] != doc_type_id]
    if len(new_list) == len(doc_types):
        return False
    _save(new_list)
    return True
