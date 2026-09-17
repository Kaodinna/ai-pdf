from fastapi import APIRouter, Request
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

from services.export_service import (
    export_csv, export_excel, export_json_data,
    list_integrations, get_integration, create_integration,
    update_integration, delete_integration, push_to_integration,
)
from services.file_record_service import get_accessible_file_record, list_file_records_for

router = APIRouter()


class ExportRequest(BaseModel):
    file_ids: list[str]
    fields: Optional[list[str]] = None


class IntegrationCreate(BaseModel):
    name: str
    type: str = "webhook"
    endpoint_url: str
    auth_type: str = "none"
    auth_token: str = ""
    headers: dict = {}
    field_mapping: dict = {}
    description: str = ""
    payload_style: str = "wrapped"


class IntegrationUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    endpoint_url: Optional[str] = None
    auth_type: Optional[str] = None
    auth_token: Optional[str] = None
    headers: Optional[dict] = None
    field_mapping: Optional[dict] = None
    description: Optional[str] = None
    active: Optional[bool] = None
    payload_style: Optional[str] = None


class PushRequest(BaseModel):
    file_ids: list[str]


def _load_records(file_ids: list[str], user: dict) -> list[dict]:
    if file_ids:
        return [r for fid in file_ids if (r := get_accessible_file_record(fid, user))]
    return list_file_records_for(user)


@router.post("/export/csv")
async def export_to_csv(body: ExportRequest, request: Request):
    try:
        records = _load_records(body.file_ids, request.state.user)
        data = export_csv(records, body.fields)
        return Response(
            content=data,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=export.csv"},
        )
    except Exception as e:
        return Response(content=str(e), status_code=500)


@router.post("/export/excel")
async def export_to_excel(body: ExportRequest, request: Request):
    try:
        records = _load_records(body.file_ids, request.state.user)
        data = export_excel(records, body.fields)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=export.xlsx"},
        )
    except Exception as e:
        return Response(content=str(e), status_code=500)


@router.post("/export/json")
async def export_to_json(body: ExportRequest, request: Request):
    try:
        records = _load_records(body.file_ids, request.state.user)
        data = export_json_data(records, body.fields)
        return Response(
            content=data,
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=export.json"},
        )
    except Exception as e:
        return Response(content=str(e), status_code=500)


# ─── Integrations CRUD ────────────────────────────────────────────────────

@router.get("/export/integrations")
async def get_integrations():
    try:
        return {"success": True, "data": list_integrations(), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/export/integrations")
async def create_intg(body: IntegrationCreate):
    if not body.name.strip():
        return {"success": False, "data": None, "error": "name is required"}
    if not body.endpoint_url.strip():
        return {"success": False, "data": None, "error": "endpoint_url is required"}
    try:
        intg = create_integration(
            body.name, body.type, body.endpoint_url,
            body.auth_type, body.auth_token,
            body.headers, body.field_mapping, body.description,
            body.payload_style,
        )
        return {"success": True, "data": intg, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.put("/export/integrations/{integration_id}")
async def update_intg(integration_id: str, body: IntegrationUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = update_integration(integration_id, updates)
    if not updated:
        return {"success": False, "data": None, "error": "Integration not found"}
    return {"success": True, "data": updated, "error": None}


@router.delete("/export/integrations/{integration_id}")
async def delete_intg(integration_id: str):
    if not delete_integration(integration_id):
        return {"success": False, "data": None, "error": "Integration not found"}
    return {"success": True, "data": {"deleted": integration_id}, "error": None}


_DUMMY_VALUE_BY_TYPE = {"Date": "2024-01-01", "Number": "1", "Currency": "1.00", "Boolean": "true"}


@router.post("/export/integrations/{integration_id}/test")
async def test_intg(integration_id: str):
    intg = get_integration(integration_id)
    if not intg:
        return {"success": False, "data": None, "error": "Integration not found"}
    # Push a single dummy record to test connectivity. Include a placeholder
    # for every mapped source field (typed appropriately) so an endpoint with
    # required parameters — like a Bubble.io API workflow — can actually
    # succeed here instead of failing on missing fields every time regardless
    # of whether the real connection/auth/URL are fine.
    dummy_fields = {"test_field": "hello"}
    for source, mapping in (intg.get("field_mapping") or {}).items():
        data_type = mapping.get("type", "Text") if isinstance(mapping, dict) else "Text"
        dummy_fields[source] = _DUMMY_VALUE_BY_TYPE.get(data_type, "test")

    dummy = [{
        "id": "test-id",
        "filename": "test.pdf",
        "status": "New",
        "template_name": "Test Template",
        "uploaded_at": "2024-01-01T00:00:00",
        "extracted_at": None,
        "page_count": 1,
        "pages": [{"fields": dummy_fields, "table_rows": [], "applied_conditions": [], "text_preview": ""}],
    }]
    result = await push_to_integration(intg, dummy)
    return {"success": result["success"], "data": result, "error": None if result["success"] else result["response_body"]}


@router.post("/export/integrations/{integration_id}/push")
async def push_intg(integration_id: str, body: PushRequest, request: Request):
    intg = get_integration(integration_id)
    if not intg:
        return {"success": False, "data": None, "error": "Integration not found"}
    if not intg.get("active"):
        return {"success": False, "data": None, "error": "Integration is inactive"}
    try:
        records = _load_records(body.file_ids, request.state.user)
        result = await push_to_integration(intg, records)
        return {"success": result["success"], "data": result, "error": None if result["success"] else result["response_body"]}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}
