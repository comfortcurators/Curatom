"""Durable fleet-task runtime.

A task is a Firestore document first. Cloud Tasks (when configured) calls
back into /tasks/execute as a real HTTP request so Cloud Run keeps CPU
allocated for the ADK run. If Cloud Tasks is not configured, the creating
request executes the fleet inline — still durable, still audited, just
not asynchronously dispatched.
"""
from __future__ import annotations

import datetime
import logging
import uuid
from typing import Any, Dict, Optional, Tuple

from core.security import AuthContext
from services.repository import TenantScopedRepository

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def principal_snapshot(ctx: AuthContext) -> Dict[str, Any]:
    return {
        "principal_id": ctx.principal_id,
        "principal_type": ctx.principal_type,
        "role": ctx.role,
        "permitted_regions": list(ctx.permitted_regions or []),
        "classification_ceiling": ctx.classification_ceiling,
        "org_id": ctx.org_id,
        "tenant_id": ctx.tenant_id,
    }


def auth_from_task(record: Dict[str, Any]) -> AuthContext:
    snap = record.get("principal") or {}
    return AuthContext(
        principal_id=snap.get("principal_id") or record.get("principal_id") or "unknown",
        principal_type=snap.get("principal_type") or "human",
        org_id=record["org_id"],
        tenant_id=record["tenant_id"],
        role=snap.get("role") or "Owner",
        permitted_regions=snap.get("permitted_regions") or ["IN", "EU", "US", "SG"],
        classification_ceiling=snap.get("classification_ceiling") or "restricted",
    )


def public_task(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "task_id": record.get("task_id"),
        "org_id": record.get("org_id"),
        "tenant_id": record.get("tenant_id"),
        "principal_id": record.get("principal_id"),
        "goal": record.get("goal"),
        "status": record.get("status"),
        "plan_summary": record.get("plan_summary") or "",
        "steps": record.get("steps") or [],
        "current_step_index": record.get("current_step_index") or 0,
        "memory_references": record.get("memory_references") or [],
        "created_at": record.get("created_at"),
        "updated_at": record.get("updated_at"),
        "completed_at": record.get("completed_at"),
        "error": record.get("error"),
        "final_result": record.get("final_result"),
        "cost_tokens": record.get("cost_tokens") or 0,
        "subject_ids": record.get("subject_ids") or [],
        "execution_mode": record.get("execution_mode"),
        "framework": record.get("framework"),
        "model": record.get("model"),
        "attempt": record.get("attempt") or 0,
    }


async def create_task(ctx: AuthContext, goal: str) -> Dict[str, Any]:
    goal = (goal or "").strip()
    if not goal:
        raise ValueError("goal is required")
    if len(goal) > 4000:
        raise ValueError("goal exceeds 4000 characters")

    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    task_id = f"task_{uuid.uuid4().hex}"
    now = _now()
    record = {
        "task_id": task_id,
        "goal": goal,
        "status": "queued",
        "plan_summary": "",
        "steps": [],
        "current_step_index": 0,
        "memory_references": [],
        "created_at": now,
        "updated_at": now,
        "cost_tokens": 0,
        "subject_ids": [],
        "principal": principal_snapshot(ctx),
        "principal_id": ctx.principal_id,
        "attempt": 0,
    }
    await repo.create_task_record(record)
    await repo.write_audit_log(
        {
            "timestamp": now,
            "actor": ctx.principal_id,
            "action": "task.create",
            "resource": f"tasks/{task_id}",
            "decision": "PERMITTED",
        }
    )
    return record


async def dispatch_task(record: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    """Enqueue on Cloud Tasks when configured; otherwise signal inline."""
    from core.config import settings
    from services.task_queue import enqueue_fleet_task

    if settings.SERVICE_BASE_URL and settings.INGESTION_TASK_SECRET:
        try:
            await enqueue_fleet_task(record["task_id"])
            repo = TenantScopedRepository(record["org_id"], record["tenant_id"])
            await repo.update_task_record(
                record["task_id"],
                {
                    "execution_mode": "cloud_tasks",
                    "status": "queued",
                    "updated_at": _now(),
                },
            )
            record["execution_mode"] = "cloud_tasks"
            return record, "cloud_tasks"
        except Exception:
            logger.exception("Cloud Tasks enqueue failed; running inline")

    record["execution_mode"] = "inline"
    return record, "inline"


async def execute_task(
    org_id: str,
    tenant_id: str,
    task_id: str,
    attempt: int = 0,
) -> Dict[str, Any]:
    from agents.adk_fleet import run_fleet

    repo = TenantScopedRepository(org_id, tenant_id)
    record = await repo.get_task_record(task_id)
    if not record:
        raise KeyError(task_id)
    if record.get("status") in {"completed"}:
        return record

    now = _now()
    await repo.update_task_record(
        task_id,
        {
            "status": "executing",
            "updated_at": now,
            "attempt": attempt,
        },
    )

    ctx = auth_from_task(record)
    try:
        result = await run_fleet(record["goal"], ctx)
        completed = _now()
        updates = {
            "status": "completed",
            "plan_summary": result.get("plan_summary") or "",
            "steps": result.get("steps") or [],
            "current_step_index": max(len(result.get("steps") or []) - 1, 0),
            "memory_references": result.get("memory_references") or [],
            "final_result": result.get("final_result") or "",
            "framework": result.get("framework"),
            "model": result.get("model"),
            "events": result.get("events") or [],
            "updated_at": completed,
            "completed_at": completed,
            "error": None,
            "attempt": attempt,
        }
        await repo.update_task_record(task_id, updates)
        await repo.write_audit_log(
            {
                "timestamp": completed,
                "actor": ctx.principal_id,
                "action": "task.complete",
                "resource": f"tasks/{task_id}",
                "decision": "PERMITTED",
                "details": {
                    "framework": result.get("framework"),
                    "steps": len(result.get("steps") or []),
                },
            }
        )
        record.update(updates)
        return record
    except Exception as exc:
        failed = _now()
        updates = {
            "status": "failed",
            "error": str(exc)[:1000],
            "updated_at": failed,
            "completed_at": failed,
            "attempt": attempt,
        }
        await repo.update_task_record(task_id, updates)
        await repo.write_audit_log(
            {
                "timestamp": failed,
                "actor": ctx.principal_id,
                "action": "task.fail",
                "resource": f"tasks/{task_id}",
                "decision": "PERMITTED",
                "details": {"error": str(exc)[:300]},
            }
        )
        record.update(updates)
        raise
