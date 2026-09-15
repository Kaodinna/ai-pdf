from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional

from services.pdf_service import validate_pdf, merge_pdfs, merge_pdfs_skip_blank
from services.storage_service import storage
from services.file_record_service import get_accessible_file_record

router = APIRouter()


class MergeRequest(BaseModel):
    file_ids: list[str]
    page_selections: Optional[list[Optional[list[int]]]] = None
    skip_blank: bool = False


@router.post("/merge")
async def merge_pdfs_endpoint(req: MergeRequest, request: Request):
    if len(req.file_ids) < 1:
        return {"success": False, "data": None, "error": "At least one file_id required"}

    for fid in req.file_ids:
        if not get_accessible_file_record(fid, request.state.user):
            return {"success": False, "data": None, "error": "File record not found"}

    def _do_merge() -> str:
        paths = []
        for fid in req.file_ids:
            p = storage.get_upload_path(fid)
            validate_pdf(p)
            paths.append(p)

        if req.skip_blank:
            result = merge_pdfs_skip_blank(paths)
        else:
            selections = req.page_selections or [None] * len(paths)
            result = merge_pdfs(paths, selections)

        return storage.save_output(result, "merged.pdf")

    # Merging is synchronous CPU/disk work — keep it off the event loop.
    try:
        filename = await run_in_threadpool(_do_merge)
        return {
            "success": True,
            "data": {"download_url": f"/download/{filename}", "filename": filename},
            "error": None,
        }
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Merge failed: {e}"}
