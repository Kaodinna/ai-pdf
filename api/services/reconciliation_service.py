from services.file_record_service import get_accessible_file_record


def _get_field_value(record: dict, field: str) -> str | None:
    for page in record.get("pages", []):
        val = page.get("fields", {}).get(field)
        if val:
            return str(val).strip()
    return None


def get_all_fields(file_ids: list[str], user: dict) -> list[str]:
    fields: set[str] = set()
    for fid in file_ids:
        rec = get_accessible_file_record(fid, user)
        if not rec:
            continue
        for page in rec.get("pages", []):
            fields.update(page.get("fields", {}).keys())
    return sorted(fields)


def reconcile(
    file_ids: list[str],
    match_field: str,
    compare_fields: list[str],
    user: dict,
) -> list[dict]:
    records = []
    for fid in file_ids:
        rec = get_accessible_file_record(fid, user)
        if rec:
            records.append(rec)

    by_key: dict[str, list[dict]] = {}
    unmatched = []
    for rec in records:
        key = _get_field_value(rec, match_field)
        if key is None:
            unmatched.append(rec)
            continue
        by_key.setdefault(key.lower(), []).append(rec)

    if unmatched:
        by_key.setdefault("(no match key)", []).extend(unmatched)

    result = []
    for key_val, grp in by_key.items():
        comparisons = []
        for field in compare_fields:
            values = {r["id"]: _get_field_value(r, field) for r in grp}
            non_null = [v for v in values.values() if v is not None]
            matches = len(set(non_null)) <= 1 if non_null else True
            comparisons.append({
                "field": field,
                "values": values,
                "matches": matches,
            })
        result.append({
            "key_value": key_val,
            "files": [
                {"id": r["id"], "filename": r["filename"], "template_name": r.get("template_name")}
                for r in grp
            ],
            "comparisons": comparisons,
            "all_match": all(c["matches"] for c in comparisons),
        })

    result.sort(key=lambda g: (not g["all_match"], g["key_value"]))
    return result
