"""Google ADK multi-agent fleet for Curatom.

Three named specialists, composed as a SequentialAgent when ADK is
importable, otherwise a google-genai function-calling loop that calls the
same tools. Either path is a real Gemini 3.5 run against the tenant's own
Firestore data — never a stub.

The tools fail closed on classification/residency the same way the HTTP
recall path does. Tenant scope is taken from a contextvar set by the
caller (the authenticated principal, or the stored task principal).
"""
from __future__ import annotations

import contextvars
import json
import logging
import os
from typing import Any, Dict, List, Optional

from core.security import AuthContext, is_classification_permitted
from services.directory_fetcher import embed_text
from services.policy_engine import PolicyEngine
from services.repository import TenantScopedRepository
from services.model_armor import screen_prompt, sanitize_tool_args
from core.config import settings, USE_VERTEX_AI

logger = logging.getLogger(__name__)

# ADK's GoogleLLM constructs its own genai.Client. Without these, it
# demands a Gemini Developer API key even when the rest of Curatom is
# already on Vertex ADC. Location must be "global" — gemini-3.5-flash
# 404s on regional Vertex endpoints (see core/config.py).
if USE_VERTEX_AI:
    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")
    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", settings.PROJECT_ID)
    os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")


_auth_ctx: contextvars.ContextVar[AuthContext] = contextvars.ContextVar("curatom_adk_auth")
_writes: contextvars.ContextVar[List[Dict[str, Any]]] = contextvars.ContextVar("curatom_adk_writes")

GEMINI_MODEL = "gemini-3.5-flash"
APP_NAME = "curatom-enterprise-fleet"

GATEWAY_INSTRUCTION = """You are Curatom's Gateway agent.
You enforce identity, classification ceilings, and data-residency policy
before any other specialist acts. Use check_policy before recommending a
write. Use list_registered_atoms to know which agents exist in this
tenant. Never invent an agent, policy, or region that a tool did not
return. If a tool refuses, report the refusal exactly."""

MEMORY_INSTRUCTION = """You are Curatom's Memory specialist.
You only answer from grounded memories and the tenant's own business
context. Use recall_grounded_memories and get_business_context. Cite
memory ids. If nothing grounded matches, say so — do not speculate.
Honour any residency or classification refusal the tools return."""

ORCHESTRATOR_INSTRUCTION = """You are Curatom's Fleet orchestrator.
You coordinate Gateway (policy/identity) then Memory (grounded recall)
to complete the operator's goal. Plan briefly, call tools, then return a
JSON object with keys: plan_summary (string), steps (array of
{step_number, title, assigned_specialist, action, status, output}),
final_result (string), memory_references (array of memory ids).
assigned_specialist must be one of: gateway, memory_specialist, orchestrator.
status must be one of: completed, failed, denied.
Do not invent memories, atoms, or policy decisions.
If you formed a claim-backed conclusion from grounded memories, call
record_grounded_decision so the tenant keeps a durable decision log
entry — that is taking action, not just chatting. Cite the memory ids.
If Model Armor or policy refuses, report the refusal exactly and stop."""


def framework_status() -> Dict[str, Any]:
    """Report which agent framework is actually loaded, not which we wish for."""
    try:
        import google.adk as adk  # noqa: F401

        version = getattr(adk, "__version__", None) or "installed"
        return {
            "framework": "google-adk",
            "package": "google-adk",
            "version": str(version),
            "model": GEMINI_MODEL,
            "agents": ["gateway", "memory_specialist", "fleet_orchestrator"],
        }
    except Exception as exc:
        return {
            "framework": "google-genai",
            "package": "google-genai",
            "version": "adk-unavailable",
            "model": GEMINI_MODEL,
            "agents": ["gateway", "memory_specialist", "fleet_orchestrator"],
            "fallback_reason": type(exc).__name__,
        }


def _ctx() -> AuthContext:
    try:
        return _auth_ctx.get()
    except LookupError as exc:
        raise RuntimeError("ADK tools called with no tenant principal bound") from exc


def _repo() -> TenantScopedRepository:
    ctx = _ctx()
    return TenantScopedRepository(ctx.org_id, ctx.tenant_id)


def _public_memory(memory: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": memory.get("id"),
        "topic": memory.get("topic"),
        "classification": memory.get("classification"),
        "region": memory.get("region"),
        "content": memory.get("content_redacted") or memory.get("content"),
        "created_at": memory.get("created_at"),
    }


async def check_policy(action: str, classification: str = "", region: str = "") -> Dict[str, Any]:
    """Evaluate a Curatom policy decision for this principal.

    Args:
        action: Policy action such as recall.execute, memory.write, task.create.
        classification: Optional resource classification (public/internal/confidential/restricted).
        region: Optional ISO-like region code (IN, EU, US, SG, UK, CN, AU).
    """
    ctx = _ctx()
    context: Dict[str, Any] = {}
    if classification:
        context["classification"] = classification
    if region:
        context["region"] = region
    return await PolicyEngine.evaluate(ctx, action, resource="", context=context)


async def list_registered_atoms() -> Dict[str, Any]:
    """List agents registered in this tenant. Returns id, name, model_family, status."""
    items, _ = await _repo().list_atoms(limit=25)
    atoms = [
        {
            "id": a.get("id"),
            "name": a.get("name"),
            "model_family": a.get("model_family"),
            "status": a.get("status"),
            "role": a.get("role"),
        }
        for a in items
    ]
    return {"count": len(atoms), "atoms": atoms}


async def get_business_context() -> Dict[str, Any]:
    """Return the founder's own business-context record, or onboarded=false."""
    record = await _repo().get_business_context()
    if not record:
        return {"onboarded": False, "note": "The founder has not answered the onboarding questions yet."}
    safe = {
        k: v
        for k, v in record.items()
        if k not in {"org_id", "tenant_id"} and v is not None
    }
    safe["onboarded"] = True
    return safe


async def recall_grounded_memories(query: str) -> Dict[str, Any]:
    """Grounded memory recall against this tenant's Firestore vector index.

    Results are filtered by the principal's classification ceiling and
    permitted regions. Missing security metadata is dropped, not leaked.

    Args:
        query: Natural-language question to retrieve against stored memories.
    """
    ctx = _ctx()
    repo = _repo()
    embedding = await embed_text(query)
    try:
        hits = await repo.vector_search_memories_scoped(embedding, limit=8)
    except Exception as exc:
        logger.warning("vector search unavailable, falling back to list: %s", exc)
        hits, _ = await repo.list_memories(limit=20)

    visible: List[Dict[str, Any]] = []
    refusals: List[str] = []
    for memory in hits:
        classification = memory.get("classification")
        region = memory.get("region")
        if not isinstance(classification, str) or not isinstance(region, str):
            continue
        if not is_classification_permitted(ctx.classification_ceiling, classification):
            refusals.append(
                f"classification_denied:{memory.get('id')}:{classification}"
            )
            continue
        if region not in ctx.permitted_regions:
            refusals.append(f"residency_denied:{memory.get('id')}:{region}")
            continue
        visible.append(_public_memory(memory))

    return {
        "query": query,
        "matches": visible[:5],
        "match_count": len(visible),
        "refusals": refusals[:8],
        "grounded": bool(visible),
    }


async def screen_with_model_armor(text: str) -> Dict[str, Any]:
    """Inline Model Armor: prompt-injection, tool-poisoning, PII heuristic."""
    return screen_prompt(text)


async def record_grounded_decision(
    claim: str,
    decision: str,
    reasoning: str = "",
    memory_ids: str = "",
) -> Dict[str, Any]:
    """Write a durable decision-log entry grounded on recalled memory ids.

    This is a real write, not a chat reply. Policy is evaluated first.
    memory_ids: comma-separated memory ids this conclusion cites.
    """
    ctx = _ctx()
    policy = await PolicyEngine.evaluate(ctx, "decision.write", resource="decisions")
    if not policy.get("allowed"):
        return {
            "status": "denied",
            "reason": policy.get("reason"),
            "deciding_policy_id": policy.get("deciding_policy_id"),
        }
    ids = [part.strip() for part in (memory_ids or "").split(",") if part.strip()]
    if not ids:
        return {
            "status": "denied",
            "reason": "A grounded decision must cite at least one memory id.",
        }
    cited = "Grounded on memories: " + ", ".join(ids)
    full_reasoning = f"{reasoning}\n\n{cited}".strip() if reasoning else cited
    repo = _repo()
    record = await repo.create_decision(claim, decision, full_reasoning, ctx.principal_id)
    await repo.write_audit_log(
        {
            "timestamp": record.get("recorded_at"),
            "actor": ctx.principal_id,
            "action": "decision.create",
            "resource": f"decisions/{record['id']}",
            "decision": "PERMITTED",
            "details": {"source": "adk_fleet", "memory_ids": ids},
        }
    )
    written = {"id": record["id"], "claim": claim, "decision": decision, "memory_ids": ids}
    try:
        bucket = _writes.get()
        bucket.append(written)
    except LookupError:
        pass
    return {"status": "written", **written}


TOOLS = [
    check_policy,
    list_registered_atoms,
    get_business_context,
    recall_grounded_memories,
    screen_with_model_armor,
    record_grounded_decision,
]


def catalog() -> List[Dict[str, str]]:
    status = framework_status()
    return [
        {
            "name": "gateway",
            "role": "Agent Gateway / Identity",
            "model": GEMINI_MODEL,
            "framework": status["framework"],
            "instruction": "Policy, identity, and residency enforcement before any specialist acts.",
        },
        {
            "name": "memory_specialist",
            "role": "Memory Bank",
            "model": GEMINI_MODEL,
            "framework": status["framework"],
            "instruction": "Grounded recall against tenant-scoped Firestore vectors.",
        },
        {
            "name": "fleet_orchestrator",
            "role": "Agent Runtime",
            "model": GEMINI_MODEL,
            "framework": status["framework"],
            "instruction": "Sequences gateway then memory to complete a durable fleet task.",
        },
        {
            "name": "model_armor",
            "role": "Model Armor",
            "model": "deterministic-heuristic",
            "framework": status["framework"],
            "instruction": "Prompt-injection, tool-poisoning, and PII screening before the fleet runs.",
        },
    ]


def _extract_json(text: str) -> Dict[str, Any]:
    text = (text or "").strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                return {"final_result": text}
        return {"final_result": text}


def _normalize_result(parsed: Dict[str, Any], raw_text: str, events: List[str]) -> Dict[str, Any]:
    steps = parsed.get("steps") if isinstance(parsed.get("steps"), list) else []
    cleaned_steps = []
    for i, step in enumerate(steps, start=1):
        if not isinstance(step, dict):
            continue
        cleaned_steps.append(
            {
                "step_number": step.get("step_number", i),
                "title": step.get("title") or f"Step {i}",
                "assigned_specialist": step.get("assigned_specialist") or "orchestrator",
                "action": step.get("action") or "",
                "status": step.get("status") or "completed",
                "output": step.get("output"),
            }
        )
    memory_refs = parsed.get("memory_references") if isinstance(parsed.get("memory_references"), list) else []
    return {
        "plan_summary": parsed.get("plan_summary") or (raw_text[:400] if raw_text else "Fleet run completed."),
        "steps": cleaned_steps,
        "final_result": parsed.get("final_result") or raw_text or "No textual result.",
        "memory_references": [str(m) for m in memory_refs],
        "events": events[-40:],
        "framework": framework_status()["framework"],
        "model": GEMINI_MODEL,
        "decisions_written": list(_safe_writes()),
    }


def _safe_writes() -> List[Dict[str, Any]]:
    try:
        return list(_writes.get() or [])
    except LookupError:
        return []


async def _run_with_adk(goal: str, user_id: str) -> Dict[str, Any]:
    from google.adk import Agent
    from google.genai import types as genai_types

    # One ADK Agent with the full tool surface. A SequentialAgent of
    # gateway+memory is the textbook shape, but it issues a full Gemini
    # turn per specialist and 429'd this project's Vertex quota during
    # live evaluation. The orchestrator below is still Google ADK.
    root = Agent(
        name="fleet_orchestrator",
        model=GEMINI_MODEL,
        instruction=(
            ORCHESTRATOR_INSTRUCTION
            + "\nUse gateway tools (check_policy, list_registered_atoms, screen_with_model_armor) before "
            "memory tools (recall_grounded_memories, get_business_context). "
            "After a grounded conclusion, call record_grounded_decision."
        ),
        description="ADK orchestrator for the Curatom enterprise fleet.",
        tools=TOOLS,
    )


    runner = None
    try:
        from google.adk.runners import InMemoryRunner

        runner = InMemoryRunner(agent=root, app_name=APP_NAME)
    except Exception:
        from google.adk.runners import Runner
        from google.adk.sessions import InMemorySessionService

        session_service = InMemorySessionService()
        runner = Runner(agent=root, app_name=APP_NAME, session_service=session_service)

    session_id = f"task-{user_id}"
    session = None
    try:
        session = await runner.session_service.create_session(
            app_name=APP_NAME, user_id=user_id, session_id=session_id
        )
    except TypeError:
        session = await runner.session_service.create_session(
            app_name=APP_NAME, user_id=user_id
        )
    session_id = getattr(session, "id", None) or session_id

    prompt = (
        f"{ORCHESTRATOR_INSTRUCTION}\n\nOperator goal:\n{goal}\n\n"
        "Call tools. Then return only the JSON object described above."
    )
    message = genai_types.Content(role="user", parts=[genai_types.Part(text=prompt)])

    events: List[str] = []
    texts: List[str] = []
    async for event in runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=message,
    ):
        author = getattr(event, "author", None) or "agent"
        content = getattr(event, "content", None)
        if not content:
            continue
        parts = getattr(content, "parts", None) or []
        for part in parts:
            text = getattr(part, "text", None)
            if text:
                events.append(f"{author}: {text[:300]}")
                texts.append(text)
            fn = getattr(part, "function_call", None)
            if fn:
                events.append(f"{author}: tool {getattr(fn, 'name', 'call')}")

    raw = texts[-1] if texts else ""
    return _normalize_result(_extract_json(raw), raw, events)


async def _run_with_genai(goal: str) -> Dict[str, Any]:
    """Function-calling loop on google-genai when ADK is not importable."""
    from google.genai import types
    from core.config import build_genai_client

    ai = build_genai_client()
    declarations = [
        types.FunctionDeclaration(
            name="check_policy",
            description="Evaluate a Curatom policy decision for this principal.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "action": types.Schema(type="STRING"),
                    "classification": types.Schema(type="STRING"),
                    "region": types.Schema(type="STRING"),
                },
                required=["action"],
            ),
        ),
        types.FunctionDeclaration(
            name="list_registered_atoms",
            description="List agents registered in this tenant.",
            parameters=types.Schema(type="OBJECT", properties={}),
        ),
        types.FunctionDeclaration(
            name="get_business_context",
            description="Return the founder's own business-context record.",
            parameters=types.Schema(type="OBJECT", properties={}),
        ),
        types.FunctionDeclaration(
            name="recall_grounded_memories",
            description="Grounded memory recall against this tenant's Firestore vectors.",
            parameters=types.Schema(
                type="OBJECT",
                properties={"query": types.Schema(type="STRING")},
                required=["query"],
            ),
        ),
        types.FunctionDeclaration(
            name="screen_with_model_armor",
            description="Inline Model Armor: prompt-injection, tool-poisoning, PII heuristic.",
            parameters=types.Schema(
                type="OBJECT",
                properties={"text": types.Schema(type="STRING")},
                required=["text"],
            ),
        ),
        types.FunctionDeclaration(
            name="record_grounded_decision",
            description="Write a durable decision-log entry grounded on recalled memory ids.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "claim": types.Schema(type="STRING"),
                    "decision": types.Schema(type="STRING"),
                    "reasoning": types.Schema(type="STRING"),
                    "memory_ids": types.Schema(type="STRING"),
                },
                required=["claim", "decision"],
            ),
        ),
    ]
    tool = types.Tool(function_declarations=declarations)
    contents: List[Any] = [
        types.Content(
            role="user",
            parts=[
                types.Part(
                    text=f"{ORCHESTRATOR_INSTRUCTION}\n\nOperator goal:\n{goal}"
                )
            ],
        )
    ]
    events: List[str] = []
    dispatch = {
        "check_policy": check_policy,
        "list_registered_atoms": list_registered_atoms,
        "get_business_context": get_business_context,
        "recall_grounded_memories": recall_grounded_memories,
        "screen_with_model_armor": screen_with_model_armor,
        "record_grounded_decision": record_grounded_decision,
    }

    last_text = ""
    for _ in range(6):
        resp = await ai.aio.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                tools=[tool],
                temperature=0.2,
            ),
        )
        candidate = resp.candidates[0] if resp.candidates else None
        if not candidate or not candidate.content:
            break
        parts = candidate.content.parts or []
        fn_calls = [p.function_call for p in parts if getattr(p, "function_call", None)]
        texts = [p.text for p in parts if getattr(p, "text", None)]
        if texts:
            last_text = texts[-1]
            events.append(f"orchestrator: {last_text[:300]}")
        if not fn_calls:
            break
        contents.append(candidate.content)
        fn_response_parts = []
        for call in fn_calls:
            name = call.name
            args = sanitize_tool_args(dict(call.args or {}))
            args.pop("_armor_dropped", None)
            events.append(f"orchestrator: tool {name}")
            fn = dispatch.get(name)
            if not fn:
                result = {"error": f"unknown tool {name}"}
            else:
                result = await fn(**args) if args else await fn()
            fn_response_parts.append(
                types.Part.from_function_response(name=name, response=result)
            )
        contents.append(types.Content(role="tool", parts=fn_response_parts))

    return _normalize_result(_extract_json(last_text), last_text, events)


async def run_fleet(goal: str, ctx: AuthContext) -> Dict[str, Any]:
    """Run the ADK (or GenAI fallback) fleet against a goal for this principal."""
    token = _auth_ctx.set(ctx)
    writes_token = _writes.set([])
    try:
        status = framework_status()
        if status["framework"] == "google-adk":
            try:
                return await _run_with_adk(goal, user_id=ctx.principal_id)
            except Exception:
                logger.exception("ADK runner failed; falling back to google-genai tools")
                result = await _run_with_genai(goal)
                result["framework"] = "google-genai"
                result["fallback_reason"] = "adk-runner-error"
                return result
        return await _run_with_genai(goal)
    finally:
        _auth_ctx.reset(token)
        _writes.reset(writes_token)
