import json
import os
import re
from pathlib import Path

import anthropic

from .pdf_service import (
    extract_text_per_page,
    extract_page_words,
    extract_text_with_layout,
    render_pages_as_images,
)

MODEL = "claude-sonnet-5"


def _get_client() -> anthropic.Anthropic:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise EnvironmentError("ANTHROPIC_API_KEY environment variable is not set")
    return anthropic.Anthropic(api_key=key)


def _parse_json_from_response(text: str) -> dict:
    """Extract the first JSON object from a Claude response."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON object found in AI response: {text[:200]}")
    return json.loads(match.group())


def _pages_need_vision(pages_meta: list[dict]) -> bool:
    """
    True if any page lacks a real text layer (e.g. a scan), meaning vision is
    actually required. A page with a text layer is read more accurately (and
    far more cheaply) straight from that layer than by re-OCR'ing a rendered
    image of it, so vision is only worth the cost when text extraction fails.
    """
    return any(not (p.get("text_preview") or "").strip() for p in pages_meta)


def _image_block(img: dict) -> dict:
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": img["media_type"],
            "data": img["base64"],
        },
    }


def _render_page(pdf_path: Path, page_number: int) -> dict | None:
    """Render a single PDF page as an image. Returns None on failure."""
    try:
        imgs = render_pages_as_images(pdf_path, page_numbers=[page_number], dpi=150)
        return imgs[0] if imgs else None
    except Exception:
        return None


def ai_plan_from_instruction(pdf_path: Path, instruction: str) -> dict:
    """
    Given a PDF and a natural language instruction, return a JSON plan:
    { "pages_to_keep": [1, 2, ...], "operation": "split|merge|extract", "reason": "..." }
    Uses page images when available for better content understanding.
    """
    try:
        pages_meta = extract_text_per_page(pdf_path, char_limit=1)
        total = len(pages_meta)

        # Try to render all pages as images
        try:
            if _pages_need_vision(pages_meta):
                page_images = render_pages_as_images(pdf_path, dpi=150)
                use_vision = True
            else:
                page_images = []
                use_vision = False
        except Exception:
            page_images = []
            use_vision = False

        if use_vision and page_images:
            content: list[dict] = []
            for img in page_images:
                content.append({"type": "text", "text": f"[PAGE {img['page_number']}]"})
                content.append(_image_block(img))

            content.append({
                "type": "text",
                "text": f"""The user's instruction is:
"{instruction}"

This PDF has {total} pages (shown above as images, one per [PAGE N] label).

Analyse the page images and return ONLY a valid JSON object (no explanation, no markdown):
{{
  "pages_to_keep": [list of 1-indexed page numbers to include in the result],
  "operation": "extract",
  "reason": "brief explanation of why these pages were selected"
}}

If the instruction involves removing blank pages, exclude pages with no meaningful content.
If the instruction references content (like "signature", "invoice", "section heading"), select pages that contain that content.
Always return valid JSON only.""",
            })
        else:
            # Text fallback
            page_summary = "\n".join(
                f"Page {p['page_number']}: {p['text_preview'] or '[no text]'}"
                for p in extract_text_per_page(pdf_path, char_limit=300)
            )
            content = [{
                "type": "text",
                "text": f"""You are a PDF processing assistant. A user has uploaded a PDF with {total} pages.

Here is a preview of each page's text content:

{page_summary}

The user's instruction is:
"{instruction}"

Analyse the pages and return ONLY a valid JSON object (no explanation, no markdown, no code block) with this exact structure:
{{
  "pages_to_keep": [list of 1-indexed page numbers to include in the result],
  "operation": "extract",
  "reason": "brief explanation of why these pages were selected"
}}

If the instruction involves removing blank pages, exclude pages with no meaningful text.
If the instruction references content (like "signature", "invoice", "section heading"), select pages that contain that content.
Always return valid JSON only.""",
            }]

        client = _get_client()
        message = client.messages.create(
            model=MODEL,
            max_tokens=8192,
            thinking={"type": "adaptive"},
            messages=[{"role": "user", "content": content}],
        )
        raw = next(b.text for b in message.content if b.type == "text")
        result = _parse_json_from_response(raw)

        if "pages_to_keep" not in result:
            raise ValueError("AI response missing 'pages_to_keep' field")
        if not isinstance(result["pages_to_keep"], list):
            raise ValueError("'pages_to_keep' must be a list")

        return result

    except anthropic.APIError as e:
        raise RuntimeError(f"Anthropic API error: {e}") from e
    except json.JSONDecodeError as e:
        raise ValueError(f"AI returned invalid JSON: {e}") from e


def ai_apply_template(pdf_path: Path, template: dict) -> dict:
    """
    Apply a template definition to a PDF and return matched pages.
    Returns: { "pages_to_keep": [...], "reason": "..." }
    Uses page images when available for better matching accuracy.
    """
    try:
        pages_meta = extract_text_per_page(pdf_path, char_limit=1)
        total = len(pages_meta)

        direct_link_fields = template.get("direct_link_fields", [])
        fields_hint = ", ".join(direct_link_fields) if direct_link_fields else template.get("description", "")

        template_context = f"""Template:
- Name: {template.get('name', 'Unnamed')}
- Document type: {template.get('template_type', '')}
- Identifying fields: {fields_hint}"""

        try:
            if _pages_need_vision(pages_meta):
                page_images = render_pages_as_images(pdf_path, dpi=150)
                use_vision = True
            else:
                page_images = []
                use_vision = False
        except Exception:
            page_images = []
            use_vision = False

        if use_vision and page_images:
            content: list[dict] = []
            for img in page_images:
                content.append({"type": "text", "text": f"[PAGE {img['page_number']}]"})
                content.append(_image_block(img))

            content.append({
                "type": "text",
                "text": f"""You are a PDF processing assistant. This PDF has {total} pages (shown above).

{template_context}

Based on the template, identify which pages match and return ONLY a valid JSON object:
{{
  "pages_to_keep": [list of 1-indexed page numbers that match the template],
  "reason": "brief explanation of why these pages were selected"
}}

Return valid JSON only, no markdown, no explanation outside the JSON.""",
            })
        else:
            page_summary = "\n".join(
                f"Page {p['page_number']}: {p['text_preview'] or '[no text]'}"
                for p in extract_text_per_page(pdf_path, char_limit=300)
            )
            content = [{
                "type": "text",
                "text": f"""You are a PDF processing assistant. A user has a PDF with {total} pages.

Here is a preview of each page's text content:

{page_summary}

The user wants to apply this template:
{template_context}

Based on the template definition, identify which pages match and return ONLY a valid JSON object:
{{
  "pages_to_keep": [list of 1-indexed page numbers that match the template],
  "reason": "brief explanation of why these pages were selected"
}}

Return valid JSON only, no markdown, no explanation outside the JSON.""",
            }]

        client = _get_client()
        message = client.messages.create(
            model=MODEL,
            max_tokens=8192,
            thinking={"type": "adaptive"},
            messages=[{"role": "user", "content": content}],
        )
        raw = next(b.text for b in message.content if b.type == "text")
        result = _parse_json_from_response(raw)

        if "pages_to_keep" not in result:
            raise ValueError("AI response missing 'pages_to_keep' field")

        return result

    except anthropic.APIError as e:
        raise RuntimeError(f"Anthropic API error: {e}") from e
    except json.JSONDecodeError as e:
        raise ValueError(f"AI returned invalid JSON: {e}") from e


def _search_value_position(words: list[dict], value_text: str) -> dict | None:
    """
    Given an already-extracted value string, find its bounding box in the word list.
    Used only for highlight positioning — not for extraction.
    """
    if not words or not value_text:
        return None
    tokens = value_text.strip().lower().split()
    n = len(tokens)
    if n == 0:
        return None

    for i in range(len(words) - n + 1):
        chunk = words[i : i + n]
        if [w["text"].lower() for w in chunk] == tokens:
            return {
                "x0": min(w["x0"] for w in chunk),
                "y0": min(w["y0"] for w in chunk),
                "x1": max(w["x1"] for w in chunk),
                "y1": max(w["y1"] for w in chunk),
            }

    if n == 1 and len(tokens[0]) >= 4:
        for w in words:
            if tokens[0] in w["text"].lower():
                return {"x0": w["x0"], "y0": w["y0"], "x1": w["x1"], "y1": w["y1"]}

    return None


def _build_table_evidence(table_rows: list[dict], column_names: list[str], applied_conditions: list[str] | None = None) -> str:
    """
    Build a factual evidence narrative for extracted table rows from what was actually
    observed during extraction — not a post-hoc AI explanation, to avoid fabricating
    justification (e.g. library matches, tax derivation) the extraction didn't perform.
    """
    if not column_names:
        return ""
    if not table_rows:
        return "No table rows were found on this page."

    row_word = "row" if len(table_rows) == 1 else "rows"
    parts = [f"{len(table_rows)} {row_word} extracted across {len(column_names)} columns."]

    total_cells = len(table_rows) * len(column_names)
    missing_cells = sum(
        1 for row in table_rows for col in column_names
        if row.get(col) in (None, "")
    )
    if missing_cells == 0:
        parts.append("Every cell had a value visible on the page.")
    else:
        verb = "was" if missing_cells == 1 else "were"
        parts.append(f"{missing_cells} of {total_cells} cells {verb} left blank because no value was visible on the page.")

    if applied_conditions:
        parts.append(f"{len(applied_conditions)} special condition(s) were triggered by these rows — see Applied Rules below.")

    return " ".join(parts)


def _apply_conditions_with_ai(table_rows: list[dict], conditions: list[str]) -> list[str]:
    """Use Claude to evaluate special conditions against extracted table rows."""
    if not table_rows or not conditions:
        return []
    try:
        client = _get_client()
        prompt = f"""Check which of the following conditions are triggered by the table rows below.

Conditions:
{chr(10).join(f'- {c}' for c in conditions)}

Table rows (JSON):
{json.dumps(table_rows, indent=2)}

Return ONLY a JSON array of plain-English strings for each triggered condition.
Example: ["danger=1 because row with item 'wine' was found"]
Return [] if nothing triggered. No markdown."""
        msg = client.messages.create(
            model=MODEL,
            max_tokens=2048,
            thinking={"type": "adaptive"},
            messages=[{"role": "user", "content": prompt}],
        )
        raw = next(b.text for b in msg.content if b.type == "text")
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if m:
            return json.loads(m.group())
    except Exception:
        pass
    return []


def ai_group_documents(pdf_path: Path) -> dict:
    """
    Analyse all pages and group them into logical documents.

    Pages are related when they share a reference number, a matching
    header/footer, or are clearly a continuation of the same document.
    For each group the response includes:
      - document_type   (invoices always sorted first)
      - pages           (1-indexed list)
      - customer        (buyer / consignee / bill-to party)
      - agent           (freight forwarder / notify party / issuing agent)
      - reference       (invoice / BL / AWB number, etc.)
      - is_invoice      (true when document_type contains "invoice")

    Returns:
      { "documents": [ { ...fields above... }, ... ] }
    """
    try:
        pages_meta = extract_text_per_page(pdf_path, char_limit=1)
        total = len(pages_meta)

        instruction = f"""You are an expert document analyst reviewing a multi-page PDF.
The PDF has {total} page(s). Your job is to:

1. GROUP pages that belong to the same logical document.
   Pages are related when they share:
   - The same reference / document number (invoice no., B/L no., AWB no., PO no.)
   - The same header, issuer, and recipient
   - A "Page X of Y" or "continued" marker pointing to an adjacent page
   Treat each standalone page as its own single-page document.

2. For each document group identify:
   - document_type: one of "Commercial Invoice", "Proforma Invoice", "Tax Invoice",
     "Bill of Lading", "Air Waybill", "Packing List", "Certificate of Origin",
     "Delivery Order", "Customs Permit", "Insurance Certificate", "Other"
   - customer: the BUYER / CONSIGNEE / BILL-TO party (company name).
     For invoices this is the party being billed.
     For shipping docs this is the consignee / importer.
   - agent: the FREIGHT FORWARDER / NOTIFY PARTY / ISSUING AGENT (company name).
     For invoices this is the seller / issuer.
     For shipping docs this is the notify party or carrier agent.
   - reference: the primary document reference number (invoice no., B/L no., etc.)

3. PRIORITISE invoices — sort all invoice-type documents to the TOP of the list,
   followed by other document types.

Return ONLY a valid JSON object (no markdown, no explanation):
{{
  "documents": [
    {{
      "document_number": 1,
      "document_type": "Commercial Invoice",
      "pages": [1, 2],
      "customer": "BUYER CORP LTD",
      "agent": "SELLER PTE LTD",
      "reference": "INV-2024-001",
      "is_invoice": true
    }}
  ]
}}

Rules:
- is_invoice must be true when document_type contains the word "Invoice"
- customer and agent must be company/person names only — never null if detectable
- Use null only when a field genuinely cannot be determined from the visible content
- Every page must appear in exactly one document group"""

        try:
            if _pages_need_vision(pages_meta):
                page_images = render_pages_as_images(pdf_path, dpi=150)
                use_vision = True
            else:
                page_images = []
                use_vision = False
        except Exception:
            page_images = []
            use_vision = False

        if use_vision and page_images:
            content: list[dict] = []
            for img in page_images:
                content.append({"type": "text", "text": f"[PAGE {img['page_number']}]"})
                content.append(_image_block(img))
            content.append({"type": "text", "text": instruction})
        else:
            page_texts = "\n".join(
                f"Page {p['page_number']}: {p['text_preview'] or '[no text]'}"
                for p in extract_text_per_page(pdf_path, char_limit=500)
            )
            content = [{
                "type": "text",
                "text": f"{instruction}\n\nPages:\n{page_texts}",
            }]

        client = _get_client()
        message = client.messages.create(
            model=MODEL,
            max_tokens=8192,
            thinking={"type": "adaptive"},
            messages=[{"role": "user", "content": content}],
        )
        raw = next(b.text for b in message.content if b.type == "text")
        result = _parse_json_from_response(raw)

        if "documents" not in result or not isinstance(result["documents"], list):
            raise ValueError("AI response missing 'documents' list")

        # Guarantee invoices are first even if the model didn't sort correctly
        result["documents"].sort(key=lambda d: (0 if d.get("is_invoice") else 1))

        return result

    except anthropic.APIError as e:
        raise RuntimeError(f"Anthropic API error: {e}") from e
    except json.JSONDecodeError as e:
        raise ValueError(f"AI returned invalid JSON: {e}") from e


def ai_detect_doc_type(pdf_path: Path, templates: list[dict]) -> dict:
    """
    Given a PDF and a list of templates, detect which template each page belongs to.
    Uses page images when available for higher accuracy.
    Returns: { "pages": [{ "page_number": int, "template_id": str|null, "template_name": str|null }] }
    """
    try:
        pages_meta = extract_text_per_page(pdf_path, char_limit=1)
        total = len(pages_meta)

        template_descriptions = []
        for t in templates:
            fields = ", ".join(t.get("direct_link_fields", []))
            template_descriptions.append(
                f"- ID: {t['id']} | Name: {t['name']} | Type: {t.get('template_type', t['name'])} "
                f"| Identifying fields: {fields or 'none'}"
            )
        templates_text = "\n".join(template_descriptions)

        classifier_instruction = f"""You are a document classifier. You have {total} PDF pages and a list of document templates.

Each template lists its identifying fields — field names/labels that, if present on a page, indicate it belongs to that template type.

Templates:
{templates_text}

For each page, determine which template it belongs to by looking for the identifying field names.
Return ONLY a valid JSON object:
{{
  "pages": [
    {{ "page_number": 1, "template_id": "uuid-or-null", "template_name": "name-or-null" }},
    {{ "page_number": 2, "template_id": "uuid-or-null", "template_name": "name-or-null" }}
  ]
}}

Use null for both template_id and template_name if a page doesn't match any template.
Return valid JSON only, no markdown."""

        try:
            if _pages_need_vision(pages_meta):
                page_images = render_pages_as_images(pdf_path, dpi=150)
                use_vision = True
            else:
                page_images = []
                use_vision = False
        except Exception:
            page_images = []
            use_vision = False

        if use_vision and page_images:
            content: list[dict] = []
            for img in page_images:
                content.append({"type": "text", "text": f"[PAGE {img['page_number']}]"})
                content.append(_image_block(img))
            content.append({"type": "text", "text": classifier_instruction})
        else:
            page_texts = "\n".join(
                f"Page {p['page_number']}: {p['text_preview'] or '[no text]'}"
                for p in extract_text_per_page(pdf_path, char_limit=500)
            )
            content = [{
                "type": "text",
                "text": f"""{classifier_instruction.replace('You have {total} PDF pages', f'You have {total} PDF pages')}

Pages:
{page_texts}""",
            }]

        client = _get_client()
        message = client.messages.create(
            model=MODEL,
            max_tokens=8192,
            thinking={"type": "adaptive"},
            messages=[{"role": "user", "content": content}],
        )
        raw = next(b.text for b in message.content if b.type == "text")
        result = _parse_json_from_response(raw)

        if "pages" not in result:
            raise ValueError("AI response missing 'pages' field")

        return result

    except anthropic.APIError as e:
        raise RuntimeError(f"Anthropic API error: {e}") from e
    except json.JSONDecodeError as e:
        raise ValueError(f"AI returned invalid JSON: {e}") from e


def _apply_decision_status(fields: dict[str, str | None], field_meta: dict[str, dict]) -> None:
    """Stamp each field_meta entry with a review status, gated by the tenant's auto-approve setting."""
    from services.approval_settings_service import get_settings
    from services.metrics_service import increment
    settings = get_settings()
    enabled = settings.get("auto_approve_enabled", False)
    threshold = settings.get("auto_approve_threshold", 90)
    for fname, meta in field_meta.items():
        if fields.get(fname) is None:
            meta["status"] = "needs_review"
        elif enabled and meta.get("confidence", 0) >= threshold:
            meta["status"] = "approved"
            increment("auto_approved_fields_total")
        else:
            meta["status"] = "needs_review"


def ai_refine_extraction(
    pdf_path: Path,
    page_number: int,
    current_fields: dict[str, str | None],
    current_table_rows: list[dict],
    instructions: str,
    doc_type: str,
    mode: str = "headers",
) -> dict:
    """
    Apply natural-language correction instructions to already-extracted data.
    mode='headers' corrects field values; mode='table' corrects table rows.
    Returns { "fields": {...} } or { "table_rows": [...] }.
    """
    page_text = extract_text_with_layout(pdf_path, page_number)
    page_image = None if page_text.strip() else _render_page(pdf_path, page_number)

    try:
        client = _get_client()

        if mode == "headers":
            current_json = json.dumps(current_fields, indent=2)
            if page_image:
                content: list[dict] = [
                    _image_block(page_image),
                    {
                        "type": "text",
                        "text": f"""You are correcting and extending extracted field values from a {doc_type} document (shown above).

Current extracted fields:
{current_json}

User correction instructions:
{instructions}

Rules:
- Apply all changes described in the instructions.
- If instructions ask to extract NEW fields not in the current list, add them to the JSON output.
- Leave all other existing values exactly as they are.
- Return ONLY a valid JSON object. No markdown, no explanation.""",
                    },
                ]
            else:
                content = [{
                    "type": "text",
                    "text": f"""You are correcting and extending extracted field values from a {doc_type} document.

Document text:
{page_text}

Current extracted fields:
{current_json}

User correction instructions:
{instructions}

Rules:
- Apply all changes described in the instructions.
- If instructions ask to extract NEW fields not in the current list, add them to the JSON output.
- Leave all other existing values exactly as they are.
- Return ONLY a valid JSON object. No markdown, no explanation.""",
                }]

            msg = client.messages.create(
                model=MODEL, max_tokens=4096,
                thinking={"type": "adaptive"},
                messages=[{"role": "user", "content": content}],
            )
            raw = next(b.text for b in msg.content if b.type == "text")
            result = _parse_json_from_response(raw)
            # Preserve existing fields, overlay with Claude's result (includes any new fields)
            merged = {**current_fields, **result}
            return {"fields": merged}

        else:  # table mode
            if not current_table_rows:
                return {"table_rows": []}
            columns = list(current_table_rows[0].keys())
            current_json = json.dumps(current_table_rows, indent=2)

            if page_image:
                content = [
                    _image_block(page_image),
                    {
                        "type": "text",
                        "text": f"""You are correcting extracted table rows from a {doc_type} document (shown above).

Table columns: {', '.join(columns)}

Current extracted rows:
{current_json}

User correction instructions:
{instructions}

Apply ONLY the changes described in the instructions. Keep all other rows and values unchanged.
Return ONLY a valid JSON array of rows with the same column keys. No markdown, no explanation.""",
                    },
                ]
            else:
                content = [{
                    "type": "text",
                    "text": f"""You are correcting extracted table rows from a {doc_type} document.

Document text:
{page_text}

Table columns: {', '.join(columns)}

Current extracted rows:
{current_json}

User correction instructions:
{instructions}

Apply ONLY the changes described in the instructions. Keep all other rows and values unchanged.
Return ONLY a valid JSON array of rows with the same column keys. No markdown, no explanation.""",
                }]

            msg = client.messages.create(
                model=MODEL, max_tokens=4096,
                thinking={"type": "adaptive"},
                messages=[{"role": "user", "content": content}],
            )
            raw = next(b.text for b in msg.content if b.type == "text")
            m = re.search(r"\[.*\]", raw, re.DOTALL)
            if not m:
                return {"table_rows": current_table_rows}
            rows = json.loads(m.group())
            return {"table_rows": [{c: row.get(c) for c in columns} for row in rows if isinstance(row, dict)]}

    except anthropic.APIError as e:
        raise RuntimeError(f"Anthropic API error: {e}") from e
    except json.JSONDecodeError as e:
        raise ValueError(f"AI returned invalid JSON: {e}") from e


def ai_generate_rule(
    description: str,
    trigger_type: str,
    sample_data: dict | None = None,
) -> dict:
    """Generate automation rule conditions + actions from natural language."""
    data_context = ""
    if sample_data:
        data_context = (
            "\nSAMPLE EXTRACTED DATA (use exact field names from this):\n"
            + json.dumps(sample_data, indent=2) + "\n"
        )

    prompt = (
        "You generate automation rules for a document processing system.\n"
        f"Trigger type: {trigger_type}\n\n"
        "DESCRIPTION: " + description + "\n"
        + data_context
        + "\nAVAILABLE CONDITION OPERATORS: equals, not_equals, contains, "
        "not_contains, is_null, is_not_null, starts_with, ends_with\n"
        "AVAILABLE ACTION TYPES:\n"
        '  set_status — {"type":"set_status","value":"<status name>"}\n'
        '  set_field  — {"type":"set_field","field":"<field name>","value":"<new value>"}\n\n'
        "Return ONLY valid JSON (no markdown):\n"
        "{\n"
        '  "name": "Short rule name (max 60 chars)",\n'
        '  "description": "One sentence explaining what this rule does",\n'
        '  "logic_operator": "AND",\n'
        '  "conditions": [{"field":"field name","operator":"equals","value":"value"}],\n'
        '  "actions": [{"type":"set_status","value":"Approved"}]\n'
        "}"
    )

    client = _get_client()
    response = client.messages.create(
        model=MODEL, max_tokens=1000,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = next(b.text for b in response.content if b.type == "text").strip()
    return _parse_json_from_response(raw)
