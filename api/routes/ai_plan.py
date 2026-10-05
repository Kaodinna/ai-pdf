from services.credit_service import run_metered, CLAUDE_COSTS
from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from services.ai_service import ai_plan_from_instruction
from services.pdf_service import validate_pdf, extract_selected_pages
from services.storage_service import storage
from services.file_record_service import get_accessible_file_record

router = APIRouter()


class AIPlanRequest(BaseModel):
    file_id: str
    instruction: str


@router.post("/ai-plan")
async def ai_plan(req: AIPlanRequest, request: Request):
    if not req.instruction.strip():
        return {"success": False, "data": None, "error": "Instruction cannot be empty"}

    if not get_accessible_file_record(req.file_id, request.state.user):
        return {"success": False, "data": None, "error": "File record not found"}

    def _run_plan() -> dict:
        path = storage.get_upload_path(req.file_id)
        validate_pdf(path)
        plan = run_metered(request.state.user["id"], CLAUDE_COSTS["ai_plan"], "AI command", ai_plan_from_instruction, path, req.instruction, ref=req.file_id)

        pages = plan.get("pages_to_keep", [])
        if pages:
            result_bytes = extract_selected_pages(path, pages)
            filename = storage.save_output(result_bytes, "ai_result.pdf")
            plan["download_url"] = f"/download/{filename}"
        return plan

    # The Claude API call inside ai_plan_from_instruction is a blocking
    # network request that can take many seconds — run it off the event
    # loop so it doesn't stall every other in-flight request.
    try:
        plan = await run_in_threadpool(_run_plan)
        return {"success": True, "data": plan, "error": None}

    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except (RuntimeError, ValueError) as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"AI plan failed: {e}"}
