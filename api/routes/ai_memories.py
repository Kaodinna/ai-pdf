from typing import Optional

from fastapi import APIRouter, Request
from services.company_service import is_platform_owner
from pydantic import BaseModel

from services.ai_memory_service import list_memories, update_memory, delete_memory

router = APIRouter()


def _own_memory(memory_id: str, request: Request) -> bool:
    user = request.state.user
    if is_platform_owner(user):
        return True
    return any(m["id"] == memory_id and m.get("company_id") == user.get("company_id") for m in list_memories(all_companies=True))


class MemoryUpdate(BaseModel):
    active: Optional[bool] = None
    reason: Optional[str] = None
    corrected_value: Optional[str] = None


@router.get("/ai-memories")
async def get_memories(request: Request, doc_type: Optional[str] = None):
    user = request.state.user
    memories = list_memories(doc_type, company_id=user.get("company_id"), all_companies=is_platform_owner(user))
    active_count = sum(1 for m in memories if m.get("active", True))
    return {
        "success": True,
        "data": {"memories": memories, "active_count": active_count, "total_count": len(memories)},
        "error": None,
    }


@router.put("/ai-memories/{memory_id}")
async def put_memory(memory_id: str, body: MemoryUpdate, request: Request):
    if not _own_memory(memory_id, request):
        return {"success": False, "data": None, "error": "Memory not found"}
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"success": False, "data": None, "error": "No fields to update"}
    updated = update_memory(memory_id, updates)
    if not updated:
        return {"success": False, "data": None, "error": "Memory not found"}
    return {"success": True, "data": updated, "error": None}


@router.delete("/ai-memories/{memory_id}")
async def remove_memory(memory_id: str, request: Request):
    if not _own_memory(memory_id, request):
        return {"success": False, "data": None, "error": "Memory not found"}
    deleted = delete_memory(memory_id)
    if not deleted:
        return {"success": False, "data": None, "error": "Memory not found"}
    return {"success": True, "data": {"deleted": memory_id}, "error": None}
