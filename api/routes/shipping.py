from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from services.pdf_service import validate_pdf
from services.shipping_service import (
    ai_extract_shipping_data,
    group_records,
    separate_pdf_by_groups,
)
from services.storage_service import storage

router = APIRouter()


class ShippingExtractRequest(BaseModel):
    file_id: str


class ShippingSeparateRequest(BaseModel):
    file_id: str
    group_by: str  # "company" | "container"
    records: list[dict]


@router.post("/shipping/extract")
async def extract_shipping_data(req: ShippingExtractRequest):
    try:
        path = storage.get_upload_path(req.file_id)
        validate_pdf(path)
        records = ai_extract_shipping_data(path)
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
async def separate_shipping_docs(req: ShippingSeparateRequest):
    if req.group_by not in ("company", "container"):
        return {"success": False, "data": None, "error": "group_by must be 'company' or 'container'"}
    if not req.records:
        return {"success": False, "data": None, "error": "No extracted records provided"}

    try:
        path = storage.get_upload_path(req.file_id)
        validate_pdf(path)

        groups = group_records(req.records, req.group_by)
        group_files, zip_filename = separate_pdf_by_groups(path, groups)

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
