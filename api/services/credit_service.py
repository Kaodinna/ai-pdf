"""
Prepaid credit ledger. Each account (a user) holds a credit balance; every
extracted page is charged against it. Credits are an internal unit:
1 credit = USD_PER_CREDIT dollars, and an extracted page costs PAGE_CREDITS.
"""

import json
import threading
import uuid
from datetime import datetime
from pathlib import Path

CREDITS_FILE = Path(__file__).parent.parent / "data" / "credits.json"
CREDITS_FILE.parent.mkdir(parents=True, exist_ok=True)

USD_PER_CREDIT = 0.005
PAGE_CREDITS = 20
TRIAL_CREDITS = 500
PACKAGES = [
    {"id": "starter", "name": "Starter", "credits": 2000, "usd": 10},
    {"id": "growth", "name": "Growth", "credits": 10000, "usd": 45},
    {"id": "scale", "name": "Scale", "credits": 50000, "usd": 200},
]

# Fixed credit prices for Claude-only features, set from measured token usage
# with a margin. Failed calls are refunded in full.
CLAUDE_COSTS = {
    "detect": 20,      # match a document to a template (measured $0.01–0.03)
    "apply": 20,       # find the pages for a template (measured ~$0.01)
    "group": 60,       # split a file into documents (measured $0.005–0.05)
    "refine": 40,      # refine with AI
    "ai_plan": 20,     # AI Commands
    "rule": 20,        # rule generation
}

_lock = threading.Lock()


class InsufficientCredits(ValueError):
    pass


def _load() -> dict:
    if not CREDITS_FILE.exists():
        return {"balances": {}, "ledger": [], "processed_sessions": []}
    return json.loads(CREDITS_FILE.read_text())


def _save(data: dict) -> None:
    CREDITS_FILE.write_text(json.dumps(data, indent=2))


def get_balance(user_id: str) -> int:
    with _lock:
        return _load()["balances"].get(user_id, 0)


def history(user_id: str, limit: int = 100) -> list[dict]:
    with _lock:
        entries = [e for e in _load()["ledger"] if e["user_id"] == user_id]
    return list(reversed(entries))[:limit]


def _apply(data: dict, user_id: str, delta: int, reason: str, ref: str | None) -> dict:
    balance = data["balances"].get(user_id, 0) + delta
    data["balances"][user_id] = balance
    entry = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "delta": delta,
        "balance_after": balance,
        "reason": reason,
        "ref": ref,
        "created_at": datetime.utcnow().isoformat(),
    }
    data["ledger"].append(entry)
    return entry


def grant(user_id: str, credits: int, reason: str, ref: str | None = None) -> int:
    if credits <= 0:
        raise ValueError("credits must be positive")
    with _lock:
        data = _load()
        _apply(data, user_id, credits, reason, ref)
        _save(data)
        return data["balances"][user_id]


def grant_once(session_id: str, user_id: str, credits: int, reason: str) -> bool:
    """Idempotent grant for payment webhooks: a retried event never credits twice."""
    with _lock:
        data = _load()
        if session_id in data["processed_sessions"]:
            return False
        data["processed_sessions"].append(session_id)
        _apply(data, user_id, credits, reason, session_id)
        _save(data)
        return True


def grant_trial(user_id: str) -> None:
    grant(user_id, TRIAL_CREDITS, "Free trial credits", ref="trial")


def pages_cost(pages: int) -> int:
    return pages * PAGE_CREDITS


def require_pages(user_id: str, pages: int) -> None:
    """Raise before any work starts if the account can't pay for these pages."""
    need = pages_cost(pages)
    have = get_balance(user_id)
    if have < need:
        raise InsufficientCredits(
            f"Not enough credits: this needs {need} credits ({pages} page{'s' if pages != 1 else ''} "
            f"at {PAGE_CREDITS} each) but the balance is {have}. Buy more credits in Billing."
        )


def charge_pages(user_id: str, pages: int, reason: str, ref: str | None = None) -> int:
    """Charge for pages actually extracted. Runs after success, so failed runs cost nothing."""
    if pages <= 0:
        return get_balance(user_id)
    with _lock:
        data = _load()
        _apply(data, user_id, -pages_cost(pages), reason, ref)
        _save(data)
        return data["balances"][user_id]


def billing_account_for_file(record: dict | None) -> str | None:
    """Who pays for a file: its owner. Unowned mailbox files are charged to an admin of the file's company."""
    if record and record.get("owner_id"):
        return record["owner_id"]
    from services.auth_service import list_users
    company_id = (record or {}).get("company_id")
    admin = next((u for u in list_users()
                  if u.get("role") == "admin" and u.get("company_id") == company_id), None)
    return admin["id"] if admin else None


def ensure_trials_for_existing_users() -> int:
    """Give each account the trial amount once, so accounts created before billing existed aren't blocked on deploy."""
    from services.auth_service import list_users
    granted = 0
    with _lock:
        data = _load()
        already = {e["user_id"] for e in data["ledger"] if e.get("ref") == "trial"}
        for user in list_users():
            if user["id"] in already:
                continue
            _apply(data, user["id"], TRIAL_CREDITS, "Free trial credits", "trial")
            granted += 1
        if granted:
            _save(data)
    return granted


def _debit(user_id: str, credits: int, reason: str, ref: str | None) -> int:
    with _lock:
        data = _load()
        _apply(data, user_id, -credits, reason, ref)
        _save(data)
        return data["balances"][user_id]


def _refund(user_id: str, credits: int, reason: str, ref: str | None) -> None:
    if credits <= 0:
        return
    with _lock:
        data = _load()
        _apply(data, user_id, credits, reason, ref)
        _save(data)


class Reservation:
    """Takes credits before work starts (so two runs can't both spend the same balance),
    then refunds whatever wasn't used. A failed run is refunded in full.

    Set `actual` to the credits really used before leaving the block."""

    def __init__(self, user_id: str, credits: int, reason: str, ref: str | None = None):
        self.user_id = user_id
        self.credits = credits
        self.reason = reason
        self.ref = ref
        self.actual: int | None = None

    def __enter__(self):
        if self.credits <= 0:
            return self
        with _lock:
            balance = _load()["balances"].get(self.user_id, 0)
        if balance < self.credits:
            raise InsufficientCredits(
                f"Not enough credits: this needs {self.credits} credits but the balance is {balance}. "
                f"Buy more credits in Billing."
            )
        _debit(self.user_id, self.credits, f"Reserved: {self.reason}", self.ref)
        return self

    def __exit__(self, exc_type, exc, tb):
        if self.credits <= 0:
            return False
        used = 0 if exc_type else (self.credits if self.actual is None else min(self.actual, self.credits))
        refund = self.credits - used
        if refund > 0:
            label = "Refund: failed run" if exc_type else "Refund: unused reserve"
            _refund(self.user_id, refund, f"{label} ({self.reason})", self.ref)
        return False


def run_metered(user_id: str, credits: int, reason: str, fn, *args, ref: str | None = None, **kwargs):
    """Run a fixed-cost Claude call under a reservation: charged on success, refunded on failure."""
    with Reservation(user_id, credits, reason, ref) as r:
        result = fn(*args, **kwargs)
        r.actual = credits
        return result
