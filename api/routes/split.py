from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
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
    get_page_count,
    extract_text_per_page,
)
from services.storage_service import storage
from services.file_record_service import create_file_record, get_accessible_file_record

router = APIRouter()


class PromoteRequest(BaseModel):
    filename: str
    display_name: Optional[str] = None


class SplitRequest(BaseModel):
    file_id: str
    mode: str  # "range" | "every_n" | "selected"
    start_page: Optional[int] = None
    end_page: Optional[int] = None
    every_n: Optional[int] = None
    selected_pages: Optional[list[int]] = None


@router.post("/split")
async def split_pdf(req: SplitRequest, request: Request):
    if not get_accessible_file_record(req.file_id, request.state.user):
        return {"success": False, "data": None, "error": "File record not found"}

    def _do_split() -> dict:
        path = storage.get_upload_path(req.file_id)
        validate_pdf(path)

        if req.mode == "range":
            if req.start_page is None or req.end_page is None:
                raise ValueError("start_page and end_page required for range mode")
            result = split_by_page_range(path, req.start_page, req.end_page)
            filename = storage.save_output(result, "split.pdf")
            return {"download_url": f"/download/{filename}", "files": [filename]}

        elif req.mode == "every_n":
            if not req.every_n or req.every_n < 1:
                raise ValueError("every_n must be >= 1")
            chunks = split_every_n_pages(path, req.every_n)
            filenames = []
            for i, chunk in enumerate(chunks):
                fn = storage.save_output(chunk, f"split_part{i+1}.pdf")
                filenames.append(fn)
            if len(filenames) == 1:
                return {"download_url": f"/download/{filenames[0]}", "files": filenames}
            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w") as zf:
                for fn in filenames:
                    p = storage.get_output_path(fn)
                    zf.write(p, fn)
            zip_bytes = zip_buf.getvalue()
            zip_name = storage.save_output(zip_bytes, "split_parts.zip")
            return {"download_url": f"/download/{zip_name}", "files": filenames}

        elif req.mode == "selected":
            if not req.selected_pages:
                raise ValueError("selected_pages required for selected mode")
            result = extract_selected_pages(path, req.selected_pages)
            filename = storage.save_output(result, "split_selected.pdf")
            return {"download_url": f"/download/{filename}", "files": [filename]}

        else:
            raise ValueError(f"Unknown split mode: {req.mode}")

    # PDF splitting is synchronous CPU/disk work — keep it off the event loop
    # so one large split job can't stall every other in-flight request.
    try:
        data = await run_in_threadpool(_do_split)
        return {"success": True, "data": data, "error": None}
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except ValueError as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Split failed: {e}"}


@router.post("/split/promote")
async def promote_split_output(req: PromoteRequest, request: Request):
    """
    Turn one split-output PDF (sitting in the ephemeral outputs store) into a
    real, trackable file record — the same pipeline a manual upload goes
    through — so it can be picked up, templated, extracted, and shows up in
    the Files screen like any other document.
    """
    try:
        display_name = req.display_name or req.filename

        def _process() -> tuple[str, bytes, int]:
            output_path = storage.get_output_path(req.filename)
            content = output_path.read_bytes()
            fid = storage.save_upload(content, display_name)
            upload_path = storage.get_upload_path(fid)
            validate_pdf(upload_path)
            pc = get_page_count(upload_path)
            extract_text_per_page(upload_path)
            return fid, content, pc

        file_id, content, page_count = await run_in_threadpool(_process)
        user = request.state.user
        create_file_record(
            file_id, display_name, len(content), page_count,
            owner_id=user["id"], owner_email=user.get("email"), owner_name=user.get("name"),
        )
        return {"success": True, "data": {"file_id": file_id, "page_count": page_count}, "error": None}
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Promote failed: {e}"}
