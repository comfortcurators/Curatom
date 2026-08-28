import base64
import json
from typing import Optional

import httpx
import google.auth
import google.auth.transport.requests

from core.config import settings

# Directory ingestion used to be asyncio.create_task() inside the request
# handler for /directory/ingest - fire-and-forget, returning before the
# work was anywhere near done. Cloud Run only allocates full CPU while a
# request is actually in flight on that instance (cpuIdle throttles it
# otherwise); a background task with no request behind it just stalls,
# live-verified: a real sync crawled forward roughly once per incoming
# request instead of running to completion. Cloud Tasks fixes this without
# changing the Cloud Run billing tier - it calls back into this same
# service as a genuine HTTP request, so /directory/ingest/execute gets the
# same full-CPU treatment any other endpoint gets for its own duration.
_credentials = None


def _get_access_token() -> str:
    global _credentials
    if _credentials is None:
        _credentials, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
    if not _credentials.valid:
        _credentials.refresh(google.auth.transport.requests.Request())
    return _credentials.token


async def enqueue_ingestion_task() -> None:
    if not settings.SERVICE_BASE_URL:
        raise RuntimeError(
            "SERVICE_BASE_URL is not set - cannot hand Cloud Tasks a callback target"
        )
    if not settings.INGESTION_TASK_SECRET:
        raise RuntimeError(
            "INGESTION_TASK_SECRET is not set - the callback route would accept unauthenticated calls"
        )

    queue_path = (
        f"projects/{settings.PROJECT_ID}/locations/{settings.LOCATION}"
        f"/queues/{settings.INGESTION_TASKS_QUEUE}"
    )
    target_url = f"{settings.SERVICE_BASE_URL.rstrip('/')}/directory/ingest/execute"

    task = {
        "task": {
            "httpRequest": {
                "httpMethod": "POST",
                "url": target_url,
                "headers": {
                    "X-Ingestion-Task-Secret": settings.INGESTION_TASK_SECRET,
                    "Content-Type": "application/json",
                },
                "body": base64.b64encode(b"{}").decode("utf-8"),
            }
        }
    }

    access_token = _get_access_token()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"https://cloudtasks.googleapis.com/v2/{queue_path}/tasks",
            headers={"Authorization": f"Bearer {access_token}"},
            json=task,
        )
        resp.raise_for_status()
