"""
Reducto-backed alternative to ai_service.ai_extract_template_fields() — same
per-page result shape, so extraction_service.run_template_extraction() can
route a template to either engine transparently and everything downstream
(rules, auto-approve/reject, audit logging, the frontend) needs no changes.

Reducto's Extract API (https://docs.reducto.ai) reads a page image and fills
a JSON schema in one call, returning per-field bounding boxes already
normalized as 0-1 fractions of the page and a confidence score — cheaper and
roughly an order of magnitude faster per page than the Claude Vision path in
ai_service.py, at the cost of losing this app's custom prompt tuning (field
synonyms are passed as extra schema description text, not enforced rules,
and there's no equivalent of AI Memory's learned-correction hints yet).
"""

import os
import re
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path

from services.pdf_service import extract_text_per_page, extract_page_words

# Reducto's sync Extract call takes several seconds per page, so pages are
# fetched a few at a time. Kept modest to stay well inside API rate limits.
MAX_PARALLEL_PAGES = 4

_TYPE_MAP = {
    "Text": "string",
    "Date": "string",
    "Currency": "string",
    "Number": "number",
    "Boolean": "boolean",
}


def _get_client():
    if not os.environ.get("REDUCTO_API_KEY"):
        raise EnvironmentError("REDUCTO_API_KEY environment variable is not set")
    from reducto import Reducto
    return Reducto()


def _map_pages(fn, page_nums: list[int]) -> list:
    """Run fn(page_num) for every page, a few at a time, preserving order."""
    if len(page_nums) <= 1:
        return [fn(n) for n in page_nums]
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_PAGES) as pool:
        return list(pool.map(fn, page_nums))


def _extract_one_page(client, file_id: str, schema: dict, system_prompt: str, page_num: int, citations: bool = True) -> dict:
    result = client.extract.run(
        input=file_id,
        instructions={"schema": schema, "system_prompt": system_prompt},
        settings={
            "citations": {"enabled": citations},
            "page_range": {"start": page_num, "end": page_num},
        },
    )
    raw = result.result
    return (raw[0] if isinstance(raw, list) and raw else raw) or {}


def _build_schema(template: dict) -> dict:
    direct_link_fields = template.get("direct_link_fields", [])
    field_config = template.get("field_config", {})
    table_fields = template.get("table_fields", [])
    table_config = template.get("table_config", {})

    properties: dict = {}
    for fname in direct_link_fields:
        cfg = field_config.get(fname, {})
        desc = cfg.get("description") or fname
        syns = cfg.get("synonyms") or []
        if syns:
            desc += f" (may also be labeled: {', '.join(syns)})"
        restriction = cfg.get("data_type_restriction")
        if restriction:
            desc += f". Rule: {restriction}"
        properties[fname] = {
            "type": _TYPE_MAP.get(cfg.get("data_type", "Text"), "string"),
            "description": desc,
        }

    if table_fields:
        item_props = {
            fname: {
                "type": _TYPE_MAP.get(table_config.get(fname, {}).get("data_type", "Text"), "string"),
                "description": table_config.get(fname, {}).get("description") or fname,
            }
            for fname in table_fields
        }
        properties["table_rows"] = {
            "type": "array",
            "description": "One entry per row of the itemized table on this document.",
            "items": {"type": "object", "properties": item_props},
        }

    return {"type": "object", "properties": properties}


def _parse_extracted_value(raw) -> tuple[str | None, dict | None, int]:
    """Returns (value_as_string_or_None, position_or_None, confidence_0_100)."""
    if raw is None:
        return None, None, 0
    if isinstance(raw, dict) and "value" in raw:
        value = raw.get("value")
        citations = raw.get("citations") or []
        position = None
        confidence = 70  # neutral default when no citation came back
        if citations:
            c = citations[0]
            bbox = c.get("bbox") or {}
            if all(k in bbox for k in ("left", "top", "width", "height")):
                position = {
                    "x0": bbox["left"],
                    "y0": bbox["top"],
                    "x1": bbox["left"] + bbox["width"],
                    "y1": bbox["top"] + bbox["height"],
                }
            gran = c.get("granular_confidence") or {}
            extract_confidence = gran.get("extract_confidence")
            if isinstance(extract_confidence, (int, float)):
                confidence = round(extract_confidence * 100)
            else:
                confidence = {"high": 95, "medium": 75, "low": 50}.get(c.get("confidence"), 70)
        val_str = str(value) if value not in (None, "") else None
        return val_str, position, confidence
    # Citations came back disabled, or the field is a plain scalar/list (e.g. table_rows).
    val_str = str(raw) if raw not in (None, "") else None
    return val_str, None, 70


def reducto_extract_template_fields(
    pdf_path: Path,
    template: dict,
    page_numbers: list[int] | None = None,
) -> dict:
    """Same contract as ai_service.ai_extract_template_fields(): returns
    {"pages": [{page_number, fields, field_meta, field_positions, page_width,
    page_height, table_rows, table_evidence, applied_conditions,
    text_preview}, ...]}."""
    from services.ai_service import _apply_decision_status

    client = _get_client()
    schema = _build_schema(template)
    doc_type = template.get("template_type", template.get("name", "document"))

    all_pages = extract_text_per_page(pdf_path, char_limit=1)
    page_nums = (
        [p["page_number"] for p in all_pages if p["page_number"] in page_numbers]
        if page_numbers
        else [p["page_number"] for p in all_pages]
    )

    upload = client.upload(file=pdf_path)
    system_prompt = f"Extract data from this {doc_type} document."
    extracted_by_page = dict(zip(
        page_nums,
        _map_pages(lambda n: _extract_one_page(client, upload.file_id, schema, system_prompt, n), page_nums),
    ))

    results = []
    for page_num in page_nums:
        extracted = extracted_by_page[page_num]

        fields: dict[str, str | None] = {}
        field_meta: dict[str, dict] = {}
        field_positions: dict[str, dict] = {}
        for fname in template.get("direct_link_fields", []):
            value, position, confidence = _parse_extracted_value(extracted.get(fname))
            fields[fname] = value
            field_meta[fname] = {"confidence": confidence, "evidence": ""}
            if position:
                field_positions[fname] = position

        table_rows: list[dict] = []
        raw_rows = extracted.get("table_rows")
        if isinstance(raw_rows, list):
            for row in raw_rows:
                if not isinstance(row, dict):
                    continue
                parsed_row = {}
                for fname in template.get("table_fields", []):
                    val, _, _ = _parse_extracted_value(row.get(fname))
                    parsed_row[fname] = val
                table_rows.append(parsed_row)

        from services.ai_service import _apply_conditions_with_ai, _build_table_evidence
        applied_conditions = _apply_conditions_with_ai(table_rows, template.get("special_conditions", []))
        table_evidence = _build_table_evidence(table_rows, template.get("table_fields", []), applied_conditions)

        try:
            from services.library_service import library_lookup_derived
            field_config = template.get("field_config", {})
            for fname, fcfg in field_config.items():
                ld = fcfg.get("library_derived") if isinstance(fcfg, dict) else None
                if not ld or not ld.get("library_id"):
                    continue
                match_field = ld.get("match_field", "")
                return_field = ld.get("return_field", "")
                match_value = fields.get(match_field)
                if match_value:
                    derived = library_lookup_derived(ld["library_id"], match_field, match_value, return_field)
                    if derived is not None:
                        fields[fname] = derived
                        field_meta[fname] = {"confidence": 100, "evidence": f"Looked up from library via '{match_field}' = '{match_value}'"}
        except Exception:
            pass

        _apply_decision_status(fields, field_meta)

        results.append({
            "page_number": page_num,
            "fields": fields,
            "field_meta": field_meta,
            "field_positions": field_positions,
            "page_width": 1.0,
            "page_height": 1.0,
            "table_rows": table_rows,
            "table_evidence": table_evidence,
            "applied_conditions": applied_conditions,
            "text_preview": "",
        })

    return {"pages": results}


# ── Shipping tab ────────────────────────────────────────────────────────────

SHIPPING_DOC_TYPES = [
    "Bill of Lading", "Air Waybill", "Commercial Invoice", "Packing List",
    "Certificate of Origin", "Delivery Order", "Customs Permit",
    "Insurance Certificate", "Other",
]

_SHIPPING_TEXT_FIELDS = {
    "bl_number": 'Bill of lading number (labels like "B/L No.", "BL#", "MAWB", "HBL")',
    "awb_number": 'Air waybill number ("AWB", "HAWB")',
    "vessel_name": 'Vessel or ship name ("VESSEL", "OCEAN VESSEL")',
    "voyage_number": 'Voyage number ("VOY", "VOYAGE NO.")',
    "flight_number": "Flight number",
    "port_of_loading": 'Port of loading ("POL", "PORT OF RECEIPT")',
    "port_of_discharge": 'Port of discharge ("POD", "DESTINATION PORT")',
    "place_of_delivery": 'Place of delivery ("FINAL DESTINATION")',
    "shipper_name": 'Shipper name ("SHIPPER", "EXPORTER", "CONSIGNOR"). On an invoice this is the seller / issuer',
    "shipper_address": "Shipper address",
    "shipper_uen": 'Singapore UEN of the shipper (e.g. 202312345K)',
    "consignee_name": 'Consignee name ("CONSIGNEE", "IMPORTER", "DELIVER TO"). On an invoice this is the buyer / bill-to party',
    "consignee_address": "Consignee address",
    "notify_party": 'Notify party ("ALSO NOTIFY")',
    "description_of_goods": "Description of the goods",
    "hs_code": 'HS / tariff code ("H.S. CODE", "HARMONISED CODE")',
    "gross_weight": 'Gross weight including unit ("G.W.")',
    "net_weight": 'Net weight including unit ("N.W.")',
    "number_of_packages": "Number of packages or quantity",
    "package_type": "Package type (pallets, cartons, ...)",
    "freight_terms": 'Freight terms ("PREPAID", "COLLECT")',
    "incoterms": "Incoterms, e.g. FOB, CIF",
    "shipment_date": 'Date of issue / shipped on board / date of shipment',
    "eta": "Estimated time of arrival",
    "total_value": "Total value / invoice total",
    "currency": "Currency code",
    "country_of_origin": "Country of origin",
    "tradenet_permit": "Singapore TradeNet / customs permit number",
    "gst_registration": "GST registration number",
    "marks_and_numbers": "Marks and numbers",
    "company_key": (
        "The PRIMARY company on the document: the shipper for export documents, "
        "the consignee for import documents, the seller/issuer for invoices"
    ),
    "remarks": "Remarks or notes",
}


def _shipping_schema() -> dict:
    props: dict = {
        "document_type": {"type": "string", "enum": SHIPPING_DOC_TYPES, "description": "The kind of document this page is"},
        "container_numbers": {
            "type": "array", "items": {"type": "string"},
            "description": "Container numbers: 4 uppercase letters + 7 digits, e.g. MSCU1234567",
        },
        "seal_numbers": {
            "type": "array", "items": {"type": "string"},
            "description": "Seal numbers (shorter numeric strings that follow a container number)",
        },
    }
    for key, desc in _SHIPPING_TEXT_FIELDS.items():
        props[key] = {"type": "string", "description": desc}
    return {"type": "object", "properties": props}


def reducto_extract_shipping_data(pdf_path: Path) -> list[dict]:
    """Same contract as shipping_service.ai_extract_shipping_data(): one flat
    record per page."""
    client = _get_client()
    schema = _shipping_schema()
    page_nums = [p["page_number"] for p in extract_text_per_page(pdf_path, char_limit=1)]
    upload = client.upload(file=pdf_path)
    prompt = "Extract shipping and logistics data from this page of a shipping document. Use null for anything not present."

    def one(page_num: int) -> dict:
        extracted = _extract_one_page(client, upload.file_id, schema, prompt, page_num, citations=False)
        record: dict = {"page_number": page_num}
        record["document_type"] = extracted.get("document_type") or "Other"
        for key in _SHIPPING_TEXT_FIELDS:
            value = extracted.get(key)
            record[key] = str(value).strip() if value not in (None, "") else None
        for key in ("container_numbers", "seal_numbers"):
            value = extracted.get(key)
            record[key] = [str(v) for v in value if v] if isinstance(value, list) else []
        return record

    return _map_pages(one, page_nums)


# ── Smart Extract (no template) ─────────────────────────────────────────────

_CLASSIFY_BASE_TYPES = [t for t in SHIPPING_DOC_TYPES if t != "Other"]
_LABEL_VALUE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9 /&.#'()\-]{1,38}?)\s*:\s*(\S.*)$")
_BOLD_PAIR = re.compile(r"<b>\s*(.*?)\s*</b>\s*(.*?)(?=<b>|\Z)", re.S)
_TAG = re.compile(r"<[^>]+>")


class _TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows: list[list[str]] = []
        self._cell: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.rows.append([])
        elif tag in ("td", "th"):
            self._cell = []

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None and self.rows:
            self.rows[-1].append(" ".join("".join(self._cell).split()))
            self._cell = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)


def _snake(label: str) -> str:
    # "B/L No." -> "bl_no", "Freight & Charges" -> "freight_and_charges"
    label = label.replace("&", " and ")
    label = re.sub(r"/(?=[A-Za-z]\b)", "", label)  # B/L -> BL
    label = label.replace("/", " ")                 # Containers/Packages -> two words
    label = re.sub(r"[.'\u2019]", "", label)
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_") or "field"


def _parse_html_table(html: str) -> tuple[list[str], list[dict]]:
    parser = _TableParser()
    parser.feed(html)
    rows = [r for r in parser.rows if any(c for c in r)]
    if not rows:
        return [], []
    columns: list[str] = []
    for i, name in enumerate(rows[0]):
        name = name or f"column_{i + 1}"
        while name in columns:
            name += "_2"
        columns.append(name)
    body = [{col: (r[i] if i < len(r) else "") for i, col in enumerate(columns)} for r in rows[1:]]
    return columns, body


def _label_value_pairs(block_type: str, content: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    if block_type == "Key Value" and "<b>" in content:
        for label, value in _BOLD_PAIR.findall(content):
            label = label.strip().rstrip(":").strip()
            value = _TAG.sub("", value).strip()
            if label and value:
                pairs.append((label, value))
        return pairs
    continuation = 0
    for line in _TAG.sub("", content).splitlines():
        m = _LABEL_VALUE.match(line)
        if m and not m.group(1).strip().isdigit() and len(m.group(1).split()) <= 6:
            pairs.append((m.group(1).strip(), m.group(2).strip()))
            continuation = 3
        elif pairs and continuation and line.strip() and ":" not in line and len(line) < 60:
            label, value = pairs[-1]
            pairs[-1] = (label, f"{value}\n{line.strip()}")
            continuation -= 1
        else:
            continuation = 0
    return pairs


def _block_confidence(block: dict) -> int:
    gran = block.get("granular_confidence") or {}
    parse_conf = gran.get("parse_confidence")
    if isinstance(parse_conf, (int, float)):
        return round(parse_conf * 100)
    return {"high": 92, "low": 55}.get(block.get("confidence"), 70)


# One vague line per category ("This page is a Bill of Lading") is not enough —
# the classifier confused a real Bill of Lading for an Air Waybill. These say
# what each type actually looks like.
_CLASSIFY_CRITERIA = {
    "Bill of Lading": [
        'Titled "Bill of Lading" or "B/L"; ocean shipment with shipper, consignee, notify party, vessel and voyage, port of loading and port of discharge',
    ],
    "Air Waybill": [
        'Titled "Air Waybill" or "AWB"; air shipment with airport of departure and destination, flight number, airline',
    ],
    "Commercial Invoice": [
        'Titled "Invoice"; seller and buyer, invoice number and date, line items with quantities, unit prices and a total amount',
    ],
    "Packing List": [
        'Titled "Packing List"; lists packages or cartons with quantities, weights and dimensions, usually without prices',
    ],
    "Certificate of Origin": ['Certifies the country of origin of goods, usually stamped or signed by a chamber of commerce'],
    "Delivery Order": ['Titled "Delivery Order"; instructs release of cargo to a named party'],
    "Customs Permit": ['Customs declaration or permit, e.g. TradeNet, with a permit number and HS codes'],
    "Insurance Certificate": ['Cargo insurance certificate or policy with insured amount and coverage'],
}


_TITLE_ALIASES = {
    "air waybill": "Air Waybill",
    "airway bill": "Air Waybill",
    "bill of lading": "Bill of Lading",
    "commercial invoice": "Commercial Invoice",
    "packing list": "Packing List",
    "certificate of origin": "Certificate of Origin",
    "delivery order": "Delivery Order",
}


def _title_doc_type(blocks: list[dict], categories: list[str]) -> str | None:
    """A document usually prints its own type as its title ("BILL OF LADING").
    Trust that over the classifier, and it costs nothing."""
    text = " ".join(
        _TAG.sub("", b.get("content") or "").lower()
        for b in blocks if b.get("type") in ("Title", "Header", "Section Header")
    )
    if not text.strip():
        return None
    # Longest names first so "Commercial Invoice" wins over a bare "Invoice".
    for name in sorted(categories, key=len, reverse=True):
        if name.lower() in text:
            return name
    for alias, canonical in _TITLE_ALIASES.items():
        if alias in text:
            return canonical
    return None


def _classify_pages(client, file_id: str, page_nums: list[int], categories: list[str]) -> dict[int, str | None]:
    schema = [
        {"category": c, "criteria": _CLASSIFY_CRITERIA.get(c) or [f'Document of the type "{c}" (its title or heading says so)']}
        for c in categories
    ]
    schema.append({"category": "Other", "criteria": ["Does not fit any of the other categories"]})
    by_lower = {c.lower(): c for c in categories + ["Other"]}

    def one(page_num: int) -> str | None:
        try:
            res = client.classify.run(input=file_id, classification_schema=schema,
                                      page_range={"start": page_num, "end": page_num})
            return by_lower.get(str(res.result.category).lower(), str(res.result.category))
        except Exception:
            return None

    return dict(zip(page_nums, _map_pages(one, page_nums)))


def reducto_smart_extract(pdf_path: Path, page_numbers: list[int] | None = None) -> dict:
    """Same contract as ai_service.ai_smart_extract(): template-less extraction.
    Reducto's Parse reads the layout and returns labelled values and tables
    with no schema; this turns them into named fields, and Classify supplies
    the document type per page."""
    from services.ai_service import _apply_decision_status, _build_table_evidence, _search_value_position
    from services.template_service import list_templates

    client = _get_client()
    all_pages = extract_text_per_page(pdf_path, char_limit=1)
    page_nums = (
        [p["page_number"] for p in all_pages if p["page_number"] in page_numbers]
        if page_numbers
        else [p["page_number"] for p in all_pages]
    )
    if not page_nums:
        return {"pages": []}

    upload = client.upload(file=pdf_path)
    parse_kwargs = {"input": upload.file_id}
    if page_numbers:
        parse_kwargs["settings"] = {"page_range": [int(n) for n in page_nums]}
    parsed = client.parse.run(**parse_kwargs)

    blocks_by_page: dict[int, list[dict]] = {}
    for chunk in parsed.result.chunks:
        for block in chunk.blocks:
            b = block.model_dump()
            bbox = b.get("bbox") or {}
            page = bbox.get("original_page") or bbox.get("page")
            if page:
                blocks_by_page.setdefault(int(page), []).append(b)

    categories = list(_CLASSIFY_BASE_TYPES)
    for t in list_templates():
        name = (t.get("template_type") or t.get("name") or "").strip()
        if name and name.lower() not in {c.lower() for c in categories}:
            categories.append(name)
    doc_types: dict[int, str | None] = {
        n: _title_doc_type(blocks_by_page.get(n, []), categories) for n in page_nums
    }
    needs_classify = [n for n in page_nums if not doc_types[n]]
    if needs_classify:
        doc_types.update(_classify_pages(client, upload.file_id, needs_classify, categories))

    results = []
    for page_num in page_nums:
        blocks = blocks_by_page.get(page_num, [])
        fields: dict[str, str | None] = {}
        field_meta: dict[str, dict] = {}
        block_of: dict[str, dict] = {}
        table_columns: list[str] = []
        table_rows: list[dict] = []
        text_parts: list[str] = []

        for b in blocks:
            btype, content = b.get("type"), b.get("content") or ""
            if btype == "Table":
                cols, rows = _parse_html_table(content)
                if len(rows) > len(table_rows):
                    table_columns, table_rows = cols, rows
                continue
            if btype in ("Title", "Header", "Footer", "Page Number"):
                text_parts.append(_TAG.sub("", content))
                continue
            text_parts.append(_TAG.sub("", content))
            for label, value in _label_value_pairs(btype, content):
                key = _snake(label)
                base, n = key, 2
                while key in fields:
                    key, n = f"{base}_{n}", n + 1
                fields[key] = value
                field_meta[key] = {
                    "confidence": _block_confidence(b),
                    "evidence": f'Read from the "{label}" line ({btype or "text"} block on the page)',
                }
                block_of[key] = b

        # Highlight positions. Text PDFs get exact word-level boxes (same
        # matcher the Claude path uses); anything else falls back to the
        # block Reducto found the value in, expressed as page fractions.
        try:
            word_data = extract_page_words(pdf_path, page_num)
        except Exception:
            word_data = {"page_width": 0, "page_height": 0, "words": []}
        words = word_data["words"]
        page_width = word_data["page_width"] if words else 1.0
        page_height = word_data["page_height"] if words else 1.0
        field_positions: dict[str, dict] = {}
        for key, value in fields.items():
            pos = _search_value_position(words, value) if words else None
            if not pos:
                bbox = (block_of[key].get("bbox") or {})
                if all(k in bbox for k in ("left", "top", "width", "height")):
                    pos = {
                        "x0": bbox["left"] * page_width,
                        "y0": bbox["top"] * page_height,
                        "x1": (bbox["left"] + bbox["width"]) * page_width,
                        "y1": (bbox["top"] + bbox["height"]) * page_height,
                    }
            if pos:
                field_positions[key] = pos

        _apply_decision_status(fields, field_meta)
        results.append({
            "page_number": page_num,
            "document_type": doc_types.get(page_num),
            "fields": fields,
            "field_meta": field_meta,
            "field_positions": field_positions,
            "page_width": page_width,
            "page_height": page_height,
            "table_columns": table_columns,
            "table_rows": table_rows,
            "table_evidence": _build_table_evidence(table_rows, table_columns),
            "text_preview": "\n".join(text_parts)[:800],
        })

    return {"pages": results}
