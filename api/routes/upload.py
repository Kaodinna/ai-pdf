from fastapi import APIRouter, Request, UploadFile, File
from fastapi.concurrency import run_in_threadpool

from services.conversion_service import is_supported, to_pdf_bytes, get_format
from services.pdf_service import validate_pdf, get_page_count, extract_text_per_page
from services.storage_service import storage
from services.file_record_service import create_file_record

router = APIRouter()


@router.post("/upload")
async def upload_pdf(request: Request, file: UploadFile = File(...)):
    if not file.filename or not is_supported(file.filename):
        return {
            "success": False,
            "data": None,
            "error": "Unsupported format. Accepted: PDF, PNG, JPG, TIFF, DOCX, XLSX",
        }

    try:
        raw_content = await file.read()
        fmt = get_format(file.filename)

        def _process() -> tuple[str, int, list]:
            # Convert to PDF bytes if not already a PDF
            pdf_content = to_pdf_bytes(raw_content, file.filename)

            # Store with .pdf extension so downstream services work unchanged
            if fmt == "PDF":
                save_name = file.filename
            else:
                base = file.filename.rsplit(".", 1)[0]
                save_name = f"{base}.pdf"

            fid = storage.save_upload(pdf_content, save_name)
            p = storage.get_upload_path(fid)
            validate_pdf(p)
            pc = get_page_count(p)
            pgs = extract_text_per_page(p)
            return fid, pc, pgs

        # PDF conversion/validation/extraction is synchronous CPU/disk work —
        # run it off the event loop so one big upload can't freeze every
        # other request the single-worker server is handling concurrently.
        file_id, page_count, pages = await run_in_threadpool(_process)
        user = request.state.user
        create_file_record(
            file_id, file.filename, len(raw_content), page_count,
            owner_id=user["id"], owner_email=user.get("email"), owner_name=user.get("name"),
        )

        return {
            "success": True,
            "data": {
                "file_id": file_id,
                "filename": file.filename,
                "size_bytes": len(raw_content),
                "page_count": page_count,
                "pages": pages,
                "converted_from": fmt if fmt != "PDF" else None,
            },
            "error": None,
        }
    except ValueError as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Upload failed: {e}"}
