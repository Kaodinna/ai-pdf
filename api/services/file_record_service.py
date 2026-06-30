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


def create_file_record(
    file_id: str,
    filename: str,
    size_bytes: int,
    page_count: int,
) -> dict:
    record = {
        "id": file_id,
        "filename": filename,
        "size_bytes": size_bytes,
        "page_count": page_count,
        "template_id": None,
        "template_name": None,
        "template_type": None,
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
