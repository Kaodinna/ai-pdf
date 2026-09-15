import json
import uuid
from datetime import datetime
from pathlib import Path

INBOX_FILE = Path(__file__).parent.parent / "data" / "inbox.json"
INBOX_FILE.parent.mkdir(parents=True, exist_ok=True)


def _load() -> list[dict]:
    if not INBOX_FILE.exists():
        return []
    return json.loads(INBOX_FILE.read_text())


def _save(records: list[dict]) -> None:
    INBOX_FILE.write_text(json.dumps(records, indent=2))


def list_inbox() -> list[dict]:
    return sorted(_load(), key=lambda r: r.get("received_at", ""), reverse=True)


def get_inbox_record(inbox_id: str) -> dict | None:
    return next((r for r in _load() if r["id"] == inbox_id), None)


def create_inbox_record(
    sender: str,
    subject: str,
    received_at: str,
    body_preview: str,
    file_ids: list[str],
    page_count: int,
) -> dict:
    record = {
        "id": str(uuid.uuid4()),
        "from": sender,
        "subject": subject,
        "received_at": received_at,
        "body_preview": body_preview,
        "file_ids": file_ids,
        "attachment_count": len(file_ids),
        "page_count": page_count,
        "status": "To Review" if file_ids else "No Attachment",
        "assigned_to": None,
        "tags": [],
        "created_at": datetime.utcnow().isoformat(),
    }
    records = _load()
    records.append(record)
    _save(records)
    return record


def update_inbox_record(inbox_id: str, updates: dict) -> dict | None:
    records = _load()
    for i, r in enumerate(records):
        if r["id"] == inbox_id:
            records[i] = {**r, **updates}
            _save(records)
            return records[i]
    return None
