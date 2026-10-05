from typing import Optional

from fastapi import APIRouter, Request
from services.company_service import is_platform_owner
from pydantic import BaseModel

from services.mailbox_config_service import (
    list_mailboxes, get_mailbox, create_mailbox, update_mailbox, delete_mailbox,
)

router = APIRouter()


class MailboxCreate(BaseModel):
    label: str
    host: str = "imap.gmail.com"
    port: int = 993
    user: str
    password: str
    template_id: Optional[str] = None
    template_name: Optional[str] = None


class MailboxUpdate(BaseModel):
    label: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    user: Optional[str] = None
    password: Optional[str] = None
    template_id: Optional[str] = None
    template_name: Optional[str] = None
    enabled: Optional[bool] = None


def _scope(request: Request) -> str | None:
    """None for the platform owner (sees all), otherwise the caller's company."""
    user = request.state.user
    if is_platform_owner(user):
        return None
    # A caller with no company must match nothing, never "everything".
    return user.get("company_id") or "__no_company__"


def _owned(mailbox: dict | None, request: Request) -> bool:
    if not mailbox:
        return False
    scope = _scope(request)
    return scope is None or mailbox.get("company_id") == scope


@router.get("/mailboxes")
async def get_mailboxes(request: Request):
    return {"success": True, "data": list_mailboxes(company_id=_scope(request)), "error": None}


@router.post("/mailboxes")
async def add_mailbox(body: MailboxCreate, request: Request):
    if not body.label.strip() or not body.user.strip() or not body.password.strip():
        return {"success": False, "data": None, "error": "label, user and password are required"}
    mailbox = create_mailbox(
        label=body.label.strip(), host=body.host, port=body.port,
        user=body.user.strip(), password=body.password,
        template_id=body.template_id, template_name=body.template_name,
        company_id=request.state.user.get("company_id"),
    )
    return {"success": True, "data": mailbox, "error": None}


@router.put("/mailboxes/{mailbox_id}")
async def edit_mailbox(mailbox_id: str, body: MailboxUpdate, request: Request):
    if not _owned(get_mailbox(mailbox_id), request):
        return {"success": False, "data": None, "error": "Mailbox not found"}
    updated = update_mailbox(mailbox_id, body.model_dump(exclude_none=True))
    return {"success": True, "data": updated, "error": None}


@router.delete("/mailboxes/{mailbox_id}")
async def remove_mailbox(mailbox_id: str, request: Request):
    if not _owned(get_mailbox(mailbox_id), request):
        return {"success": False, "data": None, "error": "Mailbox not found"}
    deleted = delete_mailbox(mailbox_id)
    if not deleted:
        return {"success": False, "data": None, "error": "Mailbox not found"}
    return {"success": True, "data": {"deleted": mailbox_id}, "error": None}
