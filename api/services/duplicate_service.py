from services.file_record_service import list_file_records
from services.template_service import get_template


def _field_value(record: dict, field: str) -> str | None:
    for page in record.get("pages", []):
        val = page.get("fields", {}).get(field)
        if val:
            return str(val).strip().lower()
    return None


def _key_for_record(record: dict, unique_fields: list[str]) -> tuple | None:
    values = [_field_value(record, f) for f in unique_fields]
    if not all(values):
        return None
    return tuple(values)


def find_duplicates() -> list[dict]:
    records = list_file_records()
    by_template: dict[str, list[dict]] = {}
    for r in records:
        tid = r.get("template_id")
        if not tid:
            continue
        by_template.setdefault(tid, []).append(r)

    groups = []
    for template_id, recs in by_template.items():
        template = get_template(template_id)
        if not template:
            continue
        unique_fields = template.get("unique_id_fields") or []
        if not unique_fields:
            continue
        buckets: dict[tuple, list[dict]] = {}
        for r in recs:
            key = _key_for_record(r, unique_fields)
            if key is None:
                continue
            buckets.setdefault(key, []).append(r)
        for key, matched in buckets.items():
            if len(matched) > 1:
                groups.append({
                    "template_id": template_id,
                    "template_name": template.get("name"),
                    "unique_id_fields": unique_fields,
                    "match_values": dict(zip(unique_fields, key)),
                    "files": [
                        {
                            "id": m["id"],
                            "filename": m["filename"],
                            "status": m.get("status"),
                            "uploaded_at": m.get("uploaded_at"),
                        }
                        for m in matched
                    ],
                })
    groups.sort(key=lambda g: len(g["files"]), reverse=True)
    return groups
