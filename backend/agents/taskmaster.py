import json
from typing import Dict, Any
from google import genai
from core.config import settings, build_genai_client
from core.security import AuthContext
from services.repository import TenantScopedRepository, GlobalRepository
from services.directory_fetcher import embed_text

ai = build_genai_client()


class TaskmasterOrchestrator:
    def __init__(self, ctx: AuthContext):
        self.ctx = ctx
        self.repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
        self.global_repo = GlobalRepository()

    async def plan_and_decompose(self, goal: str) -> Dict[str, Any]:
        """Planning helper only; /tasks remains disabled until a durable worker exists."""
        prompt = f"""Decompose the following enterprise goal into actionable steps:

Goal: {goal}

Return JSON with plan_summary and steps, each with step_number, title, assigned_specialist, action, input_params.
"""
        resp = await ai.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=genai.types.GenerateContentConfig(response_mime_type="application/json"),
        )
        try:
            return json.loads(resp.text)
        except Exception as exc:
            raise RuntimeError("Task planning returned invalid JSON") from exc

    async def execute_task_step(self, step: Dict[str, Any], accumulated_context: list) -> Dict[str, Any]:
        raise NotImplementedError("Task execution requires Cloud Tasks/Pub/Sub worker")
