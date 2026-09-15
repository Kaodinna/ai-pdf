from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services.document_type_service import (
    list_doc_types, create_doc_type, update_doc_type, delete_doc_type,
)

router = APIRouter()


class DocTypeCreate(BaseModel):
    document_type: str = Field(max_length=50)
    abbreviation: str = Field(max_length=3)
    client_document_type: str = ""
    keywords: list[str] = []
    description: str = Field(default="", max_length=2000)
    allow_processing: bool = False


class DocTypeUpdate(BaseModel):
    document_type: Optional[str] = Field(default=None, max_length=50)
    abbreviation: Optional[str] = Field(default=None, max_length=3)
    client_document_type: Optional[str] = None
    keywords: Optional[list[str]] = None
    description: Optional[str] = Field(default=None, max_length=2000)
    allow_processing: Optional[bool] = None


@router.get("/document-types")
async def get_doc_types():
    return {"success": True, "data": list_doc_types(), "error": None}


@router.post("/document-types")
async def post_doc_type(body: DocTypeCreate):
    if not body.document_type.strip() or not body.abbreviation.strip():
        return {"success": False, "data": None, "error": "document_type and abbreviation are required"}
    doc_type = create_doc_type(
        document_type=body.document_type.strip(),
        abbreviation=body.abbreviation.strip().upper(),
        client_document_type=body.client_document_type.strip(),
        keywords=body.keywords,
        description=body.description.strip(),
        allow_processing=body.allow_processing,
    )
    return {"success": True, "data": doc_type, "error": None}


@router.put("/document-types/{doc_type_id}")
async def put_doc_type(doc_type_id: str, body: DocTypeUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"success": False, "data": None, "error": "No fields to update"}
    updated = update_doc_type(doc_type_id, updates)
    if not updated:
        return {"success": False, "data": None, "error": "Document type not found"}
    return {"success": True, "data": updated, "error": None}


@router.delete("/document-types/{doc_type_id}")
async def remove_doc_type(doc_type_id: str):
    deleted = delete_doc_type(doc_type_id)
    if not deleted:
        return {"success": False, "data": None, "error": "Document type not found"}
    return {"success": True, "data": {"deleted": doc_type_id}, "error": None}
