from fastapi import APIRouter, Request

from services.duplicate_service import find_duplicates

router = APIRouter()


@router.get("/duplicates")
async def get_duplicates(request: Request):
    try:
        return {"success": True, "data": find_duplicates(request.state.user), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}
