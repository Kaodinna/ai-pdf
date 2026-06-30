import csv
import io
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
INTEGRATIONS_FILE = DATA_DIR / "integrations.json"


# ─── Integration CRUD ─────────────────────────────────────────────────────

def _load_integrations() -> list[dict]:
    if not INTEGRATIONS_FILE.exists():
        return []
    return json.loads(INTEGRATIONS_FILE.read_text())


def _save_integrations(integrations: list[dict]) -> None:
    INTEGRATIONS_FILE.write_text(json.dumps(integrations, indent=2))


def list_integrations() -> list[dict]:
    return _load_integrations()


def get_integration(integration_id: str) -> dict | None:
    return next((i for i in _load_integrations() if i["id"] == integration_id), None)


def create_integration(
    name: str,
    type: str,
    endpoint_url: str,
    auth_type: str = "none",
    auth_token: str = "",
    headers: dict | None = None,
    field_mapping: dict | None = None,
    description: str = "",
) -> dict:
    integrations = _load_integrations()
    integration = {
        "id": str(uuid.uuid4()),
        "name": name,
        "type": type,
        "endpoint_url": endpoint_url,
        "auth_type": auth_type,
        "auth_token": auth_token,
        "headers": headers or {},
        "field_mapping": field_mapping or {},
        "description": description,
        "active": True,
        "last_pushed_at": None,
        "created_at": datetime.utcnow().isoformat(),
    }
    integrations.append(integration)
    _save_integrations(integrations)
    return integration


def update_integration(integration_id: str, updates: dict) -> dict | None:
    integrations = _load_integrations()
    for intg in integrations:
        if intg["id"] == integration_id:
            for k, v in updates.items():
                if k not in ("id", "created_at"):
                    intg[k] = v
            _save_integrations(integrations)
            return intg
    return None


def delete_integration(integration_id: str) -> bool:
    integrations = _load_integrations()
    filtered = [i for i in integrations if i["id"] != integration_id]
    if len(filtered) == len(integrations):
        return False
    _save_integrations(filtered)
    return True


# ─── Field flattening ──────────────────────────────────────────────────────

def _flatten_record(record: dict, fields: list[str] | None = None) -> dict:
    flat: dict[str, Any] = {
        "id": record.get("id"),
        "filename": record.get("filename"),
        "status": record.get("status"),
        "template_name": record.get("template_name"),
        "uploaded_at": record.get("uploaded_at"),
        "extracted_at": record.get("extracted_at"),
        "page_count": record.get("page_count"),
    }
    for page in record.get("pages", []):
        for k, v in page.get("fields", {}).items():
            if k not in flat or flat[k] is None:
                flat[k] = v
    if fields:
        flat = {k: flat.get(k) for k in fields}
    return flat


def _apply_mapping(flat: dict, field_mapping: dict) -> dict:
    if not field_mapping:
        return flat
    return {field_mapping.get(k, k): v for k, v in flat.items()}


# ─── CSV export ────────────────────────────────────────────────────────────

def export_csv(records: list[dict], fields: list[str] | None = None) -> bytes:
    rows = [_flatten_record(r, fields) for r in records]
    if not rows:
        return b""
    all_keys = list(rows[0].keys())
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=all_keys, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode()


# ─── Excel export ─────────────────────────────────────────────────────────

def export_excel(records: list[dict], fields: list[str] | None = None) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    rows = [_flatten_record(r, fields) for r in records]
    wb = Workbook()
    ws = wb.active
    ws.title = "Extracted Data"

    if not rows:
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    headers = list(rows[0].keys())
    header_fill = PatternFill("solid", fgColor="1D4ED8")
    header_font = Font(color="FFFFFF", bold=True, size=10)

    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="left", vertical="center")

    for row_idx, row in enumerate(rows, 2):
        for col_idx, key in enumerate(headers, 1):
            val = row.get(key)
            ws.cell(row=row_idx, column=col_idx, value=val if val is not None else "")
            if row_idx % 2 == 0:
                ws.cell(row=row_idx, column=col_idx).fill = PatternFill("solid", fgColor="F1F5F9")

    for col_idx, header in enumerate(headers, 1):
        max_len = max(len(str(header)), max((len(str(rows[r].get(header) or "")) for r in range(len(rows))), default=0))
        ws.column_dimensions[get_column_letter(col_idx)].width = min(max_len + 4, 40)

    ws.row_dimensions[1].height = 22
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ─── JSON export ──────────────────────────────────────────────────────────

def export_json_data(records: list[dict], fields: list[str] | None = None) -> bytes:
    rows = [_flatten_record(r, fields) for r in records]
    return json.dumps(rows, indent=2, default=str).encode()


# ─── Webhook push ─────────────────────────────────────────────────────────

async def push_to_integration(integration: dict, records: list[dict]) -> dict:
    import httpx

    rows = [_apply_mapping(_flatten_record(r), integration.get("field_mapping", {})) for r in records]
    payload = {
        "source": "mely_ai_pdf_studio",
        "pushed_at": datetime.utcnow().isoformat(),
        "record_count": len(rows),
        "records": rows,
    }

    headers = dict(integration.get("headers", {}))
    auth_type = integration.get("auth_type", "none")
    auth_token = integration.get("auth_token", "")

    if auth_type == "bearer":
        headers["Authorization"] = f"Bearer {auth_token}"
    elif auth_type == "api_key":
        headers["X-API-Key"] = auth_token
    elif auth_type == "basic":
        import base64
        headers["Authorization"] = "Basic " + base64.b64encode(auth_token.encode()).decode()

    headers.setdefault("Content-Type", "application/json")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(integration["endpoint_url"], json=payload, headers=headers)
        result = {
            "success": response.status_code < 400,
            "status_code": response.status_code,
            "response_body": response.text[:500],
            "records_pushed": len(rows),
        }
    except Exception as e:
        result = {"success": False, "status_code": None, "response_body": str(e), "records_pushed": 0}

    # Update last_pushed_at on success
    if result["success"]:
        update_integration(integration["id"], {"last_pushed_at": datetime.utcnow().isoformat()})

    return result
