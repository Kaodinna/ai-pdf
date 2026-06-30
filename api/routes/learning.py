from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from services.learning_service import (
    list_modules, get_module, mark_lesson_complete, create_module, delete_module,
)

router = APIRouter()


class LessonInput(BaseModel):
    title: str
    type: str = "article"


class ModuleCreate(BaseModel):
    title: str
    description: str = ""
    category: str = "General"
    duration_minutes: int = 10
    lessons: list[LessonInput] = []


class LessonComplete(BaseModel):
    completed: bool = True


@router.get("/learning/modules")
async def get_modules(category: Optional[str] = None):
    try:
        return {"success": True, "data": list_modules(category), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.get("/learning/modules/{module_id}")
async def get_one(module_id: str):
    mod = get_module(module_id)
    if not mod:
        return {"success": False, "data": None, "error": "Module not found"}
    return {"success": True, "data": mod, "error": None}


@router.post("/learning/modules")
async def create(body: ModuleCreate):
    if not body.title.strip():
        return {"success": False, "data": None, "error": "title is required"}
    try:
        mod = create_module(body.title, body.description, body.category, body.duration_minutes,
                            [l.model_dump() for l in body.lessons])
        return {"success": True, "data": mod, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.patch("/learning/modules/{module_id}/lessons/{lesson_id}")
async def complete_lesson(module_id: str, lesson_id: str, body: LessonComplete):
    mod = mark_lesson_complete(module_id, lesson_id, body.completed)
    if not mod:
        return {"success": False, "data": None, "error": "Module or lesson not found"}
    return {"success": True, "data": mod, "error": None}


@router.delete("/learning/modules/{module_id}")
async def delete(module_id: str):
    if not delete_module(module_id):
        return {"success": False, "data": None, "error": "Module not found"}
    return {"success": True, "data": {"deleted": module_id}, "error": None}
