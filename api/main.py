import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
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
from routes.settings import router as settings_router
from routes.ai_memories import router as ai_memories_router
from routes.document_types import router as document_types_router
from routes.inbox import router as inbox_router
from routes.search import router as search_router
from routes.mailboxes import router as mailboxes_router
from routes.auth import router as auth_router, SESSION_COOKIE
from services.storage_service import OUTPUT_DIR
from services.auth_service import get_session_user

app = FastAPI(title="AI PDF API", version="1.0.0")

# ── Auth ─────────────────────────────────────────────────────────────────
# Every route requires a valid session by default — allowlist the few that
# don't (login itself, health checks) rather than opting each route in one
# by one, so nothing new can slip through unprotected by accident.
_PUBLIC_PATHS = {"/health", "/auth/login"}


@app.middleware("http")
async def require_auth(request: Request, call_next):
    if request.method == "OPTIONS" or request.url.path in _PUBLIC_PATHS:
        return await call_next(request)

    user = get_session_user(request.cookies.get(SESSION_COOKIE))
    if not user:
        return JSONResponse(status_code=401, content={"success": False, "data": None, "error": "Not authenticated"})

    if request.url.path.startswith("/users") and user.get("role") != "admin":
        return JSONResponse(status_code=403, content={"success": False, "data": None, "error": "Admin access required"})

    request.state.user = user
    return await call_next(request)


# CORSMiddleware is added AFTER require_auth so it ends up as the outermost
# layer (Starlette wraps middleware in reverse registration order) — that
# way it can attach CORS headers to every response, including the 401/403
# ones require_auth short-circuits directly, not just successful ones. Added
# before that, a blocked cross-origin request comes back with no CORS
# headers at all, the browser treats it as a CORS failure instead of a clean
# 401, and fetch() rejects instead of resolving — which is exactly what
# left the frontend stuck on a permanent "Loading…" screen.
_default_origins = "http://localhost:3000,http://localhost:3001,http://localhost:3002"
_allowed_origins = [
    o.strip() for o in os.environ.get("CORS_ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
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
app.include_router(settings_router)
app.include_router(ai_memories_router)
app.include_router(document_types_router)
app.include_router(inbox_router)
app.include_router(search_router)
app.include_router(mailboxes_router)


@app.get("/download/{filename}")
async def download_file(filename: str):
    path = OUTPUT_DIR / filename
    if not path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    media_type = "application/zip" if filename.endswith(".zip") else "application/pdf"
    return FileResponse(str(path), media_type=media_type, filename=filename)


@app.get("/preview/{file_id}")
async def preview_pdf(file_id: str, request: Request):
    from fastapi import HTTPException
    from services.storage_service import storage
    from services.file_record_service import get_accessible_file_record
    if not get_accessible_file_record(file_id, request.state.user):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        path = storage.get_upload_path(file_id)
        return FileResponse(str(path), media_type="application/pdf")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.on_event("startup")
async def start_mailbox_polling():
    import asyncio
    from services.mailbox_service import is_configured, fetch_and_ingest

    async def poll_loop():
        loop = asyncio.get_event_loop()
        while True:
            if is_configured():
                try:
                    await loop.run_in_executor(None, fetch_and_ingest)
                except Exception as e:
                    print(f"[mailbox poll] failed: {e}")
            await asyncio.sleep(60)

    asyncio.create_task(poll_loop())
