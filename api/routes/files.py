from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from services.file_record_service import (
    list_file_records,
    get_file_record,
    update_file_record,
    delete_file_record,
)
from services.audit_service import log_event
from services.approval_service import get_route_for_state

router = APIRouter()


class StatusUpdate(BaseModel):
    status: str
    user: str = "system"


class FieldUpdate(BaseModel):
    field: str
    value: Optional[str] = None
    action: str = "update"  # "update" | "add" | "delete"
    user: str = "system"


class AssignUpdate(BaseModel):
    assigned_to: Optional[str] = None
    user: str = "system"


class BulkStatusUpdate(BaseModel):
    file_ids: list[str]
    status: str


class BulkDelete(BaseModel):
    file_ids: list[str]


@router.get("/files")
async def get_files():
    try:
        return {"success": True, "data": list_file_records(), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.get("/files/{file_id}")
async def get_file(file_id: str):
    try:
        record = get_file_record(file_id)
        if not record:
            return {"success": False, "data": None, "error": "File record not found"}
        return {"success": True, "data": record, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.patch("/files/{file_id}/status")
async def set_file_status(file_id: str, body: StatusUpdate):
    if not body.status.strip():
        return {"success": False, "data": None, "error": "status is required"}
    try:
        record = get_file_record(file_id)
        old_status = record.get("status") if record else None
        updated = update_file_record(file_id, {"status": body.status})
        if not updated:
            return {"success": False, "data": None, "error": "File record not found"}
        log_event("status_changed", "file", file_id,
                  entity_name=updated.get("filename", ""),
                  user=body.user,
                  details={"from": old_status, "to": body.status})
        route = get_route_for_state(body.status)
        if route and updated.get("assigned_to") != route["approver"]:
            updated = update_file_record(file_id, {"assigned_to": route["approver"]})
            log_event("auto_assigned", "file", file_id,
                      entity_name=updated.get("filename", ""),
                      details={"assigned_to": route["approver"], "reason": f"entered {body.status}"})
        return {"success": True, "data": updated, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.patch("/files/{file_id}/assign")
async def assign_file(file_id: str, body: AssignUpdate):
    try:
        record = get_file_record(file_id)
        if not record:
            return {"success": False, "data": None, "error": "File record not found"}
        updated = update_file_record(file_id, {"assigned_to": body.assigned_to})
        log_event("assigned", "file", file_id,
                  entity_name=record.get("filename", ""),
                  user=body.user,
                  details={"assigned_to": body.assigned_to})
        return {"success": True, "data": updated, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.patch("/files/{file_id}/fields")
async def update_field(file_id: str, body: FieldUpdate):
    try:
        record = get_file_record(file_id)
        if not record:
            return {"success": False, "data": None, "error": "File record not found"}
        pages = record.get("pages", [])
        if not pages:
            if body.action in ("update", "add"):
                pages = [{"page_number": 1, "fields": {body.field: body.value},
                          "table_rows": [], "applied_conditions": [], "text_preview": ""}]
        else:
            if body.action == "delete":
                for page in pages:
                    page["fields"].pop(body.field, None)
            elif body.action == "update":
                for page in pages:
                    if body.field in page["fields"]:
                        page["fields"][body.field] = body.value
            elif body.action == "add":
                pages[0]["fields"][body.field] = body.value
        updated = update_file_record(file_id, {"pages": pages})
        if not updated:
            return {"success": False, "data": None, "error": "File record not found"}
        log_event(f"field_{body.action}d", "file", file_id,
                  entity_name=record.get("filename", ""),
                  user=body.user,
                  details={"field": body.field, "value": body.value})
        return {"success": True, "data": updated, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/files/bulk/status")
async def bulk_status(body: BulkStatusUpdate):
    updated = 0
    route = get_route_for_state(body.status)
    for fid in body.file_ids:
        r = update_file_record(fid, {"status": body.status})
        if r:
            updated += 1
            log_event("status_changed", "file", fid, entity_name=r.get("filename", ""),
                      details={"to": body.status, "bulk": True})
            if route and r.get("assigned_to") != route["approver"]:
                r = update_file_record(fid, {"assigned_to": route["approver"]})
                log_event("auto_assigned", "file", fid, entity_name=r.get("filename", ""),
                          details={"assigned_to": route["approver"], "reason": f"entered {body.status}", "bulk": True})
    return {"success": True, "data": {"updated": updated}, "error": None}


@router.post("/files/bulk/delete")
async def bulk_delete(body: BulkDelete):
    deleted = 0
    for fid in body.file_ids:
        rec = get_file_record(fid)
        if delete_file_record(fid):
            deleted += 1
            log_event("deleted", "file", fid, entity_name=rec.get("filename", "") if rec else "")
    return {"success": True, "data": {"deleted": deleted}, "error": None}


@router.delete("/files/{file_id}")
async def remove_file(file_id: str):
    try:
        record = get_file_record(file_id)
        name = record.get("filename", "") if record else ""
        deleted = delete_file_record(file_id)
        if not deleted:
            return {"success": False, "data": None, "error": "File record not found"}
        log_event("deleted", "file", file_id, entity_name=name)
        return {"success": True, "data": {"deleted": file_id}, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}
