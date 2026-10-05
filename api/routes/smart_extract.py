from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from services.reducto_extraction_service import reducto_smart_extract
from services.credit_service import Reservation, pages_cost
from services.metrics_service import increment
from services.pdf_service import validate_pdf
from services.storage_service import storage
from services.file_record_service import update_file_record, get_accessible_file_record
from services.audit_service import log_event
from services.approval_settings_service import get_settings, all_fields_cleared, should_auto_reject

router = APIRouter()


class SmartExtractRequest(BaseModel):
    file_id: str
    page_numbers: Optional[list[int]] = None


@router.post("/smart-extract")
async def smart_extract(body: SmartExtractRequest, request: Request):
    try:
        record = get_accessible_file_record(body.file_id, request.state.user)
        if not record:
            return {"success": False, "data": None, "error": "File record not found"}
        user_id = request.state.user["id"]
        estimated = len(body.page_numbers) if body.page_numbers else (record.get("page_count") or 1)

        def _run() -> dict:
            path = storage.get_upload_path(body.file_id)
            validate_pdf(path)
            with Reservation(user_id, pages_cost(estimated), "Smart Extract", body.file_id) as r:
                result = reducto_smart_extract(path, body.page_numbers)
                r.actual = pages_cost(len(result.get("pages", [])))
            return result

        # Reducto's call is a blocking network request — run it off the event loop.
        result = await run_in_threadpool(_run)
        pages = result.get("pages", [])

        doc_type = next((p["document_type"] for p in pages if p.get("document_type")), None)
        all_doc_types = sorted({p["document_type"] for p in pages if p.get("document_type")})

        auto_rejected = should_auto_reject(all_doc_types)
        auto_approved = (
            not auto_rejected
            and get_settings().get("auto_approve_enabled", False)
            and all_fields_cleared(pages)
        )
        file_updates = {
            "template_id": None,
            "template_name": doc_type or "Smart Extract",
            "template_type": doc_type,
            "extracted_at": datetime.utcnow().isoformat(),
            "pages": pages,
        }
        if auto_rejected:
            file_updates["decision"] = "rejected"
        elif auto_approved:
            file_updates["decision"] = "approved"

        update_file_record(body.file_id, file_updates)
        log_event("extracted", "file", body.file_id,
                  entity_name=doc_type or "Smart Extract",
                  details={"mode": "template_less", "document_type": doc_type, "pages": len(pages)})
        increment("pages_extracted_reducto", len(pages))
        if auto_rejected:
            log_event("auto_rejected", "file", body.file_id,
                      entity_name=doc_type or "Smart Extract",
                      details={"reason": "all document types matched the auto-reject list", "document_types": all_doc_types})
        elif auto_approved:
            log_event("auto_approved", "file", body.file_id,
                      entity_name=doc_type or "Smart Extract",
                      details={"reason": "all fields cleared the auto-approve threshold"})

        decision = "rejected" if auto_rejected else ("approved" if auto_approved else None)
        return {"success": True, "data": {**result, "decision": decision}, "error": None}
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except (RuntimeError, ValueError) as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Smart extraction failed: {e}"}
