from fastapi import APIRouter
from typing import Optional
from services.audit_service import list_events, get_summary

router = APIRouter()


@router.get("/audit/logs")
async def get_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
):
    try:
        events = list_events(entity_type, entity_id, action, limit, offset)
        return {"success": True, "data": events, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.get("/audit/summary")
async def get_audit_summary():
    try:
        return {"success": True, "data": get_summary(), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}
