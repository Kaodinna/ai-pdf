from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional

from services.template_service import (
    list_templates, get_template, create_template, update_template, delete_template,
    copy_field_config_from, add_comment, list_comments, keyword_match_template,
)
from services.ai_service import ai_apply_template, ai_detect_doc_type, ai_extract_template_fields, ai_refine_extraction, ai_smart_extract
from services.pdf_service import validate_pdf, extract_selected_pages, extract_text_per_page
from services.storage_service import storage
from services.file_record_service import update_file_record, get_accessible_file_record
from services.rule_service import list_rules
from services.rule_engine import run_rules_on_file
from services.audit_service import log_event
from services.approval_settings_service import get_settings, all_fields_cleared, should_auto_reject

router = APIRouter()


class TemplateCreate(BaseModel):
    name: str
    template_type: str
    direct_link_fields: list[str] = []
    table_fields: list[str] = []
    special_conditions: list[str] = []
    field_synonyms: dict[str, list[str]] = {}
    unique_id_fields: list[str] = []


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
            unique_id_fields=body.unique_id_fields,
        )
        return {"success": True, "data": template, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/templates/detect")
async def detect_doc_type(body: DetectDocTypeRequest, request: Request):
    try:
        if not get_accessible_file_record(body.file_id, request.state.user):
            return {"success": False, "data": None, "error": "File record not found"}
        all_templates = list_templates()
        templates = (
            [t for t in all_templates if t["id"] in body.template_ids]
            if body.template_ids
            else all_templates
        )
        if not templates:
            return {"success": False, "data": None, "error": "No templates found"}

        def _detect() -> dict:
            path = storage.get_upload_path(body.file_id)
            validate_pdf(path)
            return ai_detect_doc_type(path, templates)

        # The Claude API call inside ai_detect_doc_type is a blocking network
        # request that can take many seconds — run it off the event loop.
        result = await run_in_threadpool(_detect)
        return {"success": True, "data": result, "error": None}
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except (RuntimeError, ValueError) as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Detection failed: {e}"}


@router.post("/templates/suggest")
async def suggest_template(body: ApplyTemplateRequest, request: Request):
    """
    Auto-suggest which saved template a freshly uploaded document matches,
    checking against the whole template library in one call. Persists the
    suggestion onto the file record so it shows up in the file list without
    the user having to manually check each template.
    """
    try:
        if not get_accessible_file_record(body.file_id, request.state.user):
            return {"success": False, "data": None, "error": "File record not found"}
        all_templates = list_templates()
        if not all_templates:
            return {"success": True, "data": {"template_id": None, "template_name": None, "pages": []}, "error": None}

        def _analyze() -> dict:
            path = storage.get_upload_path(body.file_id)
            validate_pdf(path)

            # ── Free pass: try to match on the text pdfplumber already
            # extracts before spending an AI call. Only a confident,
            # unambiguous match counts.
            full_text = "\n".join(
                p["text_preview"] for p in extract_text_per_page(path, char_limit=20000)
            )
            kw_match = keyword_match_template(full_text, all_templates)
            if kw_match:
                return {"source": "keyword_match", "keyword_match": kw_match}

            # ── Fall back to the AI-based detector (needed for scans, or
            # when the keyword pass found no confident/unambiguous match) ──
            return {"source": "ai_detect", "result": ai_detect_doc_type(path, all_templates)}

        # Text extraction and the Claude API call are both blocking work
        # that can take real time on large/scanned documents — run off the
        # event loop so they don't stall every other in-flight request.
        analysis = await run_in_threadpool(_analyze)

        if analysis["source"] == "keyword_match":
            keyword_match = analysis["keyword_match"]
            update_file_record(body.file_id, {
                "suggested_template_id": keyword_match["id"],
                "suggested_template_name": keyword_match["name"],
            })
            log_event("template_suggested", "file", body.file_id,
                      entity_name=keyword_match["name"],
                      details={"template_id": keyword_match["id"], "source": "keyword_match"})
            return {
                "success": True,
                "data": {
                    "template_id": keyword_match["id"],
                    "template_name": keyword_match["name"],
                    "pages": [],
                    "source": "keyword_match",
                },
                "error": None,
            }

        result = analysis["result"]
        pages = result.get("pages", [])

        # Majority vote across pages — ignore pages with no match.
        votes: dict[str, int] = {}
        for p in pages:
            tid = p.get("template_id")
            if tid:
                votes[tid] = votes.get(tid, 0) + 1
        suggested_id = max(votes, key=votes.get) if votes else None
        suggested_name = next(
            (p.get("template_name") for p in pages if p.get("template_id") == suggested_id),
            None,
        )

        update_file_record(body.file_id, {
            "suggested_template_id": suggested_id,
            "suggested_template_name": suggested_name,
        })
        log_event("template_suggested", "file", body.file_id,
                  entity_name=suggested_name or "No match",
                  details={"template_id": suggested_id, "pages": len(pages), "source": "ai_detect"})

        return {
            "success": True,
            "data": {
                "template_id": suggested_id,
                "template_name": suggested_name,
                "pages": pages,
                "source": "ai_detect",
            },
            "error": None,
        }
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except (RuntimeError, ValueError) as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Suggestion failed: {e}"}


def _humanize(key: str) -> str:
    return " ".join(w.capitalize() for w in key.replace("-", "_").split("_") if w)


@router.post("/templates/propose")
async def propose_template(body: ApplyTemplateRequest, request: Request):
    """
    When a document matches no existing template, lift a draft template out of
    it instead of making the user type field names from scratch: run the same
    template-less inference Smart Extract uses, then turn whatever fields and
    columns it found into an editable starting point. Nothing is saved here —
    the draft is only persisted if the user reviews it and calls POST /templates.
    """
    try:
        if not get_accessible_file_record(body.file_id, request.state.user):
            return {"success": False, "data": None, "error": "File record not found"}

        def _propose() -> dict:
            path = storage.get_upload_path(body.file_id)
            validate_pdf(path)
            return ai_smart_extract(path)

        # The Claude API call inside ai_smart_extract is a blocking network
        # request that can take many seconds — run it off the event loop.
        result = await run_in_threadpool(_propose)
        pages = result.get("pages", [])
        if not pages:
            return {"success": False, "data": None, "error": "Nothing to propose — the document has no readable pages"}

        # Most common non-null document_type across pages wins.
        type_votes: dict[str, int] = {}
        for p in pages:
            dt = p.get("document_type")
            if dt:
                type_votes[dt] = type_votes.get(dt, 0) + 1
        suggested_type = max(type_votes, key=type_votes.get) if type_votes else "Document"

        # Union of field keys and table columns seen across all pages, order preserved.
        seen_fields: list[str] = []
        for p in pages:
            for key in (p.get("fields") or {}).keys():
                humanized = _humanize(key)
                if humanized and humanized not in seen_fields:
                    seen_fields.append(humanized)

        seen_columns: list[str] = []
        for p in pages:
            for col in p.get("table_columns") or []:
                if col and col not in seen_columns:
                    seen_columns.append(col)

        return {
            "success": True,
            "data": {
                "suggested_name": suggested_type,
                "suggested_type": suggested_type,
                "direct_link_fields": seen_fields,
                "table_fields": seen_columns,
            },
            "error": None,
        }
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except (RuntimeError, ValueError) as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Proposal failed: {e}"}


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
async def apply_template(template_id: str, body: ApplyTemplateRequest, request: Request):
    try:
        template = get_template(template_id)
        if not template:
            return {"success": False, "data": None, "error": "Template not found"}
        if not get_accessible_file_record(body.file_id, request.state.user):
            return {"success": False, "data": None, "error": "File record not found"}

        def _apply() -> tuple[dict, str | None]:
            path = storage.get_upload_path(body.file_id)
            validate_pdf(path)
            result = ai_apply_template(path, template)
            pages = result.get("pages_to_keep", [])

            dl_url = None
            if pages:
                pdf_bytes = extract_selected_pages(path, pages)
                filename = storage.save_output(pdf_bytes, f"template_{template_id[:8]}.pdf")
                dl_url = f"/download/{filename}"
            return result, dl_url

        # The Claude API call inside ai_apply_template is a blocking network
        # request that can take many seconds — run it off the event loop.
        result, download_url = await run_in_threadpool(_apply)
        pages = result.get("pages_to_keep", [])

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
async def extract_template_data(template_id: str, body: ExtractDataRequest, request: Request):
    try:
        template = get_template(template_id)
        if not template:
            return {"success": False, "data": None, "error": "Template not found"}
        if not get_accessible_file_record(body.file_id, request.state.user):
            return {"success": False, "data": None, "error": "File record not found"}

        def _extract() -> dict:
            path = storage.get_upload_path(body.file_id)
            validate_pdf(path)
            return ai_extract_template_fields(path, template, body.page_numbers)

        # The Claude API call inside ai_extract_template_fields is a blocking
        # network request that can take many seconds — run it off the event
        # loop so it doesn't stall every other in-flight request.
        result = await run_in_threadpool(_extract)
        from datetime import datetime
        # Persist the full extraction result, including field_positions — the
        # file review screen highlights a field's location on the original
        # document by looking it up here, so it has to survive a page reload.
        slim_pages = result.get("pages", [])
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

        doc_type = template.get("template_type")
        auto_rejected = should_auto_reject([doc_type] if doc_type else [])
        auto_approved = (
            not auto_rejected
            and get_settings().get("auto_approve_enabled", False)
            and all_fields_cleared(slim_pages)
        )
        if auto_rejected:
            file_updates["decision"] = "rejected"
        elif auto_approved:
            file_updates["decision"] = "approved"

        update_file_record(body.file_id, file_updates)
        log_event("extracted", "file", body.file_id,
                  entity_name=template.get("name", ""),
                  details={"template_id": template_id, "rules_triggered": rule_names,
                           "pages": len(slim_pages)})
        if auto_rejected:
            log_event("auto_rejected", "file", body.file_id,
                      entity_name=template.get("name", ""),
                      details={"reason": "document type matched the auto-reject list", "document_type": doc_type})
        elif auto_approved:
            log_event("auto_approved", "file", body.file_id,
                      entity_name=template.get("name", ""),
                      details={"reason": "all fields cleared the auto-approve threshold"})
        decision = "rejected" if auto_rejected else ("approved" if auto_approved else None)
        return {
            "success": True,
            "data": {
                "template_id": template_id,
                "template_name": template.get("name", ""),
                "template_type": template.get("template_type", ""),
                "rules_triggered": rule_names,
                "decision": decision,
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
async def refine_extraction(template_id: str, body: RefineExtractionRequest, request: Request):
    try:
        template = get_template(template_id)
        if not template:
            return {"success": False, "data": None, "error": "Template not found"}
        if not get_accessible_file_record(body.file_id, request.state.user):
            return {"success": False, "data": None, "error": "File record not found"}

        def _refine() -> dict:
            path = storage.get_upload_path(body.file_id)
            validate_pdf(path)
            return ai_refine_extraction(
                path,
                body.page_number,
                body.current_fields,
                body.current_table_rows,
                body.instructions,
                template.get("template_type", "document"),
                body.mode,
            )

        # The Claude API call inside ai_refine_extraction is a blocking
        # network request that can take many seconds — run it off the event
        # loop so it doesn't stall every other in-flight request.
        result = await run_in_threadpool(_refine)
        return {"success": True, "data": result, "error": None}
    except FileNotFoundError as e:
        return {"success": False, "data": None, "error": str(e)}
    except (RuntimeError, ValueError) as e:
        return {"success": False, "data": None, "error": str(e)}
    except Exception as e:
        return {"success": False, "data": None, "error": f"Refinement failed: {e}"}
