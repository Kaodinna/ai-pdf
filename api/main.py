from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from routes.upload import router as upload_router
from routes.split import router as split_router
from routes.merge import router as merge_router
from routes.ai_plan import router as ai_plan_router
from routes.templates import router as templates_router
from routes.shipping import router as shipping_router
from routes.documents import router as documents_router
from routes.files import router as files_router
from routes.workflow import router as workflow_router
from routes.rules import router as rules_router
from routes.library import router as library_router
from routes.learning import router as learning_router
from routes.security import router as security_router
from routes.export import router as export_router
from routes.audit import router as audit_router
from routes.duplicates import router as duplicates_router
from routes.approvals import router as approvals_router
from routes.smart_extract import router as smart_extract_router
from routes.reconciliation import router as reconciliation_router
from services.storage_service import OUTPUT_DIR

app = FastAPI(title="AI PDF API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)
app.include_router(split_router)
app.include_router(merge_router)
app.include_router(ai_plan_router)
app.include_router(templates_router)
app.include_router(shipping_router)
app.include_router(documents_router)
app.include_router(files_router)
app.include_router(workflow_router)
app.include_router(rules_router)
app.include_router(library_router)
app.include_router(learning_router)
app.include_router(security_router)
app.include_router(export_router)
app.include_router(audit_router)
app.include_router(duplicates_router)
app.include_router(approvals_router)
app.include_router(smart_extract_router)
app.include_router(reconciliation_router)


@app.get("/download/{filename}")
async def download_file(filename: str):
    path = OUTPUT_DIR / filename
    if not path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    media_type = "application/zip" if filename.endswith(".zip") else "application/pdf"
    return FileResponse(str(path), media_type=media_type, filename=filename)


@app.get("/preview/{file_id}")
async def preview_pdf(file_id: str):
    from fastapi import HTTPException
    from services.storage_service import storage
    try:
        path = storage.get_upload_path(file_id)
        return FileResponse(str(path), media_type="application/pdf")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")


@app.get("/health")
async def health():
    return {"status": "ok"}
