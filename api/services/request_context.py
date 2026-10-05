"""Which company the current request (or background job) is acting for.

Set once per request by the auth middleware and per job by company_scope(). Stores
read it to filter what's visible and to tag what they create, so each store
enforces the company boundary itself rather than relying on every route to remember.
"""
from contextlib import contextmanager
from contextvars import ContextVar

current_company: ContextVar[str | None] = ContextVar("current_company", default=None)
current_is_platform: ContextVar[bool] = ContextVar("current_is_platform", default=False)


def visible(item: dict) -> bool:
    if current_is_platform.get():
        return True
    company = current_company.get()
    return bool(company) and item.get("company_id") == company


def stamp(item: dict) -> dict:
    item["company_id"] = current_company.get()
    return item


@contextmanager
def company_scope(company_id: str | None, platform: bool = False):
    t1 = current_company.set(company_id)
    t2 = current_is_platform.set(platform)
    try:
        yield
    finally:
        current_is_platform.reset(t2)
        current_company.reset(t1)
