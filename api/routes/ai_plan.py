from fastapi import APIRouter
from pydantic import BaseModel

from services.ai_service import ai_plan_from_instruction
from services.pdf_service import validate_pdf, extract_selected_pages
from services.storage_service import storage

router = APIRouter()


class AIPlanRequest(BaseModel):
    file_id: str
    instruction: str


@router.post("/ai-plan")
async def ai_plan(req: AIPlanRequest):
    if not req.instruction.strip():
        return {"success": False, "data": None, "error": "Instruction cannot be empty"}

    try:
        path = storage.get_upload_path(req.file_id)
        validate_pdf(path)
        plan = ai_plan_from_instruction(path, req.instruction)

        pages = plan.get("pages_to_keep", [])
        if pages:
            result_bytes = extract_selected_pages(path, pages)
            filename = storage.save_output(result_bytes, "ai_result.pdf")
            plan["download_url"] = f"/download/{filename}"

        return {"success": True, "data": plan, "error": None}

    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except (RuntimeError, ValueError) as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"AI plan failed: {e}"}
