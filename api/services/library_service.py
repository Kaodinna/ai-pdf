import json
import uuid
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
LIBRARIES_FILE = DATA_DIR / "libraries.json"


def _load() -> list[dict]:
    if not LIBRARIES_FILE.exists():
        return []
    return json.loads(LIBRARIES_FILE.read_text())


def _save(libraries: list[dict]) -> None:
    LIBRARIES_FILE.write_text(json.dumps(libraries, indent=2))


def list_libraries() -> list[dict]:
    return _load()


def get_library(library_id: str) -> dict | None:
    return next((lib for lib in _load() if lib["id"] == library_id), None)


def create_library(name: str, description: str = "", columns: list[str] | None = None) -> dict:
    libraries = _load()
    library = {
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
        if lib["id"] == library_id:
            for k, v in updates.items():
                if k not in ("id", "created_at"):
                    lib[k] = v
            lib["updated_at"] = datetime.utcnow().isoformat()
            _save(libraries)
            return lib
    return None


def delete_library(library_id: str) -> bool:
    libraries = _load()
    filtered = [lib for lib in libraries if lib["id"] != library_id]
    if len(filtered) == len(libraries):
        return False
    _save(filtered)
    return True


def add_row(library_id: str, row: dict) -> dict | None:
    libraries = _load()
    for lib in libraries:
        if lib["id"] == library_id:
            row["_id"] = str(uuid.uuid4())
            lib["rows"].append(row)
            lib["updated_at"] = datetime.utcnow().isoformat()
            _save(libraries)
            return lib
    return None


def update_row(library_id: str, row_id: str, row: dict) -> dict | None:
    libraries = _load()
    for lib in libraries:
        if lib["id"] == library_id:
            for i, r in enumerate(lib["rows"]):
                if r.get("_id") == row_id:
                    row["_id"] = row_id
                    lib["rows"][i] = row
                    lib["updated_at"] = datetime.utcnow().isoformat()
                    _save(libraries)
                    return lib
    return None


def delete_row(library_id: str, row_id: str) -> dict | None:
    libraries = _load()
    for lib in libraries:
        if lib["id"] == library_id:
            lib["rows"] = [r for r in lib["rows"] if r.get("_id") != row_id]
            lib["updated_at"] = datetime.utcnow().isoformat()
            _save(libraries)
            return lib
    return None


def import_csv_rows(library_id: str, csv_text: str) -> dict | None:
    import csv, io
    libraries = _load()
    for lib in libraries:
        if lib["id"] == library_id:
            reader = csv.DictReader(io.StringIO(csv_text))
            if reader.fieldnames:
                lib["columns"] = list(reader.fieldnames)
            for row in reader:
                row["_id"] = str(uuid.uuid4())
                lib["rows"].append(row)
            lib["updated_at"] = datetime.utcnow().isoformat()
            _save(libraries)
            return lib
    return None


def lookup_value(library_id: str, column: str, value: str) -> bool:
    lib = get_library(library_id)
    if not lib:
        return False
    return any(str(r.get(column, "")).strip().lower() == value.strip().lower() for r in lib["rows"])


def library_lookup_derived(
    library_id: str,
    match_field: str,
    match_value: str,
    return_field: str,
) -> str | None:
    """Find the first row where match_field == match_value and return return_field's value."""
    lib = get_library(library_id)
    if not lib:
        return None
    needle = match_value.strip().lower()
    for row in lib.get("rows", []):
        if str(row.get(match_field, "")).strip().lower() == needle:
            val = row.get(return_field)
            return str(val) if val is not None else None
    return None
