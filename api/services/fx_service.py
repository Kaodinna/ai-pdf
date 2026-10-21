"""
Live USD -> X exchange rates, so credit packages can be priced in a
customer's own currency without hardcoded rates going stale. Two free,
keyless providers, tried in order; the last successful rates table is
cached in memory for a while and also persisted to disk, so a provider
outage never breaks checkout — it just serves the last known-good rates
and says so (``stale: True``).
"""

import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

FX_CACHE_FILE = Path(__file__).parent.parent / "data" / "fx_rates.json"
FX_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)

_TTL_SECONDS = 3600  # re-fetch at most once an hour — both providers update daily anyway

# Last resort, only if no provider has ever succeeded and nothing is cached.
# Rough snapshot rates — only used if both live providers AND the on-disk
# cache are unavailable, which should be very rare.
_FALLBACK_RATES = {"NGN": 1375.0, "GHS": 11.7, "ZAR": 16.4, "KES": 130.0, "USD": 1.0}

_lock = threading.Lock()
_cache: dict = {"rates": None, "fetched_at": 0.0, "source": None}


def _fetch_primary() -> dict:
    resp = httpx.get("https://open.er-api.com/v6/latest/USD", timeout=8)
    resp.raise_for_status()
    data = resp.json()
    if data.get("result") != "success":
        raise RuntimeError("primary FX provider returned an error")
    return {k: float(v) for k, v in data["rates"].items()}


def _fetch_fallback() -> dict:
    resp = httpx.get(
        "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
        timeout=8,
    )
    resp.raise_for_status()
    return {k.upper(): float(v) for k, v in resp.json()["usd"].items()}


def _load_persisted() -> dict | None:
    if not FX_CACHE_FILE.exists():
        return None
    try:
        return json.loads(FX_CACHE_FILE.read_text())
    except Exception:
        return None


def _persist(rates: dict, source: str) -> None:
    try:
        FX_CACHE_FILE.write_text(json.dumps({
            "rates": rates,
            "source": source,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }, indent=2))
    except Exception:
        pass  # a failed write shouldn't break pricing — the in-memory cache still has it


def get_rates() -> dict:
    """{"rates" (dict of currency code -> units per USD), "source",
    "fetched_at" (epoch seconds), "as_of" (ISO string), "stale"}.
    Fetches at most once per _TTL_SECONDS; on failure, serves the last
    known-good table (memory, then disk, then a hardcoded fallback) and
    marks it stale so callers can warn the admin."""
    with _lock:
        now = time.time()
        if _cache["rates"] is not None and now - _cache["fetched_at"] < _TTL_SECONDS:
            return _as_result(stale=False)

        for fetch, source in ((_fetch_primary, "open.er-api.com"), (_fetch_fallback, "fawazahmed0/currency-api")):
            try:
                rates = fetch()
                _cache.update({"rates": rates, "fetched_at": now, "source": source})
                _persist(rates, source)
                return _as_result(stale=False)
            except Exception:
                continue

        # Both providers failed this round.
        if _cache["rates"] is not None:
            return _as_result(stale=True)
        persisted = _load_persisted()
        if persisted and persisted.get("rates"):
            _cache.update({"rates": persisted["rates"], "fetched_at": now, "source": persisted.get("source", "cached")})
            return _as_result(stale=True)
        _cache.update({"rates": dict(_FALLBACK_RATES), "fetched_at": now, "source": "hardcoded fallback"})
        return _as_result(stale=True)


def get_rate(currency: str) -> float:
    """Units of `currency` per USD. 1.0 if the currency isn't in the table
    (treated as USD) — callers should only pass currencies they trust."""
    rates = get_rates()["rates"]
    return rates.get(currency.upper(), 1.0)


def _as_result(stale: bool) -> dict:
    return {
        "rates": _cache["rates"],
        "source": _cache["source"],
        "fetched_at": _cache["fetched_at"],
        "as_of": datetime.fromtimestamp(_cache["fetched_at"], tz=timezone.utc).isoformat(),
        "stale": stale,
    }
