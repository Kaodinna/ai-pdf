from fastapi import APIRouter
from pydantic import BaseModel

from services.workflow_service import list_states, add_state, update_state, delete_state, reorder_states

router = APIRouter()


class StateCreate(BaseModel):
    name: str


class StateUpdate(BaseModel):
    name: str


class ReorderRequest(BaseModel):
    ordered_ids: list[str]


@router.get("/workflow/states")
async def get_states():
    try:
        return {"success": True, "data": list_states(), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/workflow/states")
async def create_state(body: StateCreate):
    if not body.name.strip():
        return {"success": False, "data": None, "error": "name is required"}
    try:
        return {"success": True, "data": add_state(body.name.strip()), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.put("/workflow/states/{state_id}")
async def edit_state(state_id: str, body: StateUpdate):
    try:
        updated = update_state(state_id, body.name.strip())
        if not updated:
            return {"success": False, "data": None, "error": "State not found"}
        return {"success": True, "data": updated, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.delete("/workflow/states/{state_id}")
async def remove_state(state_id: str):
    try:
        deleted = delete_state(state_id)
        if not deleted:
            return {"success": False, "data": None, "error": "State not found"}
        return {"success": True, "data": {"deleted": state_id}, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/workflow/states/reorder")
async def reorder(body: ReorderRequest):
    try:
        return {"success": True, "data": reorder_states(body.ordered_ids), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}
