import csv
import io
import json

from services.request_context import current_company, visible
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
INTEGRATIONS_FILE = DATA_DIR / "integrations.json"

# Mirrors the template field data types (services/template_service.py) so a
# mapped field can be cast to what the receiving API actually expects instead
# of always going out as whatever string the extractor produced.
_NUMBER_RE = re.compile(r"-?\d[\d,]*\.?\d*")
_DATE_FORMATS = (
    "%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f",
    "%d/%m/%Y %H:%M:%S", "%m/%d/%Y %H:%M:%S",
    "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%m-%d-%Y",
    "%d-%B-%Y", "%d %B %Y", "%B %d, %Y", "%B %d %Y",
    "%d-%b-%Y", "%d %b %Y", "%b %d, %Y", "%b %d %Y",
)
_TRUE_WORDS = {"yes", "true", "1", "y", "approved", "checked"}
_FALSE_WORDS = {"no", "false", "0", "n", "rejected", "unchecked"}


def _coerce_value(value: Any, data_type: str) -> Any:
    """Best-effort cast of an extracted (usually string) value to the type a
    receiving API expects. Never raises and never drops data — a value that
    can't be confidently parsed is passed through unchanged rather than
    nulled, since a wrong guess is worse than a string the other side can
    parse itself."""
    if value is None or data_type not in ("Number", "Currency", "Date", "Boolean"):
        return value
    text = str(value).strip()
    if not text:
        return value

    if data_type in ("Number", "Currency"):
        match = _NUMBER_RE.search(text.replace(",", ""))
        if not match:
            return value
        try:
            num = float(match.group())
        except ValueError:
            return value
        return int(num) if num.is_integer() else num

    if data_type == "Date":
        first_line = text.splitlines()[0].strip()
        for fmt in _DATE_FORMATS:
            try:
                return datetime.strptime(first_line, fmt).date().isoformat()
            except ValueError:
                continue
        return value

    if data_type == "Boolean":
        lowered = text.lower()
        if lowered in _TRUE_WORDS:
            return True
        if lowered in _FALSE_WORDS:
            return False
        return value

    return value


# ─── Integration CRUD ─────────────────────────────────────────────────────

def _load_integrations() -> list[dict]:
    if not INTEGRATIONS_FILE.exists():
        return []
    return json.loads(INTEGRATIONS_FILE.read_text())


def _save_integrations(integrations: list[dict]) -> None:
    INTEGRATIONS_FILE.write_text(json.dumps(integrations, indent=2))


def list_integrations() -> list[dict]:
    return [i for i in _load_integrations() if visible(i)]


def get_integration(integration_id: str) -> dict | None:
    return next((i for i in _load_integrations() if i["id"] == integration_id and visible(i)), None)


def create_integration(
    name: str,
    type: str,
    endpoint_url: str,
    auth_type: str = "none",
    auth_token: str = "",
    headers: dict | None = None,
    field_mapping: dict | None = None,
    description: str = "",
    payload_style: str = "wrapped",
) -> dict:
    integrations = _load_integrations()
    integration = {
        "company_id": current_company.get(),
        "id": str(uuid.uuid4()),
        "name": name,
        "type": type,
        "endpoint_url": endpoint_url,
        "auth_type": auth_type,
        "auth_token": auth_token,
        "headers": headers or {},
        "field_mapping": field_mapping or {},
        "description": description,
        # "wrapped" (default): {source, pushed_at, record_count, records: [...]}
        # in one request. "flat": the mapped fields alone as the top-level
        # JSON body, one request per record — for backends (e.g. a Bubble.io
        # API workflow) that expect their own parameters at the top level.
        "payload_style": payload_style if payload_style in ("wrapped", "flat") else "wrapped",
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
        if intg["id"] == integration_id and visible(intg):
            for k, v in updates.items():
                if k not in ("id", "created_at"):
                    intg[k] = v
            _save_integrations(integrations)
            return intg
    return None


def delete_integration(integration_id: str) -> bool:
    integrations = _load_integrations()
    filtered = [i for i in integrations if not (i["id"] == integration_id and visible(i))]
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
    """Rename and/or type-cast fields for the outgoing payload. Each mapping
    entry is {"target": str, "type": str}; a plain string is also accepted
    (older integrations saved before per-field types existed) and treated as
    a rename with no casting. An empty target keeps the field's own name —
    letting a field's type be set without renaming it. A list of entries
    fans one extracted field out to several target keys — e.g. a single
    "date" field feeding both etd_sin and eta_sin — each cast independently.

    A field the extractor found no value for is omitted entirely rather than
    sent as a literal JSON null — many APIs (a Bubble.io workflow among them)
    reject a present-but-null value for an optional parameter even though
    leaving the key out entirely is accepted."""
    if not field_mapping:
        return {k: v for k, v in flat.items() if v is not None}
    result: dict[str, Any] = {}
    for k, v in flat.items():
        if v is None:
            continue
        mapping = field_mapping.get(k)
        if mapping is None:
            result[k] = v
            continue
        entries = mapping if isinstance(mapping, list) else [mapping]
        for entry in entries:
            if isinstance(entry, str):
                target, data_type = entry, "Text"
            else:
                target = entry.get("target") or ""
                data_type = entry.get("type") or "Text"
            result[target or k] = _coerce_value(v, data_type)
    return result


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

def _auth_headers(integration: dict) -> dict:
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
    return headers


async def push_to_integration(integration: dict, records: list[dict]) -> dict:
    import httpx

    rows = [_apply_mapping(_flatten_record(r), integration.get("field_mapping", {})) for r in records]
    headers = _auth_headers(integration)
    flat = integration.get("payload_style") == "flat"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if flat:
                # Some backends (e.g. a Bubble.io API workflow, or any single-
                # record REST endpoint) expect their parameters as the
                # top-level JSON body, not nested under a batch envelope —
                # one request per record instead of one request for all of
                # them.
                responses = [await client.post(integration["endpoint_url"], json=row, headers=headers) for row in rows]
                failures = [r for r in responses if r.status_code >= 400]
                result = {
                    "success": len(failures) == 0,
                    "status_code": failures[0].status_code if failures else (responses[0].status_code if responses else None),
                    "response_body": (
                        f"{len(responses) - len(failures)}/{len(responses)} succeeded"
                        + (f" — first failure: {failures[0].text[:400]}" if failures else "")
                    ),
                    "records_pushed": len(responses) - len(failures),
                }
            else:
                payload = {
                    "source": "mely_ai_pdf_studio",
                    "pushed_at": datetime.utcnow().isoformat(),
                    "record_count": len(rows),
                    "records": rows,
                }
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
