from fastapi import APIRouter, UploadFile, File

from services.conversion_service import is_supported, to_pdf_bytes, get_format
from services.pdf_service import validate_pdf, get_page_count, extract_text_per_page
from services.storage_service import storage
from services.file_record_service import create_file_record

router = APIRouter()


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not is_supported(file.filename):
        return {
            "success": False,
            "data": None,
            "error": "Unsupported format. Accepted: PDF, PNG, JPG, TIFF, DOCX, XLSX",
        }

    try:
        raw_content = await file.read()
        fmt = get_format(file.filename)

        # Convert to PDF bytes if not already a PDF
        pdf_content = to_pdf_bytes(raw_content, file.filename)

        # Store with .pdf extension so downstream services work unchanged
        if fmt == "PDF":
            save_name = file.filename
        else:
            base = file.filename.rsplit(".", 1)[0]
            save_name = f"{base}.pdf"

        file_id = storage.save_upload(pdf_content, save_name)
        path = storage.get_upload_path(file_id)
        validate_pdf(path)
        page_count = get_page_count(path)
        pages = extract_text_per_page(path)
        create_file_record(file_id, file.filename, len(raw_content), page_count)

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
