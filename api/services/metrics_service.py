import json
from pathlib import Path

METRICS_FILE = Path(__file__).parent.parent / "data" / "metrics.json"
METRICS_FILE.parent.mkdir(parents=True, exist_ok=True)

DEFAULTS = {
    "auto_approved_fields_total": 0,
    "corrected_after_approval_total": 0,
}


def get_metrics() -> dict:
    if not METRICS_FILE.exists():
        return dict(DEFAULTS)
    stored = json.loads(METRICS_FILE.read_text())
    return {**DEFAULTS, **stored}


def increment(key: str, by: int = 1) -> dict:
    metrics = get_metrics()
    metrics[key] = metrics.get(key, 0) + by
    METRICS_FILE.write_text(json.dumps(metrics, indent=2))
    return metrics
