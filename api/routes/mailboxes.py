from typing import Optional

from fastapi import APIRouter
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


@router.get("/mailboxes")
async def get_mailboxes():
    return {"success": True, "data": list_mailboxes(), "error": None}


@router.post("/mailboxes")
async def add_mailbox(body: MailboxCreate):
    if not body.label.strip() or not body.user.strip() or not body.password.strip():
        return {"success": False, "data": None, "error": "label, user and password are required"}
    mailbox = create_mailbox(
        label=body.label.strip(), host=body.host, port=body.port,
        user=body.user.strip(), password=body.password,
        template_id=body.template_id, template_name=body.template_name,
    )
    return {"success": True, "data": mailbox, "error": None}


@router.put("/mailboxes/{mailbox_id}")
async def edit_mailbox(mailbox_id: str, body: MailboxUpdate):
    if not get_mailbox(mailbox_id):
        return {"success": False, "data": None, "error": "Mailbox not found"}
    updated = update_mailbox(mailbox_id, body.model_dump(exclude_none=True))
    return {"success": True, "data": updated, "error": None}


@router.delete("/mailboxes/{mailbox_id}")
async def remove_mailbox(mailbox_id: str):
    deleted = delete_mailbox(mailbox_id)
    if not deleted:
        return {"success": False, "data": None, "error": "Mailbox not found"}
    return {"success": True, "data": {"deleted": mailbox_id}, "error": None}
