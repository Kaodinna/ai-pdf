from fastapi import APIRouter, UploadFile, File, HTTPException

from services.pdf_service import validate_pdf, get_page_count, extract_text_per_page
from services.storage_service import storage

router = APIRouter()


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        return {"success": False, "data": None, "error": "Only PDF files are accepted"}

    try:
        content = await file.read()
        file_id = storage.save_upload(content, file.filename)
        path = storage.get_upload_path(file_id)
        validate_pdf(path)
        page_count = get_page_count(path)
        pages = extract_text_per_page(path)
        return {
            "success": True,
            "data": {
                "file_id": file_id,
                "filename": file.filename,
                "size_bytes": len(content),
                "page_count": page_count,
                "pages": pages,
            },
            "error": None,
        }
    except ValueError as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Upload failed: {e}"}
