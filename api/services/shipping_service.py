import io
import re
import zipfile
from pathlib import Path

from pypdf import PdfReader, PdfWriter

from .storage_service import storage


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
