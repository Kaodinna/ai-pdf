import json
import io
import re
import os
import zipfile
from pathlib import Path

import anthropic
from pypdf import PdfReader, PdfWriter

from .pdf_service import (
    extract_text_per_page,
    extract_text_with_layout,
    render_pages_as_images,
)
from .storage_service import storage

MODEL = "claude-opus-4-8"

# Pages per Claude call — keep batches small so JSON stays valid and token limits are respected
BATCH_SIZE = 4

VISION_EXTRACTION_PROMPT = """You are an expert in shipping documentation, international trade compliance, and logistics.

Extract structured data from the shipping document page image(s) shown. Each image is preceded by a [PAGE N] label.

For EACH page image, extract all available fields and return them in the JSON array below.

Field label synonyms to recognise:
- bl_number: "B/L No.", "B/L NUMBER", "BILL OF LADING NO.", "BL#", "MAWB", "HBL"
- awb_number: "AWB", "AIR WAYBILL NO.", "HAWB"
- vessel_name: "VESSEL", "SHIP NAME", "OCEAN VESSEL", "CARRIER"
- voyage_number: "VOY", "VOYAGE", "VOYAGE NO.", "VGM"
- port_of_loading: "PORT OF LOADING", "POL", "LOADING PORT", "PORT OF RECEIPT", "ORIGIN PORT"
- port_of_discharge: "PORT OF DISCHARGE", "POD", "DISCHARGE PORT", "DESTINATION PORT"
- place_of_delivery: "PLACE OF DELIVERY", "FINAL DESTINATION", "PLACE OF FINAL DELIVERY"
- shipper_name: "SHIPPER", "EXPORTER", "CONSIGNOR", "SELLER", "ISSUED BY"
- consignee_name: "CONSIGNEE", "IMPORTER", "BUYER", "DELIVER TO"
- notify_party: "NOTIFY PARTY", "ALSO NOTIFY", "NOTIFY"
- hs_code: "HS CODE", "H.S. CODE", "HARMONISED CODE", "TARIFF CODE", "HS:"
- gross_weight: "GROSS WEIGHT", "G.W.", "TOTAL GROSS WEIGHT"
- net_weight: "NET WEIGHT", "N.W."
- number_of_packages: "NO. OF PKGS", "NUMBER OF PACKAGES", "QUANTITY", "QTY", "TOTAL PACKAGES"
- freight_terms: "FREIGHT", "FREIGHT TERMS", "FREIGHT PAYABLE", "PREPAID", "COLLECT"
- shipment_date: "DATE OF ISSUE", "SHIPPED ON BOARD", "DATE OF SHIPMENT", "ISSUE DATE", "SAIL DATE"
- tradenet_permit: "TRADENET", "PERMIT NO.", "CUSTOMS PERMIT"
- shipper_uen / gst_registration: "UEN", "GST REG", "GST NO.", "CO. REG"

Singapore-specific:
- TradeNet permit numbers: format YYYYMMDDXXXXXXXX or alphanumeric
- UEN: e.g. 202312345K, 199901234Z
- Port of Singapore: SGSIN or "PSA Singapore"
- Common lines: PIL, APL, Evergreen, Yang Ming, MSC, Maersk, CMA CGM
- Container number format: 4 uppercase letters + 7 digits (e.g. MSCU1234567). Seal numbers are shorter numeric strings that follow the container number.

Return ONLY a valid JSON array with one object per page. No explanation, no markdown fences.

Each page object must follow this exact structure (null for missing fields, [] for empty arrays):
[
  {
    "page_number": 1,
    "document_type": "Bill of Lading",
    "bl_number": null,
    "awb_number": null,
    "container_numbers": [],
    "seal_numbers": [],
    "vessel_name": null,
    "voyage_number": null,
    "flight_number": null,
    "port_of_loading": null,
    "port_of_discharge": null,
    "place_of_delivery": null,
    "shipper_name": null,
    "shipper_address": null,
    "shipper_uen": null,
    "consignee_name": null,
    "consignee_address": null,
    "notify_party": null,
    "description_of_goods": null,
    "hs_code": null,
    "gross_weight": null,
    "net_weight": null,
    "number_of_packages": null,
    "package_type": null,
    "freight_terms": null,
    "incoterms": null,
    "shipment_date": null,
    "eta": null,
    "total_value": null,
    "currency": null,
    "country_of_origin": null,
    "tradenet_permit": null,
    "gst_registration": null,
    "marks_and_numbers": null,
    "company_key": null,
    "remarks": null
  }
]

Rules:
- document_type must be one of: "Bill of Lading", "Air Waybill", "Commercial Invoice", "Packing List", "Certificate of Origin", "Delivery Order", "Customs Permit", "Insurance Certificate", "Other"
- company_key = the PRIMARY company on the document. For export docs: use shipper_name. For import docs: use consignee_name. For invoices: use the seller/issuer.
- container_numbers must always be an array (empty if none found)
- Return the raw value only — never include the field label in the value
- If a page is a continuation of the previous page, still extract all fields visible on that page
- Do not guess — if a field is not visible in the image, use null"""

TEXT_EXTRACTION_PROMPT = """You are an expert in Singapore shipping documentation, international trade compliance, and logistics.

Analyze this PDF which may contain shipping documents such as Bills of Lading, Air Waybills, Commercial Invoices, Packing Lists, Certificates of Origin, Delivery Orders, or Singapore Customs permits.

The PDF has {total_pages} pages. Each page is separated by a "---PAGE BREAK---" marker.

LAYOUT NOTE — CRITICAL FOR ACCURACY:
The text was extracted from a PDF with spatial layout preserved using whitespace. This means:
- Multi-column documents show left-column and right-column content side-by-side on the same lines, separated by spaces
- A field label and its value usually appear on the same line (e.g. "PORT OF DISCHARGE          SINGAPORE") or the value is on the immediately following line beneath the label
- Bill of Lading pages typically have a grid layout: shipper/consignee boxes on the left, B/L number/booking number on the right, vessel/voyage/port info in a middle band
- When "PORT OF LOADING" and "PORT OF DISCHARGE" appear on the same line, they are adjacent columns — assign each city to its correct label using left-to-right order
- Container and seal numbers often appear in a row together: read carefully to separate them
- Company names and addresses span multiple lines — collect all lines that belong to the same box

Field label synonyms to recognise:
- bl_number: "B/L No.", "B/L NUMBER", "BILL OF LADING NO.", "BL#", "MAWB", "HBL"
- awb_number: "AWB", "AIR WAYBILL NO.", "HAWB"
- vessel_name: "VESSEL", "SHIP NAME", "OCEAN VESSEL", "CARRIER"
- voyage_number: "VOY", "VOYAGE", "VOYAGE NO.", "VGM"
- port_of_loading: "PORT OF LOADING", "POL", "LOADING PORT", "PORT OF RECEIPT", "ORIGIN PORT"
- port_of_discharge: "PORT OF DISCHARGE", "POD", "DISCHARGE PORT", "DESTINATION PORT"
- place_of_delivery: "PLACE OF DELIVERY", "FINAL DESTINATION", "PLACE OF FINAL DELIVERY"
- shipper_name: "SHIPPER", "EXPORTER", "CONSIGNOR", "SELLER", "ISSUED BY"
- consignee_name: "CONSIGNEE", "IMPORTER", "BUYER", "DELIVER TO"
- notify_party: "NOTIFY PARTY", "ALSO NOTIFY", "NOTIFY"
- hs_code: "HS CODE", "H.S. CODE", "HARMONISED CODE", "TARIFF CODE", "HS:"
- gross_weight: "GROSS WEIGHT", "G.W.", "TOTAL GROSS WEIGHT"
- net_weight: "NET WEIGHT", "N.W."
- number_of_packages: "NO. OF PKGS", "NUMBER OF PACKAGES", "QUANTITY", "QTY", "TOTAL PACKAGES"
- freight_terms: "FREIGHT", "FREIGHT TERMS", "FREIGHT PAYABLE", "PREPAID", "COLLECT"
- shipment_date: "DATE OF ISSUE", "SHIPPED ON BOARD", "DATE OF SHIPMENT", "ISSUE DATE", "SAIL DATE"
- tradenet_permit: "TRADENET", "PERMIT NO.", "CUSTOMS PERMIT"
- shipper_uen / gst_registration: "UEN", "GST REG", "GST NO.", "CO. REG"

Singapore-specific:
- TradeNet permit numbers: format YYYYMMDDXXXXXXXX or alphanumeric
- UEN: e.g. 202312345K, 199901234Z
- Port of Singapore: SGSIN or "PSA Singapore"
- Common lines: PIL, APL, Evergreen, Yang Ming, MSC, Maersk, CMA CGM

Container number format: 4 uppercase letters + 7 digits (e.g. MSCU1234567). Seal numbers are shorter numeric strings that follow the container number.

PDF Content:
{page_content}

Return ONLY a valid JSON array with one object per page. Do not include any explanation outside the JSON.

Each page object must follow this exact structure (use null for missing fields, [] for empty arrays):
[
  {{
    "page_number": 1,
    "document_type": "Bill of Lading",
    "bl_number": null,
    "awb_number": null,
    "container_numbers": [],
    "seal_numbers": [],
    "vessel_name": null,
    "voyage_number": null,
    "flight_number": null,
    "port_of_loading": null,
    "port_of_discharge": null,
    "place_of_delivery": null,
    "shipper_name": null,
    "shipper_address": null,
    "shipper_uen": null,
    "consignee_name": null,
    "consignee_address": null,
    "notify_party": null,
    "description_of_goods": null,
    "hs_code": null,
    "gross_weight": null,
    "net_weight": null,
    "number_of_packages": null,
    "package_type": null,
    "freight_terms": null,
    "incoterms": null,
    "shipment_date": null,
    "eta": null,
    "total_value": null,
    "currency": null,
    "country_of_origin": null,
    "tradenet_permit": null,
    "gst_registration": null,
    "marks_and_numbers": null,
    "company_key": null,
    "remarks": null
  }}
]

Rules:
- document_type must be one of: "Bill of Lading", "Air Waybill", "Commercial Invoice", "Packing List", "Certificate of Origin", "Delivery Order", "Customs Permit", "Insurance Certificate", "Other"
- company_key = the PRIMARY company on the document. For export docs: use shipper_name. For import docs: use consignee_name. For invoices: use the seller/issuer.
- container_numbers must always be an array (empty if none found)
- Return the raw value only — never include the field label in the value (e.g. for "PORT OF DISCHARGE  SINGAPORE", return "SINGAPORE" not "PORT OF DISCHARGE SINGAPORE")
- If a page is a continuation of the previous page, still extract all fields visible on that page
- For Singapore documents: always try to extract UEN and TradeNet permit number
- Do not guess — if a field is not present, use null"""


def _extract_json_array(text: str) -> list:
    """
    Robustly extract a JSON array from Claude's response.
    Handles: markdown fences, truncated arrays, stray trailing commas.
    """
    text = re.sub(r"```(?:json)?", "", text).strip()

    start = text.find("[")
    if start == -1:
        raise ValueError("No JSON array found in response")

    depth = 0
    end = -1
    in_string = False
    escape_next = False

    for i, ch in enumerate(text[start:], start):
        if escape_next:
            escape_next = False
            continue
        if ch == "\\" and in_string:
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                end = i
                break

    if end == -1:
        fragment = text[start:]
        fragment = re.sub(r",?\s*\{[^}]*$", "", fragment) + "]"
        try:
            return json.loads(fragment)
        except json.JSONDecodeError:
            raise ValueError("AI response was truncated and could not be recovered")

    candidate = text[start : end + 1]
    candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
    return json.loads(candidate)


def _normalise_records(records: list[dict]) -> list[dict]:
    for r in records:
        if not isinstance(r.get("container_numbers"), list):
            r["container_numbers"] = []
        if not isinstance(r.get("seal_numbers"), list):
            r["seal_numbers"] = []
    return records


def _build_vision_content(page_images: list[dict]) -> list[dict]:
    """Build a Claude API content block list: [PAGE N] label + image for each page."""
    content: list[dict] = []
    for img in page_images:
        content.append({"type": "text", "text": f"[PAGE {img['page_number']}]"})
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": img["media_type"],
                "data": img["base64"],
            },
        })
    return content


def _call_claude_vision(client: anthropic.Anthropic, page_images: list[dict]) -> list[dict]:
    """Send page images to Claude and return extracted records."""
    content = _build_vision_content(page_images)
    content.append({"type": "text", "text": VISION_EXTRACTION_PROMPT})

    message = client.messages.create(
        model=MODEL,
        max_tokens=16384,
        thinking={"type": "adaptive"},
        messages=[{"role": "user", "content": content}],
    )
    raw = next(b.text for b in message.content if b.type == "text")
    return _normalise_records(_extract_json_array(raw))


def _call_claude_text(client: anthropic.Anthropic, pages: list[dict], total_pages: int) -> list[dict]:
    """Fallback: send layout-preserved text to Claude when image rendering fails."""
    page_content = "\n\n---PAGE BREAK---\n\n".join(
        f"[PAGE {p['page_number']}]\n{p.get('layout_text') or p['text_preview'] or '[no extractable text on this page]'}"
        for p in pages
    )
    prompt = TEXT_EXTRACTION_PROMPT.format(total_pages=total_pages, page_content=page_content)

    message = client.messages.create(
        model=MODEL,
        max_tokens=16384,
        thinking={"type": "adaptive"},
        messages=[{"role": "user", "content": prompt}],
    )
    raw = next(b.text for b in message.content if b.type == "text")
    return _normalise_records(_extract_json_array(raw))


def ai_extract_shipping_data(pdf_path: Path) -> list[dict]:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise EnvironmentError("ANTHROPIC_API_KEY is not set")

    client = anthropic.Anthropic(api_key=key)

    # Render all pages as images (primary path)
    try:
        page_images = render_pages_as_images(pdf_path, dpi=150)
        use_vision = True
    except Exception:
        use_vision = False

    # Text fallback: used when vision is unavailable or a batch fails
    text_pages: list[dict] = []
    if not use_vision:
        text_pages = extract_text_per_page(pdf_path, char_limit=800)
        total = len(text_pages)
        for p in text_pages:
            p["layout_text"] = extract_text_with_layout(pdf_path, p["page_number"])
    else:
        total = len(page_images)

    all_records: list[dict] = []

    if use_vision:
        for i in range(0, total, BATCH_SIZE):
            batch_imgs = page_images[i : i + BATCH_SIZE]
            try:
                records = _call_claude_vision(client, batch_imgs)
                all_records.extend(records)
            except (json.JSONDecodeError, ValueError):
                # Retry one page at a time within the failed vision batch
                for single_img in batch_imgs:
                    try:
                        records = _call_claude_vision(client, [single_img])
                        all_records.extend(records)
                    except Exception:
                        all_records.append({
                            "page_number": single_img["page_number"],
                            "document_type": "Other",
                            "container_numbers": [],
                            "seal_numbers": [],
                            "company_key": None,
                        })
    else:
        for i in range(0, total, BATCH_SIZE):
            batch = text_pages[i : i + BATCH_SIZE]
            try:
                records = _call_claude_text(client, batch, total)
                all_records.extend(records)
            except (json.JSONDecodeError, ValueError):
                for single_page in batch:
                    try:
                        records = _call_claude_text(client, [single_page], total)
                        all_records.extend(records)
                    except Exception:
                        all_records.append({
                            "page_number": single_page["page_number"],
                            "document_type": "Other",
                            "container_numbers": [],
                            "seal_numbers": [],
                            "company_key": None,
                        })

    return all_records


def group_records(records: list[dict], group_by: str) -> dict[str, list[int]]:
    """
    group_by: "company" | "container"
    Returns { group_label: [page_numbers] }
    """
    groups: dict[str, list[int]] = {}

    for r in records:
        page = r.get("page_number")
        if page is None:
            continue

        if group_by == "container":
            containers = r.get("container_numbers") or []
            if containers:
                for c in containers:
                    groups.setdefault(c, []).append(page)
            else:
                groups.setdefault("No Container Identified", []).append(page)
        else:
            key = (
                r.get("company_key")
                or r.get("shipper_name")
                or r.get("consignee_name")
                or "Unknown Company"
            )
            groups.setdefault(key, []).append(page)

    return groups


def separate_pdf_by_groups(
    pdf_path: Path,
    groups: dict[str, list[int]],
) -> tuple[dict[str, str], str]:
    """
    For each group, extract the relevant pages into a separate PDF.
    Returns (group_name -> download_filename, zip_download_filename).
    """
    reader = PdfReader(str(pdf_path))
    total = len(reader.pages)
    group_files: dict[str, str] = {}

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for group_label, page_numbers in groups.items():
            writer = PdfWriter()
            for pn in sorted(set(page_numbers)):
                idx = pn - 1
                if 0 <= idx < total:
                    writer.add_page(reader.pages[idx])

            buf = io.BytesIO()
            writer.write(buf)
            pdf_bytes = buf.getvalue()

            safe_label = re.sub(r"[^\w\s-]", "", group_label).strip().replace(" ", "_")[:60]
            filename = storage.save_output(pdf_bytes, f"{safe_label}.pdf")
            group_files[group_label] = filename

            zf.writestr(f"{safe_label}.pdf", pdf_bytes)

    zip_filename = storage.save_output(zip_buf.getvalue(), "shipping_groups.zip")
    return group_files, zip_filename
