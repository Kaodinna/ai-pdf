from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from services.library_service import (
    list_libraries, get_library, create_library, update_library, delete_library,
    add_row, update_row, delete_row, import_csv_rows, lookup_value,
)

router = APIRouter()


class LibraryCreate(BaseModel):
    name: str
    description: str = ""
    columns: list[str] = ["key", "value"]


class LibraryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    columns: Optional[list[str]] = None


class RowCreate(BaseModel):
    row: dict


class CSVImport(BaseModel):
    csv_text: str


class LookupRequest(BaseModel):
    column: str
    value: str


@router.get("/libraries")
async def get_libraries():
    try:
        return {"success": True, "data": list_libraries(), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/libraries")
async def create_lib(body: LibraryCreate):
    if not body.name.strip():
        return {"success": False, "data": None, "error": "name is required"}
    try:
        lib = create_library(body.name, body.description, body.columns)
        return {"success": True, "data": lib, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.get("/libraries/{library_id}")
async def get_lib(library_id: str):
    lib = get_library(library_id)
    if not lib:
        return {"success": False, "data": None, "error": "Library not found"}
    return {"success": True, "data": lib, "error": None}


@router.put("/libraries/{library_id}")
async def update_lib(library_id: str, body: LibraryUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"success": False, "data": None, "error": "No fields to update"}
    updated = update_library(library_id, updates)
    if not updated:
        return {"success": False, "data": None, "error": "Library not found"}
    return {"success": True, "data": updated, "error": None}


@router.delete("/libraries/{library_id}")
async def delete_lib(library_id: str):
    if not delete_library(library_id):
        return {"success": False, "data": None, "error": "Library not found"}
    return {"success": True, "data": {"deleted": library_id}, "error": None}


@router.post("/libraries/{library_id}/rows")
async def add_lib_row(library_id: str, body: RowCreate):
    updated = add_row(library_id, body.row)
    if not updated:
        return {"success": False, "data": None, "error": "Library not found"}
    return {"success": True, "data": updated, "error": None}


@router.put("/libraries/{library_id}/rows/{row_id}")
async def update_lib_row(library_id: str, row_id: str, body: RowCreate):
    updated = update_row(library_id, row_id, body.row)
    if not updated:
        return {"success": False, "data": None, "error": "Library or row not found"}
    return {"success": True, "data": updated, "error": None}


@router.delete("/libraries/{library_id}/rows/{row_id}")
async def delete_lib_row(library_id: str, row_id: str):
    updated = delete_row(library_id, row_id)
    if not updated:
        return {"success": False, "data": None, "error": "Library or row not found"}
    return {"success": True, "data": updated, "error": None}


@router.post("/libraries/{library_id}/import")
async def import_csv(library_id: str, body: CSVImport):
    try:
        updated = import_csv_rows(library_id, body.csv_text)
        if not updated:
            return {"success": False, "data": None, "error": "Library not found"}
        return {"success": True, "data": updated, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/libraries/{library_id}/lookup")
async def lookup(library_id: str, body: LookupRequest):
    found = lookup_value(library_id, body.column, body.value)
    return {"success": True, "data": {"found": found}, "error": None}
