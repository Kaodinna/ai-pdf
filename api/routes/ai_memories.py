from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from services.ai_memory_service import list_memories, update_memory, delete_memory

router = APIRouter()


class MemoryUpdate(BaseModel):
    active: Optional[bool] = None
    reason: Optional[str] = None
    corrected_value: Optional[str] = None


@router.get("/ai-memories")
async def get_memories(doc_type: Optional[str] = None):
    memories = list_memories(doc_type)
    active_count = sum(1 for m in memories if m.get("active", True))
    return {
        "success": True,
        "data": {"memories": memories, "active_count": active_count, "total_count": len(memories)},
        "error": None,
    }


@router.put("/ai-memories/{memory_id}")
async def put_memory(memory_id: str, body: MemoryUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"success": False, "data": None, "error": "No fields to update"}
    updated = update_memory(memory_id, updates)
    if not updated:
        return {"success": False, "data": None, "error": "Memory not found"}
    return {"success": True, "data": updated, "error": None}


@router.delete("/ai-memories/{memory_id}")
async def remove_memory(memory_id: str):
    deleted = delete_memory(memory_id)
    if not deleted:
        return {"success": False, "data": None, "error": "Memory not found"}
    return {"success": True, "data": {"deleted": memory_id}, "error": None}
