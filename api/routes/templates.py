from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from services.template_service import list_templates, get_template, create_template, delete_template
from services.ai_service import ai_apply_template, ai_detect_doc_type, ai_extract_template_fields
from services.pdf_service import validate_pdf, extract_selected_pages
from services.storage_service import storage

router = APIRouter()


class TemplateCreate(BaseModel):
    name: str
    template_type: str
    direct_link_fields: list[str] = []
    table_fields: list[str] = []
    special_conditions: list[str] = []


class ApplyTemplateRequest(BaseModel):
    file_id: str


class DetectDocTypeRequest(BaseModel):
    file_id: str
    template_ids: Optional[list[str]] = None


class ExtractDataRequest(BaseModel):
    file_id: str
    page_numbers: Optional[list[int]] = None


@router.get("/templates")
async def get_templates():
    try:
        templates = list_templates()
        return {"success": True, "data": templates, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/templates")
async def save_template(body: TemplateCreate):
    if not body.name.strip() or not body.template_type.strip():
        return {"success": False, "data": None, "error": "name and template_type are required"}
    try:
        template = create_template(
            body.name,
            body.template_type,
            body.direct_link_fields,
            body.table_fields,
            body.special_conditions,
        )
        return {"success": True, "data": template, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/templates/detect")
async def detect_doc_type(body: DetectDocTypeRequest):
    try:
        all_templates = list_templates()
        templates = (
            [t for t in all_templates if t["id"] in body.template_ids]
            if body.template_ids
            else all_templates
        )
        if not templates:
            return {"success": False, "data": None, "error": "No templates found"}

        path = storage.get_upload_path(body.file_id)
        validate_pdf(path)

        result = ai_detect_doc_type(path, templates)
        return {"success": True, "data": result, "error": None}
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except (RuntimeError, ValueError) as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Detection failed: {e}"}


@router.delete("/templates/{template_id}")
async def remove_template(template_id: str):
    try:
        deleted = delete_template(template_id)
        if not deleted:
            return {"success": False, "data": None, "error": "Template not found"}
        return {"success": True, "data": {"deleted": template_id}, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/templates/{template_id}/apply")
async def apply_template(template_id: str, body: ApplyTemplateRequest):
    try:
        template = get_template(template_id)
        if not template:
            return {"success": False, "data": None, "error": "Template not found"}

        path = storage.get_upload_path(body.file_id)
        validate_pdf(path)

        result = ai_apply_template(path, template)
        pages = result.get("pages_to_keep", [])

        download_url = None
        if pages:
            pdf_bytes = extract_selected_pages(path, pages)
            filename = storage.save_output(pdf_bytes, f"template_{template_id[:8]}.pdf")
            download_url = f"/download/{filename}"

        return {
            "success": True,
            "data": {
                "pages_matched": pages,
                "reason": result.get("reason", ""),
                "download_url": download_url,
            },
            "error": None,
        }
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except (RuntimeError, ValueError) as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Template apply failed: {e}"}


@router.post("/templates/{template_id}/extract-data")
async def extract_template_data(template_id: str, body: ExtractDataRequest):
    try:
        template = get_template(template_id)
        if not template:
            return {"success": False, "data": None, "error": "Template not found"}

        path = storage.get_upload_path(body.file_id)
        validate_pdf(path)

        result = ai_extract_template_fields(path, template, body.page_numbers)
        return {
            "success": True,
            "data": {
                "template_id": template_id,
                "template_name": template.get("name", ""),
                "template_type": template.get("template_type", ""),
                **result,
            },
            "error": None,
        }
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except (RuntimeError, ValueError) as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Extraction failed: {e}"}
