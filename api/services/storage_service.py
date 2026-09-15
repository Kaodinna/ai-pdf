import os
import shutil
import uuid
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"

UPLOAD_DIR = Path(os.environ.get("AI_PDF_UPLOAD_DIR") or DATA_DIR / "uploads")
OUTPUT_DIR = Path(os.environ.get("AI_PDF_OUTPUT_DIR") or DATA_DIR / "outputs")

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


class StorageService:
    def upload_dir(self) -> Path:
        return UPLOAD_DIR

    def output_dir(self) -> Path:
        return OUTPUT_DIR

    def save_upload(self, content: bytes, original_filename: str) -> str:
        file_id = str(uuid.uuid4())
        ext = Path(original_filename).suffix or ".pdf"
        dest = UPLOAD_DIR / f"{file_id}{ext}"
        dest.write_bytes(content)
        return file_id

    def get_upload_path(self, file_id: str) -> Path:
        matches = list(UPLOAD_DIR.glob(f"{file_id}*"))
        if not matches:
            raise FileNotFoundError(f"No uploaded file found for id: {file_id}")
        return matches[0]

    def save_output(self, content: bytes, filename: str) -> str:
        out_id = str(uuid.uuid4())
        dest = OUTPUT_DIR / f"{out_id}_{filename}"
        dest.write_bytes(content)
        return dest.name

    def get_output_path(self, filename: str) -> Path:
        path = OUTPUT_DIR / filename
        if not path.exists():
            raise FileNotFoundError(f"Output file not found: {filename}")
        return path

    def delete_upload(self, file_id: str) -> None:
        try:
            path = self.get_upload_path(file_id)
            path.unlink()
        except FileNotFoundError:
            pass


storage = StorageService()
