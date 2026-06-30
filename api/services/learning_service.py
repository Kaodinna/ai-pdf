import json
import uuid
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
MODULES_FILE = DATA_DIR / "learning_modules.json"

DEFAULT_MODULES = [
    {
        "id": str(uuid.uuid4()),
        "title": "Getting Started with AI PDF Studio",
        "description": "Learn the basics of uploading, splitting, and merging PDFs.",
        "category": "Basics",
        "duration_minutes": 5,
        "lessons": [
            {"id": str(uuid.uuid4()), "title": "Uploading your first PDF", "type": "video", "completed": False},
            {"id": str(uuid.uuid4()), "title": "Splitting documents", "type": "article", "completed": False},
            {"id": str(uuid.uuid4()), "title": "Merging documents", "type": "video", "completed": False},
        ],
        "created_at": datetime.utcnow().isoformat(),
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Template Configuration",
        "description": "Set up extraction templates with field configs, synonyms, and data types.",
        "category": "Templates",
        "duration_minutes": 10,
        "lessons": [
            {"id": str(uuid.uuid4()), "title": "Creating a template", "type": "video", "completed": False},
            {"id": str(uuid.uuid4()), "title": "Configuring field types and descriptions", "type": "article", "completed": False},
            {"id": str(uuid.uuid4()), "title": "Adding synonyms for better extraction", "type": "video", "completed": False},
            {"id": str(uuid.uuid4()), "title": "Setting unique ID fields", "type": "quiz", "completed": False},
        ],
        "created_at": datetime.utcnow().isoformat(),
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Automation Rules",
        "description": "Build IF/THEN rules that fire automatically on document events.",
        "category": "Automation",
        "duration_minutes": 15,
        "lessons": [
            {"id": str(uuid.uuid4()), "title": "Understanding trigger types", "type": "article", "completed": False},
            {"id": str(uuid.uuid4()), "title": "Writing your first rule with AI", "type": "video", "completed": False},
            {"id": str(uuid.uuid4()), "title": "Testing rules against real files", "type": "article", "completed": False},
            {"id": str(uuid.uuid4()), "title": "Chaining multiple actions", "type": "quiz", "completed": False},
        ],
        "created_at": datetime.utcnow().isoformat(),
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Workflow Configuration",
        "description": "Design custom status workflows to match your team's process.",
        "category": "Workflow",
        "duration_minutes": 8,
        "lessons": [
            {"id": str(uuid.uuid4()), "title": "Default workflow states", "type": "article", "completed": False},
            {"id": str(uuid.uuid4()), "title": "Adding and reordering states", "type": "video", "completed": False},
            {"id": str(uuid.uuid4()), "title": "Linking rules to workflow transitions", "type": "article", "completed": False},
        ],
        "created_at": datetime.utcnow().isoformat(),
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Basic Library & Reference Data",
        "description": "Create lookup tables and use them in rule conditions.",
        "category": "Data",
        "duration_minutes": 7,
        "lessons": [
            {"id": str(uuid.uuid4()), "title": "Creating a library", "type": "video", "completed": False},
            {"id": str(uuid.uuid4()), "title": "Importing data from CSV", "type": "article", "completed": False},
            {"id": str(uuid.uuid4()), "title": "Referencing library values in rules", "type": "article", "completed": False},
        ],
        "created_at": datetime.utcnow().isoformat(),
    },
]


def _load() -> list[dict]:
    if not MODULES_FILE.exists():
        _save(DEFAULT_MODULES)
        return DEFAULT_MODULES
    return json.loads(MODULES_FILE.read_text())


def _save(modules: list[dict]) -> None:
    MODULES_FILE.write_text(json.dumps(modules, indent=2))


def list_modules(category: str | None = None) -> list[dict]:
    modules = _load()
    if category:
        modules = [m for m in modules if m.get("category") == category]
    return modules


def get_module(module_id: str) -> dict | None:
    return next((m for m in _load() if m["id"] == module_id), None)


def mark_lesson_complete(module_id: str, lesson_id: str, completed: bool = True) -> dict | None:
    modules = _load()
    for mod in modules:
        if mod["id"] == module_id:
            for lesson in mod.get("lessons", []):
                if lesson["id"] == lesson_id:
                    lesson["completed"] = completed
                    _save(modules)
                    return mod
    return None


def create_module(title: str, description: str, category: str, duration_minutes: int, lessons: list[dict]) -> dict:
    modules = _load()
    module = {
        "id": str(uuid.uuid4()),
        "title": title,
        "description": description,
        "category": category,
        "duration_minutes": duration_minutes,
        "lessons": [
            {"id": str(uuid.uuid4()), "title": l.get("title", ""), "type": l.get("type", "article"), "completed": False}
            for l in lessons
        ],
        "created_at": datetime.utcnow().isoformat(),
    }
    modules.append(module)
    _save(modules)
    return module


def delete_module(module_id: str) -> bool:
    modules = _load()
    filtered = [m for m in modules if m["id"] != module_id]
    if len(filtered) == len(modules):
        return False
    _save(filtered)
    return True
