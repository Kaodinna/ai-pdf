"""
IMAP mailbox polling. Uses only stdlib (imaplib/email) — no extra dependency.
Each new message becomes one Smart Inbox record; each supported attachment is
ingested through the exact same pipeline as a manual upload (convert -> save ->
validate -> extract text -> create file record), so it shows up in File
Dashboard identically either way.

Supports multiple mailboxes (one IMAP account per document type, managed via
the /mailboxes API) — each polled independently, with its own last-seen-UID
checkpoint. A mailbox tied to a template auto-extracts every file it ingests
against that template, so mail routed to "invoices@..." lands already read
and pre-sorted, no manual "match a template" step needed. A mailbox with no
template assigned still ingests the raw file for manual review, same as
before.
"""

import email
import imaplib
import json
from datetime import datetime
from email.header import decode_header
from email.utils import parsedate_to_datetime
from pathlib import Path

from services.conversion_service import is_supported, to_pdf_bytes, get_format
from services.pdf_service import validate_pdf, get_page_count, extract_text_per_page
from services.storage_service import storage
from services.file_record_service import create_file_record, update_file_record
from services.inbox_service import create_inbox_record
from services.audit_service import log_event
from services.mailbox_config_service import list_mailboxes
from services.request_context import company_scope
from services.extraction_service import run_template_extraction

STATE_FILE = Path(__file__).parent.parent / "data" / "mailbox_state.json"
STATE_FILE.parent.mkdir(parents=True, exist_ok=True)


def is_configured() -> bool:
    return any(b.get("enabled", True) for b in list_mailboxes())


def _load_state() -> dict:
    if not STATE_FILE.exists():
        return {}
    raw = json.loads(STATE_FILE.read_text())
    # Migrate the old single-mailbox shape ({"last_uid": N}) into the
    # per-mailbox shape transparently, keyed by the seeded "Primary Inbox".
    if "last_uid" in raw:
        boxes = list_mailboxes()
        primary = next((b for b in boxes if b["label"] == "Primary Inbox"), None)
        if primary:
            return {primary["id"]: raw["last_uid"]}
        return {}
    return raw


def _save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2))


def _decode(value: str | None) -> str:
    if not value:
        return ""
    parts = decode_header(value)
    out = []
    for text, enc in parts:
        if isinstance(text, bytes):
            out.append(text.decode(enc or "utf-8", errors="replace"))
        else:
            out.append(text)
    return "".join(out)


def _extract_body_preview(msg: email.message.Message, limit: int = 500) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and not part.get_filename():
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode(part.get_content_charset() or "utf-8", errors="replace")[:limit]
        return ""
    payload = msg.get_payload(decode=True)
    if payload:
        return payload.decode(msg.get_content_charset() or "utf-8", errors="replace")[:limit]
    return ""


def _ingest_attachment(filename: str, content: bytes, template_id: str | None, template_name: str | None, company_id: str | None = None) -> tuple[str, int] | None:
    """Run one attachment through the same pipeline as a manual upload. Returns (file_id, page_count) or None if unsupported."""
    if not filename or not is_supported(filename):
        return None
    fmt = get_format(filename)
    pdf_content = to_pdf_bytes(content, filename)
    save_name = filename if fmt == "PDF" else f"{filename.rsplit('.', 1)[0]}.pdf"
    file_id = storage.save_upload(pdf_content, save_name)
    path = storage.get_upload_path(file_id)
    validate_pdf(path)
    page_count = get_page_count(path)
    extract_text_per_page(path)
    create_file_record(file_id, filename, len(content), page_count, company_id=company_id)
    if template_id:
        try:
            # The mailbox this attachment arrived on is mapped to a template
            # (e.g. billoflading@... -> "Bill of Lading") — extract right
            # away so the file lands in File Dashboard already read, with a
            # document preview and field data, instead of sitting as a bare
            # upload waiting for someone to manually match/detect a template.
            run_template_extraction(template_id, file_id)
        except Exception as e:
            # A bad match / transient AI failure shouldn't drop the email or
            # the attachment — fall back to the old behavior: the file still
            # lands in the dashboard, just untagged and unextracted, for
            # manual review.
            update_file_record(file_id, {"template_id": template_id, "template_name": template_name})
            log_event("mailbox_auto_extract_failed", "file", file_id,
                      entity_name=template_name or template_id,
                      details={"reason": str(e)})
    return file_id, page_count


def _poll_one_mailbox(box: dict, state: dict) -> dict:
    """Poll a single mailbox, ingest anything new, and return its summary."""
    conn = imaplib.IMAP4_SSL(box["host"], box["port"])
    try:
        conn.login(box["user"], box["password"])
        conn.select("INBOX")

        typ, data = conn.uid("search", None, "ALL")
        if typ != "OK":
            raise RuntimeError(f"IMAP search failed for {box['label']}: {typ}")
        all_uids = [int(u) for u in data[0].split()] if data and data[0] else []

        last_uid = state.get(box["id"])
        if last_uid is None:
            # First activation for this mailbox: baseline, don't backfill history.
            state[box["id"]] = max(all_uids) if all_uids else 0
            return {"checked": 0, "ingested": 0, "new_files": 0, "first_run": True}

        new_uids = [u for u in all_uids if u > last_uid]
        ingested = 0
        new_files = 0

        for uid in new_uids:
            typ, msg_data = conn.uid("fetch", str(uid), "(RFC822)")
            if typ != "OK" or not msg_data or not msg_data[0]:
                continue
            raw = msg_data[0][1]
            msg = email.message_from_bytes(raw)

            sender = _decode(msg.get("From"))
            subject = _decode(msg.get("Subject")) or "(no subject)"
            try:
                received_at = parsedate_to_datetime(msg.get("Date")).isoformat()
            except Exception:
                received_at = datetime.utcnow().isoformat()
            body_preview = _extract_body_preview(msg)

            file_ids: list[str] = []
            total_pages = 0
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_content_disposition() != "attachment":
                        continue
                    filename = _decode(part.get_filename())
                    payload = part.get_payload(decode=True)
                    if not filename or not payload:
                        continue
                    try:
                        result = _ingest_attachment(filename, payload, box.get("template_id"), box.get("template_name"), box.get("company_id"))
                        if result:
                            fid, page_count = result
                            file_ids.append(fid)
                            total_pages += page_count
                            new_files += 1
                    except Exception:
                        continue  # one bad attachment shouldn't drop the whole email

            create_inbox_record(sender, subject, received_at, body_preview, file_ids, total_pages, company_id=box.get("company_id"))
            ingested += 1

        state[box["id"]] = max(new_uids) if new_uids else last_uid
        return {"checked": len(new_uids), "ingested": ingested, "new_files": new_files, "first_run": False}
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def fetch_and_ingest(company_id: str | None = None) -> dict:
    """Poll every enabled mailbox and ingest anything new. Returns a combined summary."""
    boxes = [b for b in list_mailboxes(include_password=True) if b.get("enabled", True) and (company_id is None or b.get("company_id") == company_id)]
    if not boxes:
        raise RuntimeError("No mailboxes are configured — add one under Inbox > Manage Mailboxes")

    state = _load_state()
    totals = {"checked": 0, "ingested": 0, "new_files": 0, "first_run": False}
    errors: list[str] = []

    for box in boxes:
        try:
            with company_scope(box.get("company_id")):
                result = _poll_one_mailbox(box, state)
            totals["checked"] += result["checked"]
            totals["ingested"] += result["ingested"]
            totals["new_files"] += result["new_files"]
            totals["first_run"] = totals["first_run"] or result["first_run"]
        except Exception as e:
            errors.append(f"{box['label']}: {e}")

    _save_state(state)
    if totals["ingested"]:
        log_event("mail_ingested", "inbox", "batch", entity_name=f"{totals['ingested']} email(s)",
                  details={"ingested": totals["ingested"], "new_files": totals["new_files"], "mailboxes": len(boxes)})
    if errors:
        totals["errors"] = errors
    return totals
