from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from services.approval_settings_service import get_settings, update_settings
from services.metrics_service import get_metrics

router = APIRouter()


class AutoApproveUpdate(BaseModel):
    auto_approve_enabled: Optional[bool] = None
    auto_approve_threshold: Optional[int] = None


class AutoRejectUpdate(BaseModel):
    auto_reject_enabled: Optional[bool] = None
    auto_reject_doc_types: Optional[list[str]] = None


@router.get("/settings/auto-approve")
async def get_auto_approve():
    return {"success": True, "data": get_settings(), "error": None}


@router.put("/settings/auto-approve")
async def put_auto_approve(body: AutoApproveUpdate):
    if body.auto_approve_threshold is not None and not (0 <= body.auto_approve_threshold <= 100):
        return {"success": False, "data": None, "error": "auto_approve_threshold must be between 0 and 100"}
    updated = update_settings(body.model_dump(exclude_none=True))
    return {"success": True, "data": updated, "error": None}


@router.put("/settings/auto-reject")
async def put_auto_reject(body: AutoRejectUpdate):
    updated = update_settings(body.model_dump(exclude_none=True))
    return {"success": True, "data": updated, "error": None}


@router.get("/settings/extraction-quality")
async def get_extraction_quality():
    metrics = get_metrics()
    total = metrics["auto_approved_fields_total"]
    corrected = metrics["corrected_after_approval_total"]
    correction_rate = round(corrected / total, 4) if total > 0 else None
    return {
        "success": True,
        "data": {
            "auto_approved_fields_total": total,
            "corrected_after_approval_total": corrected,
            "correction_rate": correction_rate,
        },
        "error": None,
    }
