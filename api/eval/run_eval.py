"""Score the Reducto extraction against hand-labelled expected values.

Usage (from api/, with the venv active and .env loaded):
    python -m eval.run_eval            # run every case in eval/testset.json
    python -m eval.run_eval --case synthetic-invoice

Each run calls the real Reducto API, so it costs credits: about $0.02 per page.
Results are written to eval/results/ so runs can be compared before and after
a change to a field description or a schema.
"""
import argparse
import json
import re
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE.parent / ".env")

from services.reducto_extraction_service import reducto_extract_template_fields  # noqa: E402


def normalise(value) -> str:
    if value is None:
        return ""
    text = re.sub(r"\s+", " ", str(value)).strip().lower()
    return text.strip(" .,;:")


def run_case(case: dict) -> dict:
    pdf = (HERE / case["pdf"]).resolve()
    result = reducto_extract_template_fields(pdf, case["template"])
    first_page = result["pages"][0]["fields"] if result["pages"] else {}
    rows = []
    for field, expected in case["expected"].items():
        got = first_page.get(field)
        rows.append({
            "field": field,
            "expected": expected,
            "got": got,
            "match": normalise(got) == normalise(expected),
        })
    hits = sum(r["match"] for r in rows)
    return {"case": case["id"], "correct": hits, "total": len(rows), "fields": rows}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", help="run only this case id")
    args = parser.parse_args()

    cases = json.loads((HERE / "testset.json").read_text())
    if args.case:
        cases = [c for c in cases if c["id"] == args.case]

    summaries = []
    for case in cases:
        summary = run_case(case)
        summaries.append(summary)
        print(f"\n== {summary['case']}: {summary['correct']}/{summary['total']} fields correct")
        for r in summary["fields"]:
            mark = "OK  " if r["match"] else "MISS"
            print(f"  [{mark}] {r['field']}: expected={r['expected']!r} got={r['got']!r}")

    total_correct = sum(s["correct"] for s in summaries)
    total = sum(s["total"] for s in summaries)
    pct = (100 * total_correct / total) if total else 0.0
    print(f"\nOVERALL: {total_correct}/{total} fields correct ({pct:.1f}%)")

    out = HERE / "results" / f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    out.write_text(json.dumps({"overall_pct": pct, "cases": summaries}, indent=2, default=str))
    print(f"saved {out.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
