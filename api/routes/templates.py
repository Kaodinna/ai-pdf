from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from services.template_service import (
    list_templates, get_template, create_template, update_template, delete_template,
    copy_field_config_from, add_comment, list_comments,
)
from services.ai_service import ai_apply_template, ai_detect_doc_type, ai_extract_template_fields, ai_refine_extraction
from services.pdf_service import validate_pdf, extract_selected_pages
from services.storage_service import storage
from services.file_record_service import update_file_record
from services.rule_service import list_rules
from services.rule_engine import run_rules_on_file
from services.audit_service import log_event

router = APIRouter()


class TemplateCreate(BaseModel):
    name: str
    template_type: str
    direct_link_fields: list[str] = []
    table_fields: list[str] = []
    special_conditions: list[str] = []
    field_synonyms: dict[str, list[str]] = {}


class ApplyTemplateRequest(BaseModel):
    file_id: str


class DetectDocTypeRequest(BaseModel):
    file_id: str
    template_ids: Optional[list[str]] = None


class ExtractDataRequest(BaseModel):
    file_id: str
    page_numbers: Optional[list[int]] = None


class RefineExtractionRequest(BaseModel):
    file_id: str
    page_number: int
    current_fields: dict[str, Optional[str]] = {}
    current_table_rows: list[dict] = []
    instructions: str
    mode: str = "headers"


class TemplateUpdate(BaseModel):
    field_config: Optional[dict[str, dict]] = None
    table_config: Optional[dict[str, dict]] = None
    direct_link_fields: Optional[list[str]] = None
    table_fields: Optional[list[str]] = None
    unique_id_fields: Optional[list[str]] = None
    secondary_id_fields: Optional[list[str]] = None
    reference_id_fields: Optional[list[str]] = None
    editable_in_file: Optional[bool] = None


class CopyFromRequest(BaseModel):
    source_template_id: str


class CommentCreate(BaseModel):
    text: str
    user: str = "system"


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
            body.field_synonyms,
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


@router.put("/templates/{template_id}")
async def patch_template(template_id: str, body: TemplateUpdate):
    try:
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if not updates:
            return {"success": False, "data": None, "error": "No fields to update"}
        updated = update_template(template_id, updates)
        if not updated:
            return {"success": False, "data": None, "error": "Template not found"}
        return {"success": True, "data": updated, "error": None}
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
        from datetime import datetime
        # Persist extraction result — drop field_positions to keep storage lean
        slim_pages = [
            {k: v for k, v in p.items() if k != "field_positions"}
            for p in result.get("pages", [])
        ]
        file_updates = {
            "template_id": template_id,
            "template_name": template.get("name", ""),
            "template_type": template.get("template_type", ""),
            "extracted_at": datetime.utcnow().isoformat(),
            "pages": slim_pages,
        }

        # Run on_extraction automation rules
        on_extraction_rules = list_rules("on_extraction")
        triggered = run_rules_on_file(on_extraction_rules, slim_pages)
        for t in triggered:
            file_updates.update(t.get("applied_updates", {}))
        rule_names = [t["name"] for t in triggered]

        update_file_record(body.file_id, file_updates)
        log_event("extracted", "file", body.file_id,
                  entity_name=template.get("name", ""),
                  details={"template_id": template_id, "rules_triggered": rule_names,
                           "pages": len(slim_pages)})
        return {
            "success": True,
            "data": {
                "template_id": template_id,
                "template_name": template.get("name", ""),
                "template_type": template.get("template_type", ""),
                "rules_triggered": rule_names,
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


@router.post("/templates/{template_id}/copy-from")
async def copy_from(template_id: str, body: CopyFromRequest):
    try:
        updated = copy_field_config_from(template_id, body.source_template_id)
        if not updated:
            return {"success": False, "data": None, "error": "Template not found"}
        return {"success": True, "data": updated, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.get("/templates/{template_id}/comments")
async def get_comments(template_id: str):
    try:
        return {"success": True, "data": list_comments(template_id), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/templates/{template_id}/comments")
async def post_comment(template_id: str, body: CommentCreate):
    if not body.text.strip():
        return {"success": False, "data": None, "error": "text is required"}
    try:
        comment = add_comment(template_id, body.user, body.text.strip())
        if not comment:
            return {"success": False, "data": None, "error": "Template not found"}
        return {"success": True, "data": comment, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/templates/{template_id}/refine")
async def refine_extraction(template_id: str, body: RefineExtractionRequest):
    try:
        template = get_template(template_id)
        if not template:
            return {"success": False, "data": None, "error": "Template not found"}

        path = storage.get_upload_path(body.file_id)
        validate_pdf(path)

        result = ai_refine_extraction(
            path,
            body.page_number,
            body.current_fields,
            body.current_table_rows,
            body.instructions,
            template.get("template_type", "document"),
            body.mode,
        )
        return {"success": True, "data": result, "error": None}
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except (RuntimeError, ValueError) as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Refinement failed: {e}"}
