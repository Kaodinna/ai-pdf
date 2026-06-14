from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from services.pdf_service import validate_pdf, merge_pdfs, merge_pdfs_skip_blank
from services.storage_service import storage

router = APIRouter()


class MergeRequest(BaseModel):
    file_ids: list[str]
    page_selections: Optional[list[Optional[list[int]]]] = None
    skip_blank: bool = False


@router.post("/merge")
async def merge_pdfs_endpoint(req: MergeRequest):
    if len(req.file_ids) < 1:
        return {"success": False, "data": None, "error": "At least one file_id required"}

    try:
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

        filename = storage.save_output(result, "merged.pdf")
        return {
            "success": True,
            "data": {"download_url": f"/download/{filename}", "filename": filename},
            "error": None,
        }
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Merge failed: {e}"}
