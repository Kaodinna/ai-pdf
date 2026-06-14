from fastapi import APIRouter
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import zipfile
import io
import uuid
from pathlib import Path

from services.pdf_service import (
    validate_pdf,
    split_by_page_range,
    split_every_n_pages,
    extract_selected_pages,
)
from services.storage_service import storage

router = APIRouter()


class SplitRequest(BaseModel):
    file_id: str
    mode: str  # "range" | "every_n" | "selected"
    start_page: Optional[int] = None
    end_page: Optional[int] = None
    every_n: Optional[int] = None
    selected_pages: Optional[list[int]] = None


@router.post("/split")
async def split_pdf(req: SplitRequest):
    try:
        path = storage.get_upload_path(req.file_id)
        validate_pdf(path)

        if req.mode == "range":
            if req.start_page is None or req.end_page is None:
                return {"success": False, "data": None, "error": "start_page and end_page required for range mode"}
            result = split_by_page_range(path, req.start_page, req.end_page)
            filename = storage.save_output(result, "split.pdf")
            return {"success": True, "data": {"download_url": f"/download/{filename}", "files": [filename]}, "error": None}

        elif req.mode == "every_n":
            if not req.every_n or req.every_n < 1:
                return {"success": False, "data": None, "error": "every_n must be >= 1"}
            chunks = split_every_n_pages(path, req.every_n)
            filenames = []
            for i, chunk in enumerate(chunks):
                fn = storage.save_output(chunk, f"split_part{i+1}.pdf")
                filenames.append(fn)
            if len(filenames) == 1:
                return {"success": True, "data": {"download_url": f"/download/{filenames[0]}", "files": filenames}, "error": None}
            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w") as zf:
                for fn in filenames:
                    p = storage.get_output_path(fn)
                    zf.write(p, fn)
            zip_bytes = zip_buf.getvalue()
            zip_name = storage.save_output(zip_bytes, "split_parts.zip")
            return {"success": True, "data": {"download_url": f"/download/{zip_name}", "files": filenames}, "error": None}

        elif req.mode == "selected":
            if not req.selected_pages:
                return {"success": False, "data": None, "error": "selected_pages required for selected mode"}
            result = extract_selected_pages(path, req.selected_pages)
            filename = storage.save_output(result, "split_selected.pdf")
            return {"success": True, "data": {"download_url": f"/download/{filename}", "files": [filename]}, "error": None}

        else:
            return {"success": False, "data": None, "error": f"Unknown split mode: {req.mode}"}

    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Split failed: {e}"}
