from fastapi import APIRouter, Request
from pydantic import BaseModel

from services.reconciliation_service import get_all_fields, reconcile

router = APIRouter()


class ReconcileRequest(BaseModel):
    file_ids: list[str]
    match_field: str
    compare_fields: list[str]


@router.post("/reconciliation/fields")
async def available_fields(body: dict, request: Request):
    try:
        file_ids = body.get("file_ids", [])
        fields = get_all_fields(file_ids, request.state.user)
        return {"success": True, "data": fields, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/reconciliation/run")
async def run_reconciliation(body: ReconcileRequest, request: Request):
    if not body.file_ids or not body.match_field.strip() or not body.compare_fields:
        return {"success": False, "data": None, "error": "file_ids, match_field, and compare_fields are required"}
    try:
        result = reconcile(body.file_ids, body.match_field.strip(), body.compare_fields, request.state.user)
        return {"success": True, "data": result, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}
