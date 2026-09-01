"""Cloud Tasks worker entry.

The HTTP surface is POST /tasks/execute in main.py. This module remains as
the documented contract: retries, atomic Firestore status, dead-letter after
max attempts, and auditable completion live in services/task_runtime.py.
"""
from services.task_runtime import execute_task


async def process_task(org_id: str, tenant_id: str, task_id: str, attempt: int = 1):
    return await execute_task(org_id, tenant_id, task_id, attempt=attempt)
