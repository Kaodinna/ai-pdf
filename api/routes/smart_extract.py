from datetime import datetime
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from services.ai_service import ai_smart_extract
from services.pdf_service import validate_pdf
from services.storage_service import storage
from services.file_record_service import update_file_record
from services.audit_service import log_event

router = APIRouter()


class SmartExtractRequest(BaseModel):
    file_id: str
    page_numbers: Optional[list[int]] = None


@router.post("/smart-extract")
async def smart_extract(body: SmartExtractRequest):
    try:
        path = storage.get_upload_path(body.file_id)
        validate_pdf(path)

        result = ai_smart_extract(path, body.page_numbers)
        pages = result.get("pages", [])

        doc_type = next((p["document_type"] for p in pages if p.get("document_type")), None)

        update_file_record(body.file_id, {
            "template_id": None,
            "template_name": doc_type or "Smart Extract",
            "template_type": doc_type,
            "extracted_at": datetime.utcnow().isoformat(),
            "pages": pages,
        })
        log_event("extracted", "file", body.file_id,
                  entity_name=doc_type or "Smart Extract",
                  details={"mode": "template_less", "document_type": doc_type, "pages": len(pages)})

        return {"success": True, "data": result, "error": None}
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except (RuntimeError, ValueError) as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Smart extraction failed: {e}"}
