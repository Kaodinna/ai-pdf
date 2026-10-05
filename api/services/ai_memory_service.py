import json
import uuid
from datetime import datetime
from pathlib import Path

MEMORIES_FILE = Path(__file__).parent.parent / "data" / "ai_memories.json"
MEMORIES_FILE.parent.mkdir(parents=True, exist_ok=True)


def _load() -> list[dict]:
    if not MEMORIES_FILE.exists():
        return []
    return json.loads(MEMORIES_FILE.read_text())


def _save(memories: list[dict]) -> None:
    MEMORIES_FILE.write_text(json.dumps(memories, indent=2))


def list_memories(doc_type: str | None = None, company_id: str | None = None, all_companies: bool = False) -> list[dict]:
    memories = _load()
    if not all_companies:
        memories = [m for m in memories if m.get("company_id") == company_id]
    if doc_type:
        memories = [m for m in memories if m.get("doc_type") == doc_type]
    return sorted(memories, key=lambda m: m.get("created_at", ""), reverse=True)


def get_active_memories(doc_type: str | None, company_id: str | None) -> list[dict]:
    """Only this company's corrections ever influence its extractions."""
    return [
        m for m in _load()
        if m.get("active", True)
        and m.get("company_id") == company_id
        and (not doc_type or m.get("doc_type") == doc_type)
    ]


def create_memory(
    field_name: str,
    doc_type: str | None,
    original_value: str | None,
    corrected_value: str | None,
    reason: str,
    created_by: str = "system",
    company_id: str | None = None,
) -> dict:
    memory = {
        "company_id": company_id,
        "id": str(uuid.uuid4()),
        "field_name": field_name,
        "doc_type": doc_type,
        "original_value": original_value,
        "corrected_value": corrected_value,
        "reason": reason,
        "active": True,
        "created_by": created_by,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    memories = _load()
    memories.append(memory)
    _save(memories)
    return memory


def update_memory(memory_id: str, updates: dict) -> dict | None:
    memories = _load()
    for i, m in enumerate(memories):
        if m["id"] == memory_id:
            memories[i] = {**m, **updates, "updated_at": datetime.utcnow().isoformat()}
            _save(memories)
            return memories[i]
    return None


def delete_memory(memory_id: str) -> bool:
    memories = _load()
    new_list = [m for m in memories if m["id"] != memory_id]
    if len(new_list) == len(memories):
        return False
    _save(new_list)
    return True
