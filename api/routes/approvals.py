from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from services.approval_service import (
    list_routes,
    create_route,
    delete_route,
    list_pending_approvals,
)

router = APIRouter()


class RouteCreate(BaseModel):
    state_name: str
    approver: str
    escalation_hours: Optional[int] = None


@router.get("/approvals/routes")
async def get_routes():
    try:
        return {"success": True, "data": list_routes(), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/approvals/routes")
async def add_route(body: RouteCreate):
    if not body.state_name.strip() or not body.approver.strip():
        return {"success": False, "data": None, "error": "state_name and approver are required"}
    try:
        route = create_route(body.state_name.strip(), body.approver.strip(), body.escalation_hours)
        return {"success": True, "data": route, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.delete("/approvals/routes/{route_id}")
async def remove_route(route_id: str):
    try:
        deleted = delete_route(route_id)
        if not deleted:
            return {"success": False, "data": None, "error": "Route not found"}
        return {"success": True, "data": {"deleted": route_id}, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.get("/approvals/pending")
async def get_pending():
    try:
        return {"success": True, "data": list_pending_approvals(), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}
