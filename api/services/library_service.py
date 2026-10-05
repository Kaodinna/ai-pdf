import json

from services.request_context import current_company, visible
import uuid
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
LIBRARIES_FILE = DATA_DIR / "libraries.json"

# In-memory search index built by reindex_search(); keyed by library_id -> {(column, lowercased value): row}.
# Invalidated (popped) whenever a library's rows change, so a stale index never serves a lookup —
# library_lookup_derived falls back to a linear scan until the index is explicitly rebuilt.
_INDEX: dict[str, dict[tuple[str, str], dict]] = {}


def _load() -> list[dict]:
    if not LIBRARIES_FILE.exists():
        return []
    return json.loads(LIBRARIES_FILE.read_text())


def _save(libraries: list[dict]) -> None:
    LIBRARIES_FILE.write_text(json.dumps(libraries, indent=2))


def list_libraries() -> list[dict]:
    return [lib for lib in _load() if visible(lib)]


def get_library(library_id: str) -> dict | None:
    return next((lib for lib in _load() if lib["id"] == library_id and visible(lib)), None)


def create_library(name: str, description: str = "", columns: list[str] | None = None) -> dict:
    libraries = _load()
    library = {
        "company_id": current_company.get(),
        "id": str(uuid.uuid4()),
        "name": name,
        "description": description,
        "columns": columns or ["key", "value"],
        "rows": [],
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    libraries.append(library)
    _save(libraries)
    return library


def update_library(library_id: str, updates: dict) -> dict | None:
    libraries = _load()
    for lib in libraries:
        if lib["id"] == library_id and visible(lib):
            for k, v in updates.items():
                if k not in ("id", "created_at"):
                    lib[k] = v
            lib["updated_at"] = datetime.utcnow().isoformat()
            _save(libraries)
            return lib
    return None


def delete_library(library_id: str) -> bool:
    libraries = _load()
    filtered = [lib for lib in libraries if not (lib["id"] == library_id and visible(lib))]
    if len(filtered) == len(libraries):
        return False
    _save(filtered)
    _INDEX.pop(library_id, None)
    return True


def add_row(library_id: str, row: dict) -> dict | None:
    libraries = _load()
    for lib in libraries:
        if lib["id"] == library_id and visible(lib):
            row["_id"] = str(uuid.uuid4())
            lib["rows"].append(row)
            lib["updated_at"] = datetime.utcnow().isoformat()
            _save(libraries)
            _INDEX.pop(library_id, None)
            return lib
    return None


def update_row(library_id: str, row_id: str, row: dict) -> dict | None:
    libraries = _load()
    for lib in libraries:
        if lib["id"] == library_id and visible(lib):
            for i, r in enumerate(lib["rows"]):
                if r.get("_id") == row_id:
                    row["_id"] = row_id
                    lib["rows"][i] = row
                    lib["updated_at"] = datetime.utcnow().isoformat()
                    _save(libraries)
                    _INDEX.pop(library_id, None)
                    return lib
    return None


def delete_row(library_id: str, row_id: str) -> dict | None:
    libraries = _load()
    for lib in libraries:
        if lib["id"] == library_id and visible(lib):
            lib["rows"] = [r for r in lib["rows"] if r.get("_id") != row_id]
            lib["updated_at"] = datetime.utcnow().isoformat()
            _save(libraries)
            _INDEX.pop(library_id, None)
            return lib
    return None


def import_csv_rows(library_id: str, csv_text: str) -> dict | None:
    import csv, io
    libraries = _load()
    for lib in libraries:
        if lib["id"] == library_id and visible(lib):
            reader = csv.DictReader(io.StringIO(csv_text))
            if reader.fieldnames:
                lib["columns"] = list(reader.fieldnames)
            for row in reader:
                row["_id"] = str(uuid.uuid4())
                lib["rows"].append(row)
            lib["updated_at"] = datetime.utcnow().isoformat()
            _save(libraries)
            _INDEX.pop(library_id, None)
            return lib
    return None


def lookup_value(library_id: str, column: str, value: str) -> bool:
    lib = get_library(library_id)
    if not lib:
        return False
    return any(str(r.get(column, "")).strip().lower() == value.strip().lower() for r in lib["rows"])


def reindex_search(library_id: str) -> dict | None:
    """Build an in-memory (column, lowercased value) -> row index for fast lookups, and record when."""
    lib = get_library(library_id)
    if not lib:
        return None
    index: dict[tuple[str, str], dict] = {}
    for row in lib.get("rows", []):
        for col in lib.get("columns", []):
            key = (col, str(row.get(col, "")).strip().lower())
            index.setdefault(key, row)
    _INDEX[library_id] = index
    return update_library(library_id, {
        "last_indexed_at": datetime.utcnow().isoformat(),
        "indexed_row_count": len(lib.get("rows", [])),
    })


def _record_cache_hit(library_id: str, row: dict) -> None:
    libraries = _load()
    for lib in libraries:
        if lib["id"] == library_id and visible(lib):
            cache = lib.setdefault("cache", [])
            if any(c.get("_row_id") == row.get("_id") for c in cache):
                return
            cache.insert(0, {**row, "_id": str(uuid.uuid4()), "_row_id": row.get("_id"),
                              "_cached_at": datetime.utcnow().isoformat()})
            _save(libraries)
            return


def list_cache(library_id: str) -> list[dict]:
    lib = get_library(library_id)
    return lib.get("cache", []) if lib else []


def clear_cache(library_id: str) -> dict | None:
    return update_library(library_id, {"cache": []})


def delete_cache_row(library_id: str, cache_row_id: str) -> dict | None:
    libraries = _load()
    for lib in libraries:
        if lib["id"] == library_id and visible(lib):
            lib["cache"] = [c for c in lib.get("cache", []) if c.get("_id") != cache_row_id]
            _save(libraries)
            return lib
    return None


def library_lookup_derived(
    library_id: str,
    match_field: str,
    match_value: str,
    return_field: str,
) -> str | None:
    """Find the row where match_field == match_value (via the search index when available,
    else a linear scan) and return return_field's value. Matches are recorded in the cache."""
    needle = match_value.strip().lower()
    index = _INDEX.get(library_id)
    row = index.get((match_field, needle)) if index is not None else None
    if row is None:
        lib = get_library(library_id)
        if not lib:
            return None
        row = next(
            (r for r in lib.get("rows", []) if str(r.get(match_field, "")).strip().lower() == needle),
            None,
        )
    if row is None:
        return None
    _record_cache_hit(library_id, row)
    val = row.get(return_field)
    return str(val) if val is not None else None
