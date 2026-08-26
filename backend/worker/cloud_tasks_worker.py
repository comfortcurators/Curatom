# Durable task execution is intentionally not implemented yet.
# A production worker must:
# 1. Receive tasks from a Cloud Tasks queue.
# 2. Execute each step with bounded retries and exponential backoff.
# 3. Update Firestore task status atomically.
# 4. Route terminal failures to a dead-letter path.
# 5. Emit completion/failure notifications and auditable evidence.


async def process_task(task_id: str):
    raise NotImplementedError("Cloud Tasks worker implementation required")
