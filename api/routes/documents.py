from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from services.ai_service import ai_group_documents
from services.pdf_service import validate_pdf
from services.storage_service import storage
from services.file_record_service import get_accessible_file_record

router = APIRouter()


class GroupDocumentsRequest(BaseModel):
    file_id: str


@router.post("/documents/group")
async def group_documents(req: GroupDocumentsRequest, request: Request):
    """
    Analyse a PDF and group its pages into logical documents.
    Each document includes:
      - document_type  (invoice types appear first)
      - pages          (1-indexed list of pages that form this document)
      - customer       (buyer / consignee / bill-to party)
      - agent          (seller / freight forwarder / notify party)
      - reference      (invoice / B/L / AWB number)
      - is_invoice     (true when document_type contains "Invoice")
    """
    if not get_accessible_file_record(req.file_id, request.state.user):
        return {"success": False, "data": None, "error": "File record not found"}

    def _group() -> dict:
        path = storage.get_upload_path(req.file_id)
        validate_pdf(path)
        return ai_group_documents(path)

    # The Claude API call inside ai_group_documents is a blocking network
    # request that can take many seconds — run it off the event loop.
    try:
        result = await run_in_threadpool(_group)
        return {"success": True, "data": result, "error": None}
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except (RuntimeError, ValueError) as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Grouping failed: {e}"}
