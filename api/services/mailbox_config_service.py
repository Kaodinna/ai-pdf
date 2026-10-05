"""
CRUD store for user-managed mailboxes (one IMAP account per document type).
Each mailbox can be tied to a template — attachments ingested from it are
automatically tagged with that template so they show up pre-sorted in the
File Dashboard, no manual "detect template" step needed.
"""

import json
import uuid
from datetime import datetime
from pathlib import Path

MAILBOXES_FILE = Path(__file__).parent.parent / "data" / "mailboxes.json"
MAILBOXES_FILE.parent.mkdir(parents=True, exist_ok=True)


def _load() -> list[dict]:
    if not MAILBOXES_FILE.exists():
        return []
    return json.loads(MAILBOXES_FILE.read_text())


def _save(mailboxes: list[dict]) -> None:
    MAILBOXES_FILE.write_text(json.dumps(mailboxes, indent=2))


def _seed_from_env_if_empty() -> None:
    """One-time migration: if no mailboxes are configured yet but the legacy
    single-mailbox env vars are set, seed one entry so existing setups keep
    working without the user having to redo anything through the new UI."""
    import os
    if MAILBOXES_FILE.exists():
        return
    user = os.environ.get("MAILBOX_USER")
    password = os.environ.get("MAILBOX_PASSWORD")
    if not (user and password):
        return
    _save([{
        "id": str(uuid.uuid4()),
        "label": "Primary Inbox",
        "host": os.environ.get("MAILBOX_HOST", "imap.gmail.com"),
        "port": int(os.environ.get("MAILBOX_PORT", "993")),
        "user": user,
        "password": password,
        "template_id": None,
        "template_name": None,
        "enabled": True,
        "created_at": datetime.utcnow().isoformat(),
    }])


def list_mailboxes(include_password: bool = False, company_id: str | None = None) -> list[dict]:
    _seed_from_env_if_empty()
    boxes = _load()
    if company_id is not None:
        boxes = [b for b in boxes if b.get("company_id") == company_id]
    if include_password:
        return boxes
    return [{k: v for k, v in b.items() if k != "password"} for b in boxes]


def get_mailbox(mailbox_id: str) -> dict | None:
    return next((b for b in _load() if b["id"] == mailbox_id), None)


def create_mailbox(
    label: str,
    host: str,
    port: int,
    user: str,
    password: str,
    template_id: str | None = None,
    template_name: str | None = None,
    company_id: str | None = None,
) -> dict:
    mailbox = {
        "company_id": company_id,
        "id": str(uuid.uuid4()),
        "label": label,
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "template_id": template_id,
        "template_name": template_name,
        "enabled": True,
        "created_at": datetime.utcnow().isoformat(),
    }
    boxes = _load()
    boxes.append(mailbox)
    _save(boxes)
    return {k: v for k, v in mailbox.items() if k != "password"}


def update_mailbox(mailbox_id: str, updates: dict) -> dict | None:
    boxes = _load()
    for i, b in enumerate(boxes):
        if b["id"] == mailbox_id:
            # Empty/omitted password in an update means "keep the existing one"
            if not updates.get("password"):
                updates = {k: v for k, v in updates.items() if k != "password"}
            boxes[i] = {**b, **updates}
            _save(boxes)
            return {k: v for k, v in boxes[i].items() if k != "password"}
    return None


def delete_mailbox(mailbox_id: str) -> bool:
    boxes = _load()
    new_boxes = [b for b in boxes if b["id"] != mailbox_id]
    if len(new_boxes) == len(boxes):
        return False
    _save(new_boxes)
    return True
