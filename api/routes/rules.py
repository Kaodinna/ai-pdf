from services.credit_service import run_metered, CLAUDE_COSTS
from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional

from services.rule_service import (
    list_rules, get_rule, create_rule, update_rule, toggle_rule, delete_rule,
    TRIGGER_TYPES, CONDITION_OPERATORS, ACTION_TYPES,
)
from services.rule_engine import evaluate_rule, collect_field_data, run_rules_on_file
from services.ai_service import ai_generate_rule
from services.file_record_service import get_file_record, get_accessible_file_record

router = APIRouter()


class RuleCreate(BaseModel):
    name: str
    trigger_type: str
    logic_operator: str = "AND"
    conditions: list[dict] = []
    actions: list[dict] = []
    description: str = ""
    created_by: str = ""


class RuleUpdate(BaseModel):
    name: Optional[str] = None
    trigger_type: Optional[str] = None
    logic_operator: Optional[str] = None
    conditions: Optional[list[dict]] = None
    actions: Optional[list[dict]] = None
    description: Optional[str] = None
    active: Optional[bool] = None


class GenerateRuleRequest(BaseModel):
    description: str
    trigger_type: str
    file_id: Optional[str] = None


class TestRuleRequest(BaseModel):
    conditions: list[dict]
    logic_operator: str = "AND"
    actions: list[dict]
    file_id: str


@router.get("/rules")
async def get_rules(trigger_type: Optional[str] = None):
    try:
        return {"success": True, "data": list_rules(trigger_type), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.get("/rules/meta")
async def get_meta():
    return {
        "success": True,
        "data": {
            "trigger_types": TRIGGER_TYPES,
            "condition_operators": CONDITION_OPERATORS,
            "action_types": ACTION_TYPES,
        },
        "error": None,
    }


@router.get("/rules/{rule_id}")
async def get_one_rule(rule_id: str):
    rule = get_rule(rule_id)
    if not rule:
        return {"success": False, "data": None, "error": "Rule not found"}
    return {"success": True, "data": rule, "error": None}


@router.post("/rules")
async def save_rule(body: RuleCreate):
    if not body.name.strip():
        return {"success": False, "data": None, "error": "name is required"}
    if body.trigger_type not in TRIGGER_TYPES:
        return {"success": False, "data": None, "error": f"Invalid trigger_type. Options: {TRIGGER_TYPES}"}
    try:
        rule = create_rule(
            body.name, body.trigger_type, body.logic_operator,
            body.conditions, body.actions, body.description, body.created_by,
        )
        return {"success": True, "data": rule, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.put("/rules/{rule_id}")
async def edit_rule(rule_id: str, body: RuleUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"success": False, "data": None, "error": "No fields to update"}
    updated = update_rule(rule_id, updates)
    if not updated:
        return {"success": False, "data": None, "error": "Rule not found"}
    return {"success": True, "data": updated, "error": None}


@router.patch("/rules/{rule_id}/toggle")
async def toggle(rule_id: str):
    updated = toggle_rule(rule_id)
    if not updated:
        return {"success": False, "data": None, "error": "Rule not found"}
    return {"success": True, "data": updated, "error": None}


@router.delete("/rules/{rule_id}")
async def remove_rule(rule_id: str):
    deleted = delete_rule(rule_id)
    if not deleted:
        return {"success": False, "data": None, "error": "Rule not found"}
    return {"success": True, "data": {"deleted": rule_id}, "error": None}


@router.post("/rules/generate")
async def generate_rule(body: GenerateRuleRequest, request: Request):
    try:
        sample_data = None
        if body.file_id:
            record = get_accessible_file_record(body.file_id, request.state.user)
            if record and record.get("pages"):
                sample_data = collect_field_data(record["pages"])
        result = run_metered(request.state.user["id"], CLAUDE_COSTS["rule"], "Rule generation", ai_generate_rule, body.description, body.trigger_type, sample_data)
        return {"success": True, "data": result, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


@router.post("/rules/test")
async def test_rule(body: TestRuleRequest, request: Request):
    try:
        record = get_accessible_file_record(body.file_id, request.state.user)
        if not record:
            return {"success": False, "data": None, "error": "File not found"}
        pages = record.get("pages", [])
        data = collect_field_data(pages)
        rule = {
            "conditions": body.conditions,
            "logic_operator": body.logic_operator,
            "actions": body.actions,
        }
        triggered = evaluate_rule(rule, data)
        condition_results = []
        from services.rule_engine import _evaluate_condition
        for cond in body.conditions:
            condition_results.append({
                "condition": cond,
                "passed": _evaluate_condition(cond, data),
                "field_value": data.get(cond.get("field")),
            })
        return {
            "success": True,
            "data": {
                "triggered": triggered,
                "condition_results": condition_results,
                "actions_that_would_run": body.actions if triggered else [],
                "sample_data": data,
            },
            "error": None,
        }
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}
