from typing import Optional

from fastapi import APIRouter, Request
from services.company_service import is_platform_owner
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from services.inbox_service import list_inbox, get_inbox_record, update_inbox_record
from services.mailbox_service import fetch_and_ingest, is_configured
from services.mailbox_config_service import list_mailboxes

router = APIRouter()


def _scope(request: Request) -> str | None:
    user = request.state.user
    if is_platform_owner(user):
        return None
    # A caller with no company must match nothing, never "everything".
    return user.get("company_id") or "__no_company__"


def _owned_record(record: dict | None, request: Request) -> bool:
    if not record:
        return False
    scope = _scope(request)
    return scope is None or record.get("company_id") == scope


class StatusUpdate(BaseModel):
    status: str


class AssignUpdate(BaseModel):
    assigned_to: Optional[str] = None


@router.get("/inbox")
async def get_inbox(request: Request):
    records = list_inbox(company_id=_scope(request))
    counts = {
        "processing": sum(1 for r in records if r["status"] == "Processing"),
        "to_review": sum(1 for r in records if r["status"] in ("To Review", "No Attachment")),
        "archived": sum(1 for r in records if r["status"] == "Archived"),
        "pages_to_process": sum(r.get("page_count", 0) for r in records if r["status"] in ("To Review", "Processing")),
    }
    return {"success": True, "data": {"records": records, "counts": counts}, "error": None}


@router.get("/inbox/config")
async def inbox_config(request: Request):
    boxes = list_mailboxes(company_id=_scope(request))
    return {
        "success": True,
        "data": {
            "configured": is_configured(),
            "mailbox_count": len(boxes),
            "user": boxes[0]["user"] if boxes else None,
        },
        "error": None,
    }


@router.post("/inbox/poll")
async def poll_inbox(request: Request):
    try:
        # Now that each attachment can trigger a blocking Claude extraction
        # call (see mailbox_service._ingest_attachment), a manual "Check
        # Mail Now" can take many seconds — run it off the event loop so it
        # doesn't stall every other in-flight request for the whole server.
        result = await run_in_threadpool(fetch_and_ingest, _scope(request))
        return {"success": True, "data": result, "error": None}
    except RuntimeError as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Mail check failed: {e}"}


@router.patch("/inbox/{inbox_id}/status")
async def set_inbox_status(inbox_id: str, body: StatusUpdate, request: Request):
    if not _owned_record(get_inbox_record(inbox_id), request):
        return {"success": False, "data": None, "error": "Inbox record not found"}
    updated = update_inbox_record(inbox_id, {"status": body.status})
    if not updated:
        return {"success": False, "data": None, "error": "Inbox record not found"}
    return {"success": True, "data": updated, "error": None}


@router.patch("/inbox/{inbox_id}/assign")
async def assign_inbox(inbox_id: str, body: AssignUpdate, request: Request):
    if not _owned_record(get_inbox_record(inbox_id), request):
        return {"success": False, "data": None, "error": "Inbox record not found"}
    updated = update_inbox_record(inbox_id, {"assigned_to": body.assigned_to})
    if not updated:
        return {"success": False, "data": None, "error": "Inbox record not found"}
    return {"success": True, "data": updated, "error": None}
