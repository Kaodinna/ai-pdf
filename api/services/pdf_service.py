from pathlib import Path
from typing import Optional
import base64
import io

import fitz  # pymupdf
import pdfplumber
from pypdf import PdfReader, PdfWriter


def validate_pdf(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {path}")
    try:
        PdfReader(str(path))
    except Exception as e:
        raise ValueError(f"Invalid PDF file: {e}")


def get_page_count(path: Path) -> int:
    reader = PdfReader(str(path))
    return len(reader.pages)


def extract_text_per_page(path: Path, char_limit: int = 300) -> list[dict]:
    pages = []
    with pdfplumber.open(str(path)) as pdf:
        for i, page in enumerate(pdf.pages):
            text = (page.extract_text() or "").strip()
            pages.append({
                "page_index": i,
                "page_number": i + 1,
                "text_preview": text[:char_limit],
            })
    return pages


def split_by_page_range(path: Path, start: int, end: int) -> bytes:
    reader = PdfReader(str(path))
    writer = PdfWriter()
    total = len(reader.pages)
    start = max(0, start - 1)
    end = min(total, end)
    for i in range(start, end):
        writer.add_page(reader.pages[i])
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def split_every_n_pages(path: Path, n: int) -> list[bytes]:
    reader = PdfReader(str(path))
    total = len(reader.pages)
    results = []
    for start in range(0, total, n):
        writer = PdfWriter()
        for i in range(start, min(start + n, total)):
            writer.add_page(reader.pages[i])
        buf = io.BytesIO()
        writer.write(buf)
        results.append(buf.getvalue())
    return results


def extract_selected_pages(path: Path, page_numbers: list[int]) -> bytes:
    """page_numbers are 1-indexed."""
    reader = PdfReader(str(path))
    writer = PdfWriter()
    total = len(reader.pages)
    for pn in page_numbers:
        idx = pn - 1
        if 0 <= idx < total:
            writer.add_page(reader.pages[idx])
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def merge_pdfs(paths: list[Path], page_selections: Optional[list[list[int]]] = None) -> bytes:
    """Merge PDFs. page_selections[i] is list of 1-indexed page numbers for paths[i]; None means all pages."""
    writer = PdfWriter()
    for i, path in enumerate(paths):
        reader = PdfReader(str(path))
        total = len(reader.pages)
        if page_selections and page_selections[i]:
            pages = [p - 1 for p in page_selections[i] if 1 <= p <= total]
        else:
            pages = list(range(total))
        for idx in pages:
            writer.add_page(reader.pages[idx])
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def is_blank_page(page) -> bool:
    text = (page.extract_text() or "").strip()
    return len(text) == 0


def extract_text_with_layout(path: Path, page_number: int) -> str:
    """Extract text from a page preserving spatial layout (key-value pairs stay on same line)."""
    try:
        with pdfplumber.open(str(path)) as pdf:
            if page_number < 1 or page_number > len(pdf.pages):
                return ""
            return pdf.pages[page_number - 1].extract_text(layout=True) or ""
    except Exception:
        return ""


def extract_page_tables(path: Path, page_number: int) -> list:
    """Extract tables from a page using pdfplumber's structural table detector."""
    try:
        with pdfplumber.open(str(path)) as pdf:
            if page_number < 1 or page_number > len(pdf.pages):
                return []
            return pdf.pages[page_number - 1].extract_tables() or []
    except Exception:
        return []


def extract_page_words(path: Path, page_number: int) -> dict:
    """Return words with bounding boxes for a page (1-indexed). y0/y1 measured from top."""
    with pdfplumber.open(str(path)) as pdf:
        if page_number < 1 or page_number > len(pdf.pages):
            raise ValueError(f"Page {page_number} out of range")
        page = pdf.pages[page_number - 1]
        words = page.extract_words(x_tolerance=3, y_tolerance=3) or []
        return {
            "page_width": float(page.width),
            "page_height": float(page.height),
            "words": [
                {
                    "text": w["text"],
                    "x0": float(w["x0"]),
                    "y0": float(w["top"]),
                    "x1": float(w["x1"]),
                    "y1": float(w["bottom"]),
                }
                for w in words
            ],
        }


def merge_pdfs_skip_blank(paths: list[Path]) -> bytes:
    writer = PdfWriter()
    for path in paths:
        reader = PdfReader(str(path))
        with pdfplumber.open(str(path)) as plumber_pdf:
            for i, (pypdf_page, plumber_page) in enumerate(zip(reader.pages, plumber_pdf.pages)):
                if not is_blank_page(plumber_page):
                    writer.add_page(pypdf_page)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def render_pages_as_images(
    path: Path,
    page_numbers: list[int] | None = None,
    dpi: int = 150,
) -> list[dict]:
    """
    Render PDF pages as base64-encoded PNG images for Claude Vision.
    page_numbers are 1-indexed; None renders all pages.
    Returns list of {"page_number": int, "base64": str, "media_type": "image/png"}.
    """
    doc = fitz.open(str(path))
    total = len(doc)
    nums = page_numbers if page_numbers is not None else list(range(1, total + 1))
    mat = fitz.Matrix(dpi / 72, dpi / 72)

    results = []
    for pn in nums:
        idx = pn - 1
        if 0 <= idx < total:
            pix = doc[idx].get_pixmap(matrix=mat, colorspace=fitz.csRGB)
            img_bytes = pix.tobytes("png")
            results.append({
                "page_number": pn,
                "base64": base64.b64encode(img_bytes).decode("utf-8"),
                "media_type": "image/png",
            })

    doc.close()
    return results
