import json
import uuid
from datetime import datetime
from pathlib import Path

RECORDS_FILE = Path(__file__).parent.parent / "data" / "files.json"
RECORDS_FILE.parent.mkdir(parents=True, exist_ok=True)


def _load() -> list[dict]:
    if not RECORDS_FILE.exists():
        return []
    return json.loads(RECORDS_FILE.read_text())


def _save(records: list[dict]) -> None:
    RECORDS_FILE.write_text(json.dumps(records, indent=2))


def list_file_records() -> list[dict]:
    return sorted(_load(), key=lambda r: r.get("uploaded_at", ""), reverse=True)


def get_file_record(file_id: str) -> dict | None:
    return next((r for r in _load() if r["id"] == file_id), None)


from services.company_service import is_platform_owner


def can_access(record: dict, user: dict) -> bool:
    """Companies are walled off from each other: nothing crosses a company
    boundary except for the platform owner. Inside a company, an admin sees
    every file; everyone else sees only files they own or that are assigned to
    them. Unowned files (e.g. mailbox ingestion) are admin-only until claimed."""
    if not record or not user:
        return False
    if is_platform_owner(user):
        return True
    if not record.get("company_id") or record.get("company_id") != user.get("company_id"):
        return False
    if user.get("role") == "admin":
        return True
    if record.get("owner_id") and record["owner_id"] == user.get("id"):
        return True
    assigned = (record.get("assigned_to") or "").strip().lower()
    if assigned and assigned in {(user.get("email") or "").lower(), (user.get("name") or "").lower()}:
        return True
    return False


def list_file_records_for(user: dict) -> list[dict]:
    return [r for r in list_file_records() if can_access(r, user)]


def get_accessible_file_record(file_id: str, user: dict) -> dict | None:
    record = get_file_record(file_id)
    return record if record and can_access(record, user) else None


def create_file_record(
    file_id: str,
    filename: str,
    size_bytes: int,
    page_count: int,
    owner_id: str | None = None,
    owner_email: str | None = None,
    owner_name: str | None = None,
    company_id: str | None = None,
) -> dict:
    record = {
        "id": file_id,
        "filename": filename,
        "size_bytes": size_bytes,
        "page_count": page_count,
        # None owner (e.g. mailbox-ingested files) means no single app-user
        # created it — access.can_access() treats those as admin-only until
        # someone claims/assigns it.
        "company_id": company_id,
        "owner_id": owner_id,
        "owner_email": owner_email,
        "owner_name": owner_name,
        "template_id": None,
        "template_name": None,
        "template_type": None,
        "suggested_template_id": None,
        "suggested_template_name": None,
        "status": "New",
        "uploaded_at": datetime.utcnow().isoformat(),
        "extracted_at": None,
        "pages": [],
    }
    records = _load()
    records.append(record)
    _save(records)
    return record


def update_file_record(file_id: str, updates: dict) -> dict | None:
    records = _load()
    for i, r in enumerate(records):
        if r["id"] == file_id:
            records[i] = {**r, **updates}
            _save(records)
            return records[i]
    return None


def delete_file_record(file_id: str) -> bool:
    records = _load()
    new_list = [r for r in records if r["id"] != file_id]
    if len(new_list) == len(records):
        return False
    _save(new_list)
    return True


def add_comment(file_id: str, user: str, text: str) -> dict | None:
    records = _load()
    for i, r in enumerate(records):
        if r["id"] == file_id:
            comment = {
                "id": str(uuid.uuid4()),
                "user": user,
                "text": text,
                "timestamp": datetime.utcnow().isoformat(),
            }
            comments = list(r.get("comments", []))
            comments.insert(0, comment)
            records[i] = {**r, "comments": comments}
            _save(records)
            return comment
    return None


def list_comments(file_id: str) -> list[dict]:
    r = get_file_record(file_id)
    return r.get("comments", []) if r else []
