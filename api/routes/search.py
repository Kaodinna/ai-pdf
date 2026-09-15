from fastapi import APIRouter, Request

from services.file_record_service import list_file_records_for
from services.inbox_service import list_inbox

router = APIRouter()

MAX_RESULTS = 8


@router.get("/search")
async def global_search(request: Request, q: str = ""):
    query = q.strip().lower()
    if not query:
        return {"success": True, "data": {"files": [], "inbox": []}, "error": None}

    files = [
        {"id": r["id"], "filename": r["filename"], "template_name": r.get("template_name")}
        for r in list_file_records_for(request.state.user)
        if query in r["filename"].lower()
        or query in (r.get("template_name") or "").lower()
        or query in (r.get("template_type") or "").lower()
    ][:MAX_RESULTS]

    inbox = [
        {"id": r["id"], "subject": r["subject"], "from": r["from"]}
        for r in list_inbox()
        if query in r["subject"].lower() or query in r["from"].lower()
    ][:MAX_RESULTS]

    return {"success": True, "data": {"files": files, "inbox": inbox}, "error": None}
