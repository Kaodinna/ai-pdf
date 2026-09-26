from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional

from services.pdf_service import validate_pdf
from services.shipping_service import (
    ai_extract_shipping_data,
    group_records,
    separate_pdf_by_groups,
)
from services.storage_service import storage
from services.file_record_service import get_accessible_file_record
from services.reducto_extraction_service import reducto_extract_shipping_data
from services.metrics_service import increment

router = APIRouter()


class ShippingExtractRequest(BaseModel):
    file_id: str
    engine: Optional[str] = None


class ShippingSeparateRequest(BaseModel):
    file_id: str
    group_by: str  # "company" | "container"
    records: list[dict]


@router.post("/shipping/extract")
async def extract_shipping_data(req: ShippingExtractRequest, request: Request):
    if not get_accessible_file_record(req.file_id, request.state.user):
        return {"success": False, "data": None, "error": "File record not found"}
    engine = req.engine or "claude"
    if engine not in ("claude", "reducto"):
        return {"success": False, "data": None, "error": f"Unknown extraction engine: {engine}"}

    def _extract() -> list:
        path = storage.get_upload_path(req.file_id)
        validate_pdf(path)
        records = reducto_extract_shipping_data(path) if engine == "reducto" else ai_extract_shipping_data(path)
        increment(f"pages_extracted_{engine}", len(records))
        return records

    # The Claude API call inside ai_extract_shipping_data is a blocking
    # network request that can take many seconds — run it off the event loop.
    try:
        records = await run_in_threadpool(_extract)
        return {
            "success": True,
            "data": {
                "file_id": req.file_id,
                "total_pages": len(records),
                "records": records,
            },
            "error": None,
        }
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except (RuntimeError, ValueError, EnvironmentError) as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Extraction failed: {e}"}


@router.post("/shipping/separate")
async def separate_shipping_docs(req: ShippingSeparateRequest, request: Request):
    if req.group_by not in ("company", "container"):
        return {"success": False, "data": None, "error": "group_by must be 'company' or 'container'"}
    if not req.records:
        return {"success": False, "data": None, "error": "No extracted records provided"}

    if not get_accessible_file_record(req.file_id, request.state.user):
        return {"success": False, "data": None, "error": "File record not found"}

    def _separate() -> tuple[dict, str]:
        path = storage.get_upload_path(req.file_id)
        validate_pdf(path)
        groups = group_records(req.records, req.group_by)
        return separate_pdf_by_groups(path, groups)

    # PDF separation is synchronous CPU/disk work — keep it off the event loop.
    try:
        group_files, zip_filename = await run_in_threadpool(_separate)

        result_groups = {
            label: {
                "pages": sorted(set(
                    r.get("page_number")
                    for r in req.records
                    if _page_in_group(r, label, req.group_by)
                )),
                "download_url": f"/download/{filename}",
            }
            for label, filename in group_files.items()
        }

        return {
            "success": True,
            "data": {
                "group_by": req.group_by,
                "groups": result_groups,
                "zip_url": f"/download/{zip_filename}",
            },
            "error": None,
        }
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Separation failed: {e}"}


def _page_in_group(record: dict, label: str, group_by: str) -> bool:
    if group_by == "container":
        return label in (record.get("container_numbers") or []) or (
            label == "No Container Identified" and not record.get("container_numbers")
        )
    key = (
        record.get("company_key")
        or record.get("shipper_name")
        or record.get("consignee_name")
        or "Unknown Company"
    )
    return key == label
