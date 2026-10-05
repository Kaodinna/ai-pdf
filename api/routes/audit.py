from fastapi import APIRouter, Request
from services.company_service import is_platform_owner
from typing import Optional
from services.audit_service import list_events, get_summary

router = APIRouter()


@router.get("/audit/logs")
async def get_logs(
    request: Request,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
):
    try:
        user = request.state.user
        events = list_events(entity_type, entity_id, action, limit, offset,
                             company_id=user.get("company_id"), all_companies=is_platform_owner(user))
        return {"success": True, "data": events, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.get("/audit/summary")
async def get_audit_summary(request: Request):
    try:
        user = request.state.user
        return {"success": True, "data": get_summary(company_id=user.get("company_id"), all_companies=is_platform_owner(user)), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}
