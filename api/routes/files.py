from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional

from services.file_record_service import (
    update_file_record,
    delete_file_record,
    add_comment,
    list_comments,
    list_file_records_for,
    get_accessible_file_record,
)
from services.audit_service import log_event
from services.approval_service import get_route_for_state
from services.ai_memory_service import create_memory
from services.metrics_service import increment as increment_metric

router = APIRouter()


class StatusUpdate(BaseModel):
    status: str
    user: str = "system"


class FieldUpdate(BaseModel):
    field: str
    value: Optional[str] = None
    action: str = "update"  # "update" | "add" | "delete"
    user: str = "system"
    reason: Optional[str] = None


class AssignUpdate(BaseModel):
    assigned_to: Optional[str] = None
    user: str = "system"


class BulkStatusUpdate(BaseModel):
    file_ids: list[str]
    status: str


class BulkDelete(BaseModel):
    file_ids: list[str]


class FieldDecisionUpdate(BaseModel):
    field: str
    status: str  # "approved" | "needs_review" | "rejected"
    user: str = "system"


class RecordDecisionUpdate(BaseModel):
    decision: str  # "approved" | "for_review" | "rejected"
    user: str = "system"


class CommentCreate(BaseModel):
    text: str
    user: str = "system"


@router.get("/files")
async def get_files(request: Request):
    try:
        return {"success": True, "data": list_file_records_for(request.state.user), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.get("/files/{file_id}")
async def get_file(file_id: str, request: Request):
    try:
        record = get_accessible_file_record(file_id, request.state.user)
        if not record:
            return {"success": False, "data": None, "error": "File record not found"}
        return {"success": True, "data": record, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.patch("/files/{file_id}/status")
async def set_file_status(file_id: str, body: StatusUpdate, request: Request):
    if not body.status.strip():
        return {"success": False, "data": None, "error": "status is required"}
    try:
        record = get_accessible_file_record(file_id, request.state.user)
        if not record:
            return {"success": False, "data": None, "error": "File record not found"}
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
async def assign_file(file_id: str, body: AssignUpdate, request: Request):
    try:
        record = get_accessible_file_record(file_id, request.state.user)
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
async def update_field(file_id: str, body: FieldUpdate, request: Request):
    try:
        record = get_accessible_file_record(file_id, request.state.user)
        if not record:
            return {"success": False, "data": None, "error": "File record not found"}
        pages = record.get("pages", [])
        old_value = None
        was_ai_derived = False
        was_approved = False
        if pages:
            for page in pages:
                if body.field in (page.get("fields") or {}):
                    old_value = page["fields"][body.field]
                    was_ai_derived = body.field in (page.get("field_meta") or {})
                    was_approved = (page.get("field_meta") or {}).get(body.field, {}).get("status") == "approved"
                    break
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
                  details={"field": body.field, "value": body.value,
                           "original": old_value, "ai_derived": was_ai_derived})

        if body.action == "update" and was_approved and body.value != old_value:
            increment_metric("corrected_after_approval_total")

        if body.action == "update" and body.reason and was_ai_derived and body.value != old_value:
            memory = create_memory(
                field_name=body.field,
                doc_type=record.get("template_type") or record.get("template_name"),
                original_value=old_value,
                corrected_value=body.value,
                reason=body.reason,
                created_by=body.user,
                company_id=record.get("company_id"),
            )
            log_event("ai_memory_created", "file", file_id,
                      entity_name=record.get("filename", ""),
                      user=body.user,
                      details={"memory_id": memory["id"], "field": body.field})

        return {"success": True, "data": updated, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.patch("/files/{file_id}/fields/decision")
async def set_field_decision(file_id: str, body: FieldDecisionUpdate, request: Request):
    if body.status not in ("approved", "needs_review", "rejected"):
        return {"success": False, "data": None, "error": "status must be approved, needs_review, or rejected"}
    try:
        record = get_accessible_file_record(file_id, request.state.user)
        if not record:
            return {"success": False, "data": None, "error": "File record not found"}
        pages = record.get("pages", [])
        found = False
        for page in pages:
            if body.field in (page.get("fields") or {}):
                page.setdefault("field_meta", {}).setdefault(body.field, {"confidence": 0, "evidence": ""})
                page["field_meta"][body.field]["status"] = body.status
                found = True
        if not found:
            return {"success": False, "data": None, "error": f"Field '{body.field}' not found on this record"}
        updated = update_file_record(file_id, {"pages": pages})
        log_event("field_decision", "file", file_id,
                  entity_name=record.get("filename", ""),
                  user=body.user,
                  details={"field": body.field, "status": body.status})
        return {"success": True, "data": updated, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/files/{file_id}/decision")
async def set_record_decision(file_id: str, body: RecordDecisionUpdate, request: Request):
    if body.decision not in ("approved", "for_review", "rejected"):
        return {"success": False, "data": None, "error": "decision must be approved, for_review, or rejected"}
    try:
        record = get_accessible_file_record(file_id, request.state.user)
        if not record:
            return {"success": False, "data": None, "error": "File record not found"}
        pages = record.get("pages", [])
        if body.decision == "approved":
            for page in pages:
                for fname in (page.get("fields") or {}):
                    page.setdefault("field_meta", {}).setdefault(fname, {"confidence": 0, "evidence": ""})
                    page["field_meta"][fname]["status"] = "approved"
        updated = update_file_record(file_id, {"decision": body.decision, "pages": pages})
        log_event("decision", "file", file_id,
                  entity_name=record.get("filename", ""),
                  user=body.user,
                  details={"decision": body.decision})
        return {"success": True, "data": updated, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.get("/files/{file_id}/comments")
async def get_file_comments(file_id: str, request: Request):
    try:
        record = get_accessible_file_record(file_id, request.state.user)
        if not record:
            return {"success": False, "data": None, "error": "File record not found"}
        return {"success": True, "data": list_comments(file_id), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/files/{file_id}/comments")
async def post_file_comment(file_id: str, body: CommentCreate, request: Request):
    if not body.text.strip():
        return {"success": False, "data": None, "error": "text is required"}
    try:
        record = get_accessible_file_record(file_id, request.state.user)
        if not record:
            return {"success": False, "data": None, "error": "File record not found"}
        comment = add_comment(file_id, body.user, body.text.strip())
        log_event("commented", "file", file_id,
                  entity_name=record.get("filename", ""),
                  user=body.user,
                  details={"comment_id": comment["id"]})
        return {"success": True, "data": comment, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/files/bulk/status")
async def bulk_status(body: BulkStatusUpdate, request: Request):
    updated = 0
    route = get_route_for_state(body.status)
    for fid in body.file_ids:
        if not get_accessible_file_record(fid, request.state.user):
            continue
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
async def bulk_delete(body: BulkDelete, request: Request):
    deleted = 0
    for fid in body.file_ids:
        rec = get_accessible_file_record(fid, request.state.user)
        if not rec:
            continue
        if delete_file_record(fid):
            deleted += 1
            log_event("deleted", "file", fid, entity_name=rec.get("filename", "") if rec else "")
    return {"success": True, "data": {"deleted": deleted}, "error": None}


@router.delete("/files/{file_id}")
async def remove_file(file_id: str, request: Request):
    try:
        record = get_accessible_file_record(file_id, request.state.user)
        if not record:
            return {"success": False, "data": None, "error": "File record not found"}
        name = record.get("filename", "")
        deleted = delete_file_record(file_id)
        if not deleted:
            return {"success": False, "data": None, "error": "File record not found"}
        log_event("deleted", "file", file_id, entity_name=name)
        return {"success": True, "data": {"deleted": file_id}, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}
