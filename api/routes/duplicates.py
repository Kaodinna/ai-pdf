from fastapi import APIRouter

from services.duplicate_service import find_duplicates

router = APIRouter()


@router.get("/duplicates")
async def get_duplicates():
    try:
        return {"success": True, "data": find_duplicates(), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}
