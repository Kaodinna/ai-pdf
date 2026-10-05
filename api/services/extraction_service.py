"""
Shared "extract a file against a template and apply the result" pipeline —
used by the manual re-extract endpoint (routes/templates.py) and by Smart
Inbox auto-extraction (mailbox_service.py), so both paths run the exact same
rule-triggering / auto-approve / auto-reject / audit-logging logic instead of
drifting apart.
"""

from datetime import datetime

from services.template_service import get_template
from services.reducto_extraction_service import reducto_extract_template_fields
from services.pdf_service import validate_pdf
from services.storage_service import storage
from services.file_record_service import update_file_record, get_file_record
from contextlib import nullcontext

from services.credit_service import billing_account_for_file, Reservation, pages_cost
from services.rule_service import list_rules
from services.rule_engine import run_rules_on_file
from services.audit_service import log_event
from services.metrics_service import increment
from services.request_context import company_scope
from services.approval_settings_service import get_settings, all_fields_cleared, should_auto_reject


def run_template_extraction(
    template_id: str,
    file_id: str,
    page_numbers: list[int] | None = None,
    user_id: str | None = None,
) -> dict:
    template = get_template(template_id)
    if not template:
        raise ValueError("Template not found")
    with company_scope(template.get("company_id")):
        return _run_template_extraction(template, template_id, file_id, page_numbers, user_id)


def _run_template_extraction(template, template_id, file_id, page_numbers, user_id):
    """Extract `file_id` against `template_id`, persist the result onto the
    file record, run on_extraction automation rules and auto-approve/reject,
    and return the same payload the /extract-data route hands to the
    frontend. Raises (ValueError / FileNotFoundError / RuntimeError) on
    failure — callers decide how to surface that: an HTTP error response for
    the manual endpoint, a swallowed per-attachment warning during
    unattended mailbox ingestion."""
    template = get_template(template_id)
    if not template:
        raise ValueError("Template not found")

    record = get_file_record(file_id) or {}
    payer = user_id or billing_account_for_file(record)
    estimated_pages = len(page_numbers) if page_numbers else (record.get("page_count") or 1)
    path = storage.get_upload_path(file_id)
    validate_pdf(path)
    reservation = Reservation(payer, pages_cost(estimated_pages), "Template extraction", file_id) if payer else nullcontext()
    with reservation as r:
        result = reducto_extract_template_fields(path, template, page_numbers)
        if payer:
            r.actual = pages_cost(len(result.get("pages", [])))

    slim_pages = result.get("pages", [])
    file_updates = {
        "template_id": template_id,
        "template_name": template.get("name", ""),
        "template_type": template.get("template_type", ""),
        "extracted_at": datetime.utcnow().isoformat(),
        "pages": slim_pages,
    }

    on_extraction_rules = list_rules("on_extraction")
    triggered = run_rules_on_file(on_extraction_rules, slim_pages)
    for t in triggered:
        file_updates.update(t.get("applied_updates", {}))
    rule_names = [t["name"] for t in triggered]

    doc_type = template.get("template_type")
    auto_rejected = should_auto_reject([doc_type] if doc_type else [])
    auto_approved = (
        not auto_rejected
        and get_settings().get("auto_approve_enabled", False)
        and all_fields_cleared(slim_pages)
    )
    if auto_rejected:
        file_updates["decision"] = "rejected"
    elif auto_approved:
        file_updates["decision"] = "approved"

    update_file_record(file_id, file_updates)
    log_event("extracted", "file", file_id,
              entity_name=template.get("name", ""),
              details={"template_id": template_id, "rules_triggered": rule_names,
                       "pages": len(slim_pages)})
    increment("pages_extracted_reducto", len(slim_pages))
    if auto_rejected:
        log_event("auto_rejected", "file", file_id,
                  entity_name=template.get("name", ""),
                  details={"reason": "document type matched the auto-reject list", "document_type": doc_type})
    elif auto_approved:
        log_event("auto_approved", "file", file_id,
                  entity_name=template.get("name", ""),
                  details={"reason": "all fields cleared the auto-approve threshold"})

    decision = "rejected" if auto_rejected else ("approved" if auto_approved else None)
    return {
        "template_id": template_id,
        "template_name": template.get("name", ""),
        "template_type": template.get("template_type", ""),
        "rules_triggered": rule_names,
        "decision": decision,
        **result,
    }
