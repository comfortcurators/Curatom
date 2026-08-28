from contextlib import asynccontextmanager
import asyncio
import datetime
import hashlib
import json
import logging
import os
import time
import uuid

import bcrypt
import yaml
from fastapi import FastAPI, HTTPException, Depends, Request, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from google import genai
from google.cloud.firestore_v1.vector import Vector
from core.config import settings, build_genai_client
from core.security import (
    hash_key,
    resolve_auth,
    AuthContext,
    create_session_token,
    verify_human_login,
    detect_and_redact_pii,
    is_classification_permitted,
    VALID_ROLES,
    issue_recovery_code,
    redeem_recovery_code,
    issue_email_verification_code,
    verify_email_code,
)
from services.mail_service import send_verification_email
from core.rate_limiter import rate_limiter
from services.repository import TenantScopedRepository, GlobalRepository
from services.policy_engine import PolicyEngine, authorize
from services.directory_fetcher import run_ingestion, embed_text, is_ingestion_stale
from services.task_queue import enqueue_ingestion_task
from core.embedding_config import EMBEDDING_MODEL, EMBEDDING_DIM
from services.chat_handler import handle_chat
from services.vision_context import extract_business_context_from_image
from services.corpus_export import export_training_corpus_to_gcs
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from models.schemas import ChatRequest, IdentifyRequest, MemoryCreate

logger = logging.getLogger(__name__)


def _memory_is_visible_to(ctx: AuthContext, memory: Dict[str, Any]) -> bool:
    classification = memory.get("classification")
    region = memory.get("region")
    return (
        isinstance(classification, str)
        and isinstance(region, str)
        and is_classification_permitted(ctx.classification_ceiling, classification)
        and region in ctx.permitted_regions
    )

# Lifespan Bootstrap
@asynccontextmanager
async def lifespan(app: FastAPI):
    async def _bootstrap_ingestion() -> None:
        # Used to await run_ingestion() directly inside this fire-and-forget
        # startup task - the same problem as the old /directory/ingest
        # handler, and arguably worse here: a fresh container has no
        # guarantee anyone will hit it with traffic afterward to keep
        # nudging a throttled background task forward. Enqueuing is a
        # single quick network call, safe to actually run to completion
        # inside this short-lived task; the real ingestion work happens
        # later as its own genuine request via /directory/ingest/execute.
        try:
            state = await GlobalRepository().get_ingestion_state()
            if not state.get("completed") and not state.get("is_ingesting"):
                await enqueue_ingestion_task()
            elif is_ingestion_stale(state):
                logger.warning("Ingestion state was stuck at is_ingesting=True past the staleness threshold - retrying")
                await enqueue_ingestion_task()
        except Exception:
            logger.exception("Directory ingestion failed during startup")

    # Ingestion is intentionally non-blocking, but failures are contained and logged.
    app.state.ingestion_task = asyncio.create_task(_bootstrap_ingestion())
    yield

app = FastAPI(title="Curatom Enterprise Fleet Control Plane API", lifespan=lifespan)

@app.middleware("http")
async def add_request_id_and_logging(request: Request, call_next):
    req_id = request.headers.get("X-Request-Id", f"req_{uuid.uuid4().hex}")
    request.state.request_id = req_id
    start_time = time.perf_counter()
    
    response = await call_next(request)
    elapsed_ms = int((time.perf_counter() - start_time) * 1000)
    
    response.headers["X-Request-Id"] = req_id
    response.headers["X-Response-Time-Ms"] = str(elapsed_ms)
    return response

# A production URL takes precedence over the local-development default. Localhost
# origins are admitted only when no production URL is configured.
_local_frontend_origins = {"http://localhost:5173", "http://localhost:3000"}
_production_frontend_url = os.getenv("FRONTEND_URL_PRODUCTION", "").strip()
_active_frontend_url = _production_frontend_url or settings.FRONTEND_URL.strip()
_cors_origins = {_active_frontend_url} if _active_frontend_url else set()
if not _production_frontend_url and _active_frontend_url in _local_frontend_origins:
    _cors_origins.update(_local_frontend_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(_cors_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Atom-Key", "X-Request-Id"],
)

ai = build_genai_client()

# --- Ops & Telemetry ---
@app.get("/healthz")
async def healthz():
    return {"status": "ok", "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}


@app.get("/", include_in_schema=False)
async def root(request: Request):
    """
    Content-negotiated root. A browser gets the SPA shell (unchanged);
    a client that asks for JSON — any agent, crawler, or curl — gets a
    machine-readable discovery manifest instead of having to parse
    rendered HTML to find the API. Real endpoints only: nothing here is
    advertised unless it actually exists and answers.
    """
    accept = request.headers.get("accept", "")
    wants_json = "application/json" in accept and "text/html" not in accept
    if wants_json:
        return JSONResponse({
            "name": APP_NAME_CONST,
            "version": "rv0.2.0",
            "operator": "Comfort Curators Private Limited",
            "description": (
                "The canonical record of what this business is and what any "
                "LLM or agent should know before acting on its behalf — a "
                "tenant-scoped agent registry with policy-aware, "
                "residency-enforced, grounded memory recall sits on top of it."
            ),
            "business_context": "/context",
            "human_reception": "/reception",
            "agent_handshake": "/v1/reception/agents/handshake",
            "human_login": "/auth/login",
            "human_register": "/auth/register",
            "capabilities": "/v1/capabilities",
            "openapi": "/openapi.json",
            "docs": "/docs",
            "llms_txt": "/llms.txt",
            "health": "/readyz",
            "auth_note": (
                "Handshake and capabilities are public. Every other route "
                "requires a session token (human login) or an atom API key "
                "(agent), obtained after handshake — see /docs."
            )
        })
    static_index = os.path.join(os.path.dirname(__file__), "static", "index.html")
    if os.path.isfile(static_index):
        return FileResponse(static_index)
    raise HTTPException(404, "Frontend not built into this image")


APP_NAME_CONST = "Curatom Enterprise"


@app.get("/v1/capabilities")
async def public_capabilities():
    # Public, unauthenticated: what an agent can do before it has any
    # credential. Mutating/tenant-scoped operations are deliberately
    # absent — those require a session or an atom key, see /docs.
    return {
        "protocols": ["http"],
        "endpoints": {
            "business_context": {
                "method": "GET",
                "path": "/context",
                "auth": "session token or atom API key",
                "purpose": "The founder's own answer to what this business is, who it serves, its current stack, and its priorities — read this before acting on the tenant's behalf. Returns {\"onboarded\": false} honestly if nobody has answered these questions yet; never a fabricated placeholder."
            },
            "agent_handshake": {
                "method": "POST",
                "path": "/v1/reception/agents/handshake",
                "auth": "none",
                "purpose": "Derive a suggested operational profile from a model-family hint or sample output, grounded against stored documentation excerpts."
            },
            "human_login": {
                "method": "POST",
                "path": "/auth/login",
                "auth": "none (issues a session token)"
            },
            "human_register": {
                "method": "POST",
                "path": "/auth/register",
                "auth": "none",
                "purpose": "Any business signs up here and gets its own isolated tenant — a fresh org_id/tenant_id, a real tenant record, and an Owner account. Not the demo account: a real, standalone business."
            },
            "atom_register": {
                "method": "POST",
                "path": "/atoms/register",
                "auth": "session token (human operator)",
                "purpose": "Creates a durable atom identity and issues its API key. Not reachable from handshake alone — a human operator must authorize registration."
            }
        },
        "note": "Tasks (/tasks) intentionally return HTTP 501 — not implemented, not a broken endpoint."
    }


@app.post("/v1/reception/agents/handshake")
async def agent_handshake(req: IdentifyRequest, request: Request):
    """
    Public agent entry point — no prior credential required. Derives a
    suggested profile the same way the authenticated /atoms/identify
    does, but reachable cold, matching the discovery manifest's claim.
    This does not create an atom or issue a key: registration still
    requires a human operator via /atoms/register, deliberately, so a
    profile suggestion can never mint durable access on its own.
    """
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    client_ip = forwarded_for.split(",", 1)[0].strip() or (request.client.host if request.client else "unknown")
    await rate_limiter.check_rate_limit("handshake", f"ip:{client_ip}", max_rpm=20)

    query_text = req.sample_response or req.model_family_hint or ""
    if not query_text:
        raise HTTPException(400, "Provide model_family_hint or sample_response")

    query_emb = await embed_text(query_text)
    global_repo = GlobalRepository()
    dir_results = await global_repo.search_excerpts(req.model_family_hint or "", query_emb, limit=3)

    sources = []
    context_text = ""
    for d in dir_results:
        if d.get('source_url'):
            sources.append({"uri": d['source_url'], "title": d.get('section_title', 'Documentation')})
        if d.get('text'):
            context_text += d['text'] + "\n"

    if not sources:
        return {
            "principal_type": "agent",
            "profile": None,
            "sources": [],
            "matched": False,
            "next": "/atoms/register (requires a human operator session)"
        }

    prompt = f"Derive the optimal agent operational profile based on this documentation:\n{context_text}"
    resp = await ai.aio.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=genai.types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {
                    "format": {"type": "STRING"},
                    "retention_window_hours": {"type": "INTEGER"},
                    "accuracy_tolerance": {"type": "STRING"},
                    "system_persona": {"type": "STRING"},
                    "max_output_tokens": {"type": "INTEGER"},
                    "classification_ceiling": {"type": "STRING"}
                }
            }
        )
    )
    profile = json.loads(resp.text)
    profile["permitted_regions"] = ["IN", "EU", "US", "SG"]
    profile["version"] = 1
    return {
        "principal_type": "agent",
        "profile": profile,
        "sources": sources,
        "matched": True,
        "next": "/atoms/register (requires a human operator session)"
    }


@app.get("/llms.txt", response_class=PlainTextResponse)
async def llms_txt():
    # The llms.txt convention (llmstxt.org): a plain-text entry point for
    # AI agents, pointing at the machine-readable surface rather than
    # asking a model to scrape rendered HTML.
    return """# Curatom Enterprise

> A tenant-scoped agent registry with policy-aware, residency-enforced,
> grounded memory recall. Built by Comfort Curators Private Limited on
> Google Cloud (Cloud Run, Firestore, Vertex AI / Gemini 2.5 Flash).

Every route that reads or writes tenant data requires an authorization
policy check; memory and recall results are filtered by classification
and region, failing closed on missing metadata. No claim in a response
is stated without being traceable to something actually stored.

## Start here

- Discovery manifest: GET / with `Accept: application/json`
- Business context (session token or atom API key required): GET /context
  The founder's own answer to what this business is, who it serves, its
  current stack, and its priorities. Read this before acting on the
  tenant's behalf — it's the whole point of this API. Returns
  `{"onboarded": false}` honestly if the founder hasn't answered these
  questions yet; never a fabricated placeholder.
- Agent handshake (no credential required): POST /v1/reception/agents/handshake
  Body: {"model_family_hint": "...", "sample_response": "..."}
  Returns a suggested operational profile grounded against stored
  documentation excerpts. Does not create an identity or issue a key —
  registration (/atoms/register) still requires a human operator
  session, deliberately, so a handshake alone can never mint durable
  access.
- Public capabilities list: GET /v1/capabilities
- OpenAPI schema: /openapi.json
- Interactive docs: /docs
- Health check: /readyz

## Source & documentation

- Repository: https://github.com/comfortcurators/Curatom
- Hardening status (what's proven vs. still a prototype): https://github.com/comfortcurators/Curatom/blob/main/HARDENING_STATUS.md
- Validation record: https://github.com/comfortcurators/Curatom/blob/main/VALIDATION.md
- Citable release: https://zenodo.org/records/22112980
- License: AGPL-3.0-only

## Policy notes for agents

- Public, no credential needed: /, /v1/reception/agents/handshake,
  /v1/capabilities, /healthz, /readyz, /llms.txt, /docs, /openapi.json, and the
  served frontend.
- Everything else requires a session token (human login via
  /auth/login) or an atom API key (issued only after a human operator
  registers the atom via /atoms/register).
- No pricing, cost, or billing figure appears anywhere in this API or
  its documentation because none has been set — do not infer or
  fabricate one from context.
- Personally identifiable information detection in this build is a
  regex heuristic, not a trained classifier; do not treat its absence
  of a flag as a guarantee of no PII.
"""

@app.get("/readyz")
async def readyz():
    try:
        global_repo = GlobalRepository()
        await global_repo.get_excerpts_count()
        return {"status": "ready", "database": "connected"}
    except Exception as e:
        raise HTTPException(503, detail=f"Database unreachable: {str(e)}")

@app.get("/metrics")
async def metrics(ctx: AuthContext = Depends(resolve_auth)):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    costs = await repo.get_tenant_costs()
    
    metrics_text = f"""# HELP curatom_model_calls_total Total Gemini model calls made
# TYPE curatom_model_calls_total counter
curatom_model_calls_total{{tenant="{ctx.tenant_id}"}} {costs.get("model_calls", 0)}

# HELP curatom_tokens_consumed_total Total tokens consumed across recalls
# TYPE curatom_tokens_consumed_total counter
curatom_tokens_consumed_total{{tenant="{ctx.tenant_id}"}} {costs.get("tokens_consumed", 0)}

# HELP curatom_embeddings_total Total embeddings generated
# TYPE curatom_embeddings_total counter
curatom_embeddings_total{{tenant="{ctx.tenant_id}"}} {costs.get("embeddings_generated", 0)}
"""
    return Response(content=metrics_text, media_type="text/plain")

# --- Authentication Login ---
class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/auth/login")
async def login(req: LoginRequest, request: Request):
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    client_ip = forwarded_for.split(",", 1)[0].strip()
    if not client_ip:
        client_ip = request.client.host if request.client else "unknown"
    await rate_limiter.check_rate_limit("auth", f"ip:{client_ip}", max_rpm=5)
    user = await verify_human_login(req.username, req.password)
    token = create_session_token(
        principal_id=user["principal_id"],
        role=user["role"],
        org_id=user["org_id"],
        tenant_id=user["tenant_id"]
    )
    return {
        "session_token": token,
        "principal_id": user["principal_id"],
        "role": user["role"],
        "tenant_id": user["tenant_id"],
        "org_id": user["org_id"]
    }

# --- Self-serve registration (any business gets its own isolated tenant) ---
class RegisterRequest(BaseModel):
    username: str
    founder_name: str
    business_name: str
    email: str
    phone: Optional[str] = None
    password: str

@app.post("/auth/register")
async def register(payload: RegisterRequest, request: Request):
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    client_ip = forwarded_for.split(",", 1)[0].strip()
    if not client_ip:
        client_ip = request.client.host if request.client else "unknown"
    await rate_limiter.check_rate_limit("auth", f"ip:{client_ip}", max_rpm=5)

    if len(payload.password) < 8:
        raise HTTPException(400, detail="Password must be at least 8 characters")
    if not payload.username or not payload.founder_name or not payload.business_name or not payload.email:
        raise HTTPException(400, detail="Your name, username, business name, and email are required")

    org_id = f"org_{uuid.uuid4().hex[:12]}"
    tenant_id = f"tenant_{uuid.uuid4().hex[:12]}"
    repo = TenantScopedRepository(org_id, tenant_id)

    await repo.create_tenant(name=payload.business_name, contact_email=payload.email, contact_phone=payload.phone)

    password_hash = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    try:
        user = await repo.create_user(payload.username, password_hash, "Owner", payload.founder_name)
    except ValueError as exc:
        # Tenant doc was already written; username collision is the only
        # realistic cause here since org/tenant ids are freshly generated.
        raise HTTPException(409, detail=str(exc)) from exc

    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": payload.username,
        "action": "tenant.register",
        "resource": f"tenants/{tenant_id}",
        "details": {"business_name": payload.business_name},
    })

    # Best-effort: registration succeeds regardless of whether the email
    # actually sends, but the response says plainly which happened rather
    # than implying a verification email always goes out.
    verification_code = await issue_email_verification_code(payload.username)
    email_sent = await send_verification_email(payload.email, payload.founder_name, verification_code)

    token = create_session_token(
        principal_id=user["username"],
        role="Owner",
        org_id=org_id,
        tenant_id=tenant_id,
    )
    return {
        "session_token": token,
        "principal_id": user["username"],
        "role": "Owner",
        "org_id": org_id,
        "tenant_id": tenant_id,
        "email_verified": False,
        "verification_email_sent": email_sent,
    }

# --- Email verification ---
class VerifyEmailRequest(BaseModel):
    username: str
    code: str

@app.post("/auth/verify-email")
async def verify_email(payload: VerifyEmailRequest, request: Request):
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    client_ip = forwarded_for.split(",", 1)[0].strip()
    if not client_ip:
        client_ip = request.client.host if request.client else "unknown"
    await rate_limiter.check_rate_limit("auth", f"ip:{client_ip}", max_rpm=5)

    ok = await verify_email_code(payload.username, payload.code)
    if not ok:
        raise HTTPException(400, detail={"code": "invalid_or_expired_code", "message": "That code is wrong or has expired. Request a new one."})
    return {"status": "verified", "email_verified": True}


class ResendVerificationRequest(BaseModel):
    username: str
    email: str

@app.post("/auth/resend-verification")
async def resend_verification(payload: ResendVerificationRequest, request: Request):
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    client_ip = forwarded_for.split(",", 1)[0].strip()
    if not client_ip:
        client_ip = request.client.host if request.client else "unknown"
    await rate_limiter.check_rate_limit("auth", f"ip:{client_ip}", max_rpm=5)

    try:
        code = await issue_email_verification_code(payload.username)
    except HTTPException:
        # Same response whether the username exists or not - do not let this
        # endpoint be used to enumerate accounts.
        return {"status": "sent_if_account_exists"}
    email_sent = await send_verification_email(payload.email, payload.username, code)
    return {"status": "sent_if_account_exists", "verification_email_sent": email_sent}


# --- Backup code (self-service account recovery) ---
# Shown once, exactly like a password. Curatom's own advice is to write it
# down or photograph it and keep that somewhere safe - Curatom itself never
# receives or stores that paper or photo, only a bcrypt hash of the code.
@app.post("/auth/recovery-code")
async def create_recovery_code(ctx: AuthContext = Depends(resolve_auth)):
    if ctx.principal_type != "human":
        raise HTTPException(403, detail="Only a human account can hold a backup code")
    code = await issue_recovery_code(ctx.principal_id)
    return {
        "recovery_code": code,
        "warning": (
            "This code is shown once and replaces any backup code you already had. "
            "Write it down or photograph it and store that somewhere safe - Curatom "
            "does not keep a copy of the paper or photo, only this code's hash."
        ),
    }


class RecoverRequest(BaseModel):
    username: str
    recovery_code: str
    new_password: str

@app.post("/auth/recover")
async def recover_account(payload: RecoverRequest, request: Request):
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    client_ip = forwarded_for.split(",", 1)[0].strip()
    if not client_ip:
        client_ip = request.client.host if request.client else "unknown"
    await rate_limiter.check_rate_limit("auth", f"ip:{client_ip}", max_rpm=5)

    if len(payload.new_password) < 8:
        raise HTTPException(400, detail="Password must be at least 8 characters")

    user = await redeem_recovery_code(payload.username, payload.recovery_code, payload.new_password)
    token = create_session_token(
        principal_id=user["principal_id"],
        role=user["role"],
        org_id=user["org_id"],
        tenant_id=user["tenant_id"],
    )
    return {
        "session_token": token,
        "principal_id": user["principal_id"],
        "role": user["role"],
        "tenant_id": user["tenant_id"],
        "org_id": user["org_id"],
    }

# --- Team Accounts (real, per-teammate logins) ---
# Curatom's single demo login predates this; every teammate an Owner adds
# here gets their own username, password and role instead of sharing one
# account. verify_human_login checks this collection first, so these
# authenticate through the exact same /auth/login path.
class CreateUserSchema(BaseModel):
    username: str
    password: str
    role: str
    display_name: str

@app.post("/users")
async def create_user(payload: CreateUserSchema, ctx: AuthContext = Depends(authorize("user.create"))):
    if ctx.role != "Owner":
        raise HTTPException(403, detail="Only the Owner can add teammates")
    if payload.role not in VALID_ROLES:
        raise HTTPException(400, detail=f"Role must be one of: {', '.join(sorted(VALID_ROLES))}")
    if len(payload.password) < 8:
        raise HTTPException(400, detail="Password must be at least 8 characters")

    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    password_hash = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    try:
        user = await repo.create_user(payload.username, password_hash, payload.role, payload.display_name)
    except ValueError as exc:
        raise HTTPException(409, detail=str(exc)) from exc

    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "user.create",
        "resource": f"users/{payload.username}",
        "details": {"role": payload.role},
    })
    return user

@app.get("/users")
async def list_users(ctx: AuthContext = Depends(authorize("user.read"))):
    if ctx.role != "Owner":
        raise HTTPException(403, detail="Only the Owner can view the team roster")
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    return await repo.list_users()

@app.delete("/users/{username}")
async def deactivate_user(username: str, ctx: AuthContext = Depends(authorize("user.deactivate"))):
    if ctx.role != "Owner":
        raise HTTPException(403, detail="Only the Owner can remove teammates")
    if username == ctx.principal_id:
        raise HTTPException(400, detail="You cannot remove your own account")
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    try:
        await repo.deactivate_user(username)
    except ValueError as exc:
        raise HTTPException(404, detail=str(exc)) from exc
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "user.deactivate",
        "resource": f"users/{username}",
    })
    return {"status": "deactivated", "username": username}

# --- Autonomous Taskmaster Workflow ---
# Execution is intentionally disabled until a durable Cloud Tasks/Pub/Sub worker exists.
class TaskCreateSchema(BaseModel):
    goal: str


@app.post("/tasks")
async def create_autonomous_task(
    payload: TaskCreateSchema,
    ctx: AuthContext = Depends(authorize("task.create")),
):
    raise HTTPException(
        status_code=501,
        detail={
            "code": "not_implemented",
            "message": "Task execution is not yet available. This endpoint requires a durable worker (Cloud Tasks/Pub/Sub) which is not deployed.",
        },
    )


@app.get("/tasks/{task_id}")
async def get_task_status(
    task_id: str,
    ctx: AuthContext = Depends(authorize("task.read")),
):
    raise HTTPException(
        status_code=501,
        detail={
            "code": "not_implemented",
            "message": "Task status is not yet available. This endpoint requires a durable worker.",
        },
    )


@app.get("/tasks")
async def list_tasks(
    cursor: Optional[str] = None,
    ctx: AuthContext = Depends(authorize("task.read")),
):
    raise HTTPException(
        status_code=501,
        detail={
            "code": "not_implemented",
            "message": "Task listing is not yet available. This endpoint requires the durable task subsystem.",
        },
    )

# --- Tenants & Fleets ---
@app.get("/tenants")
async def list_tenants(ctx: AuthContext = Depends(authorize("tenant.read"))):
    # Curatom is multi-tenant; a caller only ever sees the one tenant their
    # session or API key is scoped to, never a directory of other businesses.
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    tenant = await repo.get_tenant()
    if not tenant:
        return []
    return [{
        "tenant_id": tenant["tenant_id"],
        "name": tenant.get("name", ""),
        "org_id": tenant["org_id"],
        "training_data_opt_in": tenant.get("training_data_opt_in", False),
    }]

class TenantRenamePayload(BaseModel):
    name: str

@app.patch("/tenants")
async def rename_tenant(payload: TenantRenamePayload, ctx: AuthContext = Depends(authorize("tenant.write"))):
    # The sidebar used to show the raw tenant_id (e.g. "tenant_apac_enterprise")
    # because nothing let an Owner set or change the display name after
    # registration set it once from business_name. Owner-only, same as
    # every other workspace-identity action (team management, key rotation).
    if ctx.role != "Owner":
        raise HTTPException(403, detail="Only the Owner can rename the workspace")
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, detail="Name cannot be blank")
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    tenant = await repo.update_tenant_name(name)
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "tenant.rename",
        "resource": f"tenants/{ctx.tenant_id}",
        "details": {"name": name},
    })
    return {
        "tenant_id": tenant["tenant_id"],
        "name": tenant.get("name", ""),
        "org_id": tenant["org_id"],
        "training_data_opt_in": tenant.get("training_data_opt_in", False),
    }

class TrainingConsentPayload(BaseModel):
    opt_in: bool

@app.patch("/tenants/training-consent")
async def set_training_consent(payload: TrainingConsentPayload, ctx: AuthContext = Depends(authorize("tenant.write"))):
    # Toggling this on makes every future memory.write also drop a
    # de-identified copy into training_corpus (see create_memory). Toggling
    # it off purges every copy this tenant ever contributed, not just
    # future ones - consent revoked means the data goes too, not just a
    # promise to stop collecting more of it.
    if ctx.role != "Owner":
        raise HTTPException(403, detail="Only the Owner can change this")
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)

    previous = await repo.get_tenant()
    was_opted_in = bool(previous and previous.get("training_data_opt_in"))

    tenant = await repo.update_training_consent(payload.opt_in, decided_by=ctx.principal_id)

    purged_count = 0
    if was_opted_in and not payload.opt_in:
        purged_count = await repo.purge_training_corpus_for_tenant()

    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "tenant.training_consent",
        "resource": f"tenants/{ctx.tenant_id}",
        "details": {"opt_in": payload.opt_in, "purged_corpus_entries": purged_count},
    })
    return {
        "tenant_id": tenant["tenant_id"],
        "training_data_opt_in": tenant.get("training_data_opt_in", False),
        "purged_corpus_entries": purged_count,
    }

@app.post("/training-corpus/export")
async def export_training_corpus(ctx: AuthContext = Depends(authorize("tenant.write"))):
    # Manual, Owner-triggered, real: writes the current aggregate corpus
    # (every consenting tenant's de-identified entries, source_ref stripped
    # before anything leaves Firestore - see corpus_export.py) to a GCS
    # bucket as JSONL. That is the entire scope of this route. No training
    # job or fine-tuning pipeline reads from that bucket - this is the
    # "collected somewhere real" step, not a claim that training happens.
    if ctx.role != "Owner":
        raise HTTPException(403, detail="Only an Owner can trigger this")
    entries = await GlobalRepository().list_all_training_corpus_entries()
    result = await asyncio.to_thread(export_training_corpus_to_gcs, entries)

    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "training_corpus.export",
        "resource": f"gs://{result['bucket']}/{result['object']}",
        "details": {"entry_count": result["entry_count"]},
    })
    return result

@app.get("/fleets")
async def list_fleets(
    cursor: Optional[str] = None, 
    limit: int = 50,
    ctx: AuthContext = Depends(authorize("fleet.read"))
):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    items, next_cursor = await repo.list_fleets(limit=limit, cursor_id=cursor)
    # Stored (and every other collection in this app) keys its primary id
    # as "id" - but the frontend's Fleet type, and every call site using
    # it (Fleets.tsx's api.getFleetHealth(f.fleet_id) chief among them),
    # has always expected "fleet_id". That made f.fleet_id undefined,
    # api.getFleetHealth(undefined) 404, and the whole health panel
    # (Active Atoms, Error Rate, Status, Default Inherited Profile) fail
    # silently for every fleet, every tenant, always - console.error only.
    # Aliasing here instead of renaming the stored field, which every
    # other document type in this app also calls "id".
    items = [{**item, "fleet_id": item.get("id")} for item in items]
    return {"items": items, "next_cursor": next_cursor}

@app.get("/fleets/{fleet_id}/health")
async def get_fleet_health(
    fleet_id: str, 
    ctx: AuthContext = Depends(authorize("fleet.read"))
):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    fleet = await repo.get_fleet(fleet_id)
    if not fleet:
        raise HTTPException(404, "Fleet not found in active tenant scope")
    atoms, _ = await repo.list_atoms(limit=500)
    fleet_atoms = [a for a in atoms if a.get("fleet_id") == fleet_id]
    return {
        "fleet_id": fleet_id,
        "total_atoms": len(fleet_atoms),
        "health_status": "unknown",
        # Was a hardcoded 0.0 - a real-looking "0%" next to "unknown" status
        # was the exact fabricated-metric pattern this app's own business
        # context comment warns against elsewhere: recall failures (e.g. a
        # residency denial) raise before any log is written, so there is no
        # real error-tracking data source yet to compute this from. null
        # until that exists; the frontend already has to handle it since
        # health_status is honestly "unknown" too.
        "error_rate_pct": None
    }

# --- Atoms Registry ---
class AtomRegisterSchema(BaseModel):
    name: str
    model_family: str
    fleet_id: Optional[str] = None
    role: str = "Assistant"
    description: str = ""
    labels: Dict[str, str] = Field(default_factory=dict)
    # When true, this key can attempt context/decision/memory writes, but
    # none of them execute on the spot - each is queued as a pending
    # approval and only runs once the Owner approves it from /approvals.
    # False (default) keeps the key read-only, same as before this existed.
    requires_approval: bool = False
    # A profile already derived for this agent (e.g. from
    # /v1/reception/agents/handshake or /atoms/identify) - grounded against
    # this tenant's actual documentation, not a guess. When present, it's
    # used as-is instead of the fleet's generic defaults; any field it
    # doesn't set still falls back to the fleet default.
    profile: Optional[Dict[str, Any]] = None

@app.post("/atoms/register")
async def register_atom(
    atom: AtomRegisterSchema,
    ctx: AuthContext = Depends(authorize("atom.create"))
):
    await rate_limiter.check_rate_limit(ctx.org_id, ctx.tenant_id, 100)
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)

    if atom.fleet_id:
        fleet = await repo.get_fleet(atom.fleet_id)
        if not fleet:
            raise HTTPException(404, f"Fleet '{atom.fleet_id}' not found")
    else:
        # No fleet named: transparently use (or create) the tenant's
        # default one. A founder connecting their first agent should
        # never need to know what a "fleet" is.
        fleet = await repo.get_or_create_default_fleet()

    default_profile = fleet.get("default_profile", {})
    given_profile = atom.profile or {}
    derived_profile = {
        "format": given_profile.get("format") or default_profile.get("format", "JSON"),
        "retention_window_hours": given_profile.get("retention_window_hours") or default_profile.get("retention_window_hours", 168),
        "accuracy_tolerance": given_profile.get("accuracy_tolerance") or default_profile.get("accuracy_tolerance", "High"),
        "system_persona": given_profile.get("system_persona") or default_profile.get("system_persona", "You are a precise enterprise agent."),
        "max_output_tokens": given_profile.get("max_output_tokens") or default_profile.get("max_output_tokens", 2048),
        "permitted_regions": given_profile.get("permitted_regions") or default_profile.get("permitted_regions", ["SG", "US", "IN", "EU"]),
        "classification_ceiling": given_profile.get("classification_ceiling") or default_profile.get("classification_ceiling", "internal"),
        "version": 1
    }

    atom_id = f"atom_{uuid.uuid4().hex}"
    raw_key = f"{atom_id}.{uuid.uuid4().hex}"
    hashed = hash_key(raw_key)

    atom_data = {
        "id": atom_id,
        "name": atom.name,
        "fleet_id": fleet["id"],
        "model_family": atom.model_family,
        "role": atom.role,
        "description": atom.description,
        "labels": atom.labels,
        "profile": derived_profile,
        "status": "active",
        "requires_approval": atom.requires_approval,
        "api_key_hash": hashed,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "last_seen": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

    await repo.create_atom(atom_data)
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "atom.create",
        "resource": f"atoms/{atom_id}",
        "decision": "PERMITTED"
    })

    return {
        "atom": {k: v for k, v in atom_data.items() if k != "api_key_hash"},
        "api_key": raw_key
    }

@app.get("/atoms")
async def list_atoms(
    cursor: Optional[str] = None, 
    limit: int = 50,
    ctx: AuthContext = Depends(authorize("atom.read"))
):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    items, next_cursor = await repo.list_atoms(limit=limit, cursor_id=cursor)
    if ctx.principal_type == "agent":
        # Only log an agent listing other keys in the tenant - a human
        # Owner checking their own Registry page isn't a "which key did
        # what" event worth an audit row, but an agent enumerating its
        # siblings is exactly the kind of read this log exists for.
        await repo.write_audit_log({
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "actor": ctx.principal_id,
            "action": "atom.read",
            "resource": "atoms",
            "decision": "PERMITTED",
        })
    return {"items": items, "next_cursor": next_cursor}

class AtomTransitionSchema(BaseModel):
    transition: str
    reason: str

@app.post("/atoms/{atom_id}/transition")
async def transition_atom(
    atom_id: str, 
    payload: AtomTransitionSchema,
    ctx: AuthContext = Depends(authorize("atom.transition"))
):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    atom = await repo.get_atom(atom_id)
    if not atom:
        raise HTTPException(404, "Atom not found")
        
    legal = {
        "provisioning": ["activate", "retire"],
        "active": ["suspend", "quarantine", "drain", "retire"],
        "suspended": ["activate", "quarantine", "retire"],
        "quarantined": ["activate", "retire"],
        "draining": ["retire", "activate"],
        "retired": []
    }
    current_status = atom.get("status", "active")
    if payload.transition not in legal.get(current_status, []):
        raise HTTPException(409, f"Illegal transition '{payload.transition}' from '{current_status}'. Allowed: {legal.get(current_status, [])}")
        
    status_map = {"activate": "active", "suspend": "suspended", "quarantine": "quarantined", "drain": "draining", "retire": "retired"}
    new_status = status_map[payload.transition]
    
    await repo.update_atom(atom_id, {"status": new_status, "status_reason": payload.reason})
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": f"atom.transition.{payload.transition}",
        "resource": f"atoms/{atom_id}",
        "reason": payload.reason
    })
    return {"status": new_status}

@app.post("/atoms/{atom_id}/keys/rotate")
async def rotate_atom_key(
    atom_id: str, 
    ctx: AuthContext = Depends(authorize("key.rotate"))
):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    atom = await repo.get_atom(atom_id)
    if not atom:
        raise HTTPException(404, "Atom not found")

    # The frontend only enables this button for an 'active' atom - but that
    # was cosmetic only. Nothing here checked status, so a direct call
    # against a retired (or suspended/quarantined/draining) atom minted a
    # fresh, fully working key for a credential that was supposed to be
    # permanently decommissioned. Found live: rotating a retired atom's key
    # returned 200 with a usable new key.
    if atom.get("status") != "active":
        raise HTTPException(409, detail={
            "code": "atom_not_active",
            "message": f"Cannot rotate a key for an atom in '{atom.get('status')}' state. Only an active atom's key can be rotated.",
        })

    new_key = f"{atom_id}.{uuid.uuid4().hex}"
    new_hash = hash_key(new_key)
    
    await repo.update_atom(atom_id, {
        "previous_key_hash": atom["api_key_hash"],
        "api_key_hash": new_hash,
        "rotated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    })

    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "key.rotate",
        "resource": f"atoms/{atom_id}",
        "reason": "Operator initiated key rotation"
    })

    return {"api_key": new_key, "grace_period_hours": 24}

@app.post("/atoms/identify")
async def identify_atom(
    req: IdentifyRequest,
    ctx: AuthContext = Depends(authorize("atom.read")),
):
    await rate_limiter.check_rate_limit(ctx.org_id, ctx.tenant_id, 10)
    query_text = req.sample_response or req.model_family_hint or ""
    if not query_text:
        raise HTTPException(400, "Provide hint or sample response")
        
    query_emb = await embed_text(query_text)
    global_repo = GlobalRepository()
    dir_results = await global_repo.search_excerpts(req.model_family_hint or "", query_emb, limit=3)
    
    sources = []
    context_text = ""
    for d in dir_results:
        if d.get('source_url'):
            sources.append({"uri": d['source_url'], "title": d.get('section_title', 'Documentation')})
        if d.get('text'):
            context_text += d['text'] + "\n"
            
    if not sources:
        return {"profile": None, "sources": [], "matched": False}

    prompt = f"Derive the optimal agent operational profile based on this documentation:\n{context_text}"
    resp = await ai.aio.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=genai.types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {
                    "format": {"type": "STRING"},
                    "retention_window_hours": {"type": "INTEGER"},
                    "accuracy_tolerance": {"type": "STRING"},
                    "system_persona": {"type": "STRING"},
                    "max_output_tokens": {"type": "INTEGER"},
                    "classification_ceiling": {"type": "STRING"}
                }
            }
        )
    )
    profile = json.loads(resp.text)
    profile["permitted_regions"] = ["IN", "EU", "US", "SG"]
    profile["version"] = 1
    return {"profile": profile, "sources": sources, "matched": True}

# --- Policies ---
@app.get("/policies")
async def list_policies(ctx: AuthContext = Depends(authorize("policy.read"))):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    return await repo.list_policies()

class PolicyCreateSchema(BaseModel):
    name: str
    effect: str  # "allow" or "deny" - matched literally in PolicyEngine.evaluate
    actions: List[str]  # e.g. ["memory.write"], or ["*"] for every action
    principals: List[str]  # a role name, a principal_id, or "*"

@app.post("/policies")
async def create_policy(payload: PolicyCreateSchema, ctx: AuthContext = Depends(authorize("policy.write"))):
    if ctx.role != "Owner":
        raise HTTPException(403, detail="Only the Owner can add a custom policy")
    if payload.effect not in ("allow", "deny"):
        raise HTTPException(400, detail="effect must be 'allow' or 'deny'")
    if not payload.actions or not payload.principals:
        raise HTTPException(400, detail="actions and principals cannot be empty")
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    policy = await repo.create_policy(payload.name, payload.effect, payload.actions, payload.principals)
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "policy.create",
        "resource": f"policies/{policy['policy_id']}",
        "details": {"name": payload.name, "effect": payload.effect, "actions": payload.actions, "principals": payload.principals},
    })
    return policy

@app.delete("/policies/{policy_id}")
async def delete_policy(policy_id: str, ctx: AuthContext = Depends(authorize("policy.write"))):
    if ctx.role != "Owner":
        raise HTTPException(403, detail="Only the Owner can remove a custom policy")
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    deleted = await repo.delete_policy(policy_id)
    if not deleted:
        raise HTTPException(404, detail=f"Policy '{policy_id}' not found")
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "policy.delete",
        "resource": f"policies/{policy_id}",
        "details": {},
    })
    return {"status": "deleted", "policy_id": policy_id}

class PolicySimulateSchema(BaseModel):
    principal: str
    action: str
    resource: str
    context: Optional[Dict[str, Any]] = None

@app.post("/policies/simulate")
async def simulate_policy(
    payload: PolicySimulateSchema, 
    ctx: AuthContext = Depends(authorize("policy.simulate"))
):
    sim_ctx = AuthContext(
        principal_id="sim_principal",
        principal_type="human",
        org_id=ctx.org_id,
        tenant_id=ctx.tenant_id,
        role=payload.principal,
        permitted_regions=["IN", "EU", "US", "SG"],
        classification_ceiling="restricted"
    )
    return await PolicyEngine.evaluate(
        ctx=sim_ctx,
        action=payload.action,
        resource=payload.resource,
        context=payload.context
    )

# --- Adaptive Recall Engine with Grounding ---
class RecallRequestSchema(BaseModel):
    atom_id: str
    memory_id: str
    query: str

@app.post("/recall")
async def execute_recall(
    req: RecallRequestSchema,
    request: Request,
    ctx: AuthContext = Depends(authorize("recall.execute"))
):
    if ctx.principal_type == "agent" and ctx.principal_id != req.atom_id:
        raise HTTPException(
            status_code=403,
            detail={"code": "impersonation_denied", "message": f"Agent {ctx.principal_id} cannot impersonate atom {req.atom_id}"}
        )

    await rate_limiter.check_rate_limit(ctx.org_id, ctx.tenant_id, 300)
    await rate_limiter.check_daily_quota(ctx.org_id, ctx.tenant_id, 50000)
    
    start_time = time.perf_counter()
    req_id = getattr(request.state, "request_id", f"req_{uuid.uuid4().hex}")
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    global_repo = GlobalRepository()
    
    # 1. Tenant-Scoped Lookups
    atom = await repo.get_atom(req.atom_id)
    if not atom:
        raise HTTPException(404, "Atom not found in tenant scope")
        
    try:
        memory = await repo.get_memory(req.memory_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "invalid_stored_security_metadata",
                "message": "Stored memory has an unknown classification or region and was rejected.",
            },
        ) from exc
    if not memory:
        raise HTTPException(404, "Memory record not found in tenant scope")

    redacted_input = memory.get("content_redacted")
    if not redacted_input:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "missing_redacted_content",
                "message": "Memory record missing redacted content. This indicates a data migration issue or malformed record.",
            },
        )

    if not is_classification_permitted(
        atom.get("profile", {}).get("classification_ceiling", "internal"),
        memory.get("classification", "internal")
    ):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "classification_denied",
                "message": f"Atom classification ceiling '{atom.get('profile', {}).get('classification_ceiling', 'internal')}' insufficient for memory classification '{memory.get('classification', 'internal')}'"
            }
        )

    # 2. Strict Data Residency Check
    mem_region = memory.get("region", "SG")
    permitted_regions = atom.get("profile", {}).get("permitted_regions", ["SG", "US", "IN", "EU"])
    
    if mem_region not in permitted_regions:
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        await repo.write_audit_log({
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "request_id": req_id,
            "action": "recall.residency_denied",
            "resource": f"memories/{req.memory_id}",
            "reason": f"Residency refusal: Memory in '{mem_region}', atom cleared for {permitted_regions}"
        })
        raise HTTPException(
            status_code=403,
            detail={
                "code": "residency_denied",
                "message": f"Data residency refusal: Memory resides in region '{mem_region}', but requesting atom is only cleared for {permitted_regions}."
            }
        )

    # 3. Staleness Evaluation
    created_at = datetime.datetime.fromisoformat(memory["created_at"])
    age_hours = (datetime.datetime.now(datetime.timezone.utc) - created_at).total_seconds() / 3600
    retention = atom["profile"]["retention_window_hours"]
    is_stale = (age_hours > retention) or memory.get("is_superseded", False)
    staleness_hours = int(age_hours - retention) if (age_hours > retention) else 0

    # 4. SHA256 Reshape Caching - checked before any embedding call, since the
    # cache key is derived entirely from text (memory id/version, profile,
    # normalized query). Grounding excerpts require an embedding call that's
    # rate-paced globally alongside directory ingestion (see
    # directory_fetcher.py's _embedding_pacer) - a cache hit has no reason to
    # ever wait behind that. Cache-hit latency was 6.9s in a live founder
    # walkthrough purely from this embedding call queueing behind an
    # in-progress ingestion run; it does zero embedding work now.
    profile_hash = hashlib.sha256(json.dumps(atom["profile"], sort_keys=True).encode()).hexdigest()[:16]
    normalized_query = " ".join(req.query.lower().split())
    cache_key = hashlib.sha256(f"{memory['id']}:{memory.get('version', 1)}:{profile_hash}:{normalized_query}".encode()).hexdigest()

    cached = await repo.get_cache(cache_key)
    if cached and not is_stale:
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        # Sources actually used to produce the cached response, stored
        # alongside it - not recomputed against whatever the directory looks
        # like now, which could have drifted since the response was cached.
        cached_grounding_sources = cached.get("grounding_sources", [])
        await repo.write_recall_log({
            "recall_id": f"rec_{uuid.uuid4().hex}",
            "request_id": req_id,
            "atom_id": req.atom_id,
            "query": req.query,
            "topic": memory["topic"],
            "response": cached["response"],
            "raw_memory_excerpt": redacted_input,
            "was_cached": True,
            "was_reshaped": True,
            "is_stale": is_stale,
            "staleness_overage_hours": staleness_hours,
            "latency_ms": elapsed_ms,
            "tokens_consumed": 0,
            "token_metering_method": "cache",
            "grounding_sources": cached_grounding_sources,
            "subject_ids": memory.get("metadata", {}).get("subject_ids", []),
            "dsr_purged": False,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        })
        return {
            "raw_memory": redacted_input,
            "response": cached["response"],
            "is_stale": is_stale,
            "staleness_hours": staleness_hours,
            "latency_ms": elapsed_ms,
            "was_cached": True,
            "grounding_sources": cached_grounding_sources,
            "tokens_consumed": 0,
            "token_metering_method": "cache",
            "request_id": req_id
        }

    # 5. Vector Grounding Excerpt Retrieval from Global Directory - only
    # reached on a cache miss or stale entry, since it's the only step here
    # that actually needs a fresh LLM call.
    query_emb = await embed_text(req.query)
    grounding_excerpts = await global_repo.search_excerpts_by_model(atom.get("model_family", ""), query_emb, limit=3)

    grounding_sources = []
    grounding_context = ""
    for ge in grounding_excerpts:
        if ge.get("source_url"):
            grounding_sources.append({"uri": ge["source_url"], "title": ge.get("section_title", "Doc Excerpt")})
        if ge.get("text"):
            grounding_context += ge["text"] + "\n"

    # 6. Dual PII Guard: Prompt strictly consumes content_redacted & grounding_context
    business_context_for_prompt = await repo.get_business_context()
    tenant_business_name = (business_context_for_prompt or {}).get("business_name") or "this business"
    prompt = (
        f"You are Curatom's Adaptive Reshaping Engine for '{tenant_business_name}'.\n"
        f"Grounded Model Documentation Excerpts:\n{grounding_context}\n\n"
        f"Reshape this memory strictly to match target format:\n"
        f"Format: {atom['profile']['format']}\n"
        f"Persona: {atom['profile']['system_persona']}\n"
        f"Accuracy Tolerance: {atom['profile']['accuracy_tolerance']}\n\n"
        f"Query: {req.query}\n"
        f"Memory Content: {redacted_input}"
    )
    
    resp = await ai.aio.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=genai.types.GenerateContentConfig(
            max_output_tokens=atom['profile']['max_output_tokens']
        )
    )
    
    elapsed_ms = int((time.perf_counter() - start_time) * 1000)

    try:
        usage_metadata = getattr(resp, "usage_metadata", None)
        tokens_used = getattr(usage_metadata, "total_token_count", None) if usage_metadata is not None else None
    except Exception:
        tokens_used = None

    if tokens_used is not None:
        tokens_consumed = int(tokens_used)
        metering_method = "exact"
    else:
        tokens_consumed = len(resp.text.split()) * 2
        metering_method = "estimated"

    if not is_stale:
        await repo.set_cache(cache_key, {
            "response": resp.text,
            "memory_id": memory["id"],
            "grounding_sources": grounding_sources,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        })
        
    await repo.increment_tenant_costs(model_calls=1, tokens=tokens_consumed, embeddings=1)
    
    await repo.write_recall_log({
        "recall_id": f"rec_{uuid.uuid4().hex}",
        "request_id": req_id,
        "atom_id": req.atom_id,
        "query": req.query,
        "topic": memory["topic"],
        "response": resp.text,
        "raw_memory_excerpt": redacted_input,
        "was_cached": False,
        "was_reshaped": True,
        "is_stale": is_stale,
        "staleness_overage_hours": staleness_hours,
        "latency_ms": elapsed_ms,
        "tokens_consumed": tokens_consumed,
        "token_metering_method": metering_method,
        "grounding_sources": grounding_sources,
        "subject_ids": memory.get("metadata", {}).get("subject_ids", []),
        "dsr_purged": False,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    })
    
    return {
        "raw_memory": redacted_input,
        "response": resp.text,
        "is_stale": is_stale,
        "staleness_hours": staleness_hours,
        "latency_ms": elapsed_ms,
        "was_cached": False,
        "grounding_sources": grounding_sources,
        "tokens_consumed": tokens_consumed,
        "token_metering_method": metering_method,
        "request_id": req_id
    }

# --- Memory & Right-to-Erasure ---
@app.post("/memories")
async def create_memory(
    mem: MemoryCreate,
    ctx: AuthContext = Depends(authorize("memory.write"))
):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)

    if ctx.principal_type == "agent" and ctx.requires_approval:
        approval = await repo.create_pending_approval(
            action="memory.write",
            resource="memories",
            payload=mem.model_dump(),
            requested_by=ctx.principal_id,
        )
        await repo.write_audit_log({
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "actor": ctx.principal_id,
            "action": "memory.write.queued",
            "resource": "memories",
            "details": {"approval_id": approval["id"]},
        })
        return {
            "status": "pending_approval",
            "approval_id": approval["id"],
            "message": "This key requires Owner approval before writes take effect. The Owner has been notified.",
        }

    mem_id = f"mem_{uuid.uuid4().hex}"
    
    redacted_content, pii_classes = detect_and_redact_pii(mem.content)
    emb = await embed_text(redacted_content)
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # A human principal has no fleet - only agents (atoms) belong to one.
    # This used to hardcode "fleet_core_apac" for every memory regardless of
    # who or what tenant created it, which was simply false for any real
    # tenant's own fleet (a freshly generated id, never that string).
    creator_fleet_id = None
    if ctx.principal_type == "agent":
        creator_atom = await repo.get_atom(ctx.principal_id)
        creator_fleet_id = creator_atom.get("fleet_id") if creator_atom else None

    mem_data = {
        "id": mem_id,
        "topic": mem.topic,
        "region": mem.region,
        "classification": mem.classification,
        "content_redacted": redacted_content,
        "embedding": Vector(emb),
        "embedding_model": EMBEDDING_MODEL,
        "embedding_dimension": EMBEDDING_DIM,
        "version": 1,
        "is_superseded": False,
        "created_at": now_iso,
        "updated_at": now_iso,
        "metadata": {
            "source_query": "Manual API Write",
            "domain": "Enterprise",
            "tags": ["manual", mem.region.lower()],
            "pii_classes": pii_classes,
            "subject_ids": mem.subject_ids,
            "provenance": {
                "atom_id": ctx.principal_id if ctx.principal_type == "agent" else None,
                "created_by": ctx.principal_id,
                "fleet_id": creator_fleet_id,
                "timestamp": now_iso
            }
        },
        "source": "api_entry"
    }
    
    await repo.create_memory(mem_data)

    # Opt-in only: check the tenant's training-consent flag and, only if
    # true, write a de-identified copy alongside the real record. content_redacted
    # is already PII-redacted above regardless of this flag - opting in adds
    # a second, unlinked-on-its-face copy, it doesn't change what gets
    # redacted from the original.
    tenant = await repo.get_tenant()
    if tenant and tenant.get("training_data_opt_in"):
        await repo.write_training_corpus_entry(mem_id, {
            "content_redacted": redacted_content,
            "topic": mem.topic,
            "region": mem.region,
            "classification": mem.classification,
            "pii_classes": pii_classes,
            "created_at": now_iso,
        })

    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "memory.write",
        "resource": f"memories/{mem_id}",
        "decision": "PERMITTED"
    })

    return {"id": mem_id, "status": "created", "pii_classes": pii_classes}

@app.get("/memories")
async def list_memories(
    q: Optional[str] = None,
    cursor: Optional[str] = None,
    limit: int = 50,
    ctx: AuthContext = Depends(authorize("memory.read"))
):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    if q:
        query_emb = await embed_text(q)
        items = await repo.vector_search_memories_scoped(query_emb, limit=limit)
        next_cursor = None
    else:
        items, next_cursor = await repo.list_memories(limit=limit, cursor_id=cursor)

    # Fail closed for missing or unknown security metadata, and apply the same
    # clearance check to both vector search and cursor-based listing.
    # The stored "embedding" field is a 768-float vector used only for
    # server-side vector search - nothing in the frontend ever reads it,
    # and shipping it over the wire for every memory on every list/search
    # call was pure wasted payload with no functional purpose.
    filtered = [
        {k: v for k, v in memory.items() if k != "embedding"}
        for memory in items
        if _memory_is_visible_to(ctx, memory)
    ]
    return {"items": filtered, "next_cursor": next_cursor}

@app.delete("/memories/{memory_id}")
async def delete_memory(memory_id: str, ctx: AuthContext = Depends(authorize("memory.delete"))):
    # Deletes one stray/wrong record directly - a bad manual entry, a
    # leftover test fixture - vs. the subject-erasure cascade below, which
    # is a DSR tool keyed by a data subject, not a memory id, and doesn't
    # help when the record has no subject_ids at all.
    if ctx.role != "Owner":
        raise HTTPException(403, detail="Only the Owner can delete a memory record directly")
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    deleted = await repo.delete_memory(memory_id)
    if not deleted:
        raise HTTPException(404, detail=f"Memory '{memory_id}' not found")
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "memory.delete",
        "resource": f"memories/{memory_id}",
        "details": {},
    })
    return {"status": "deleted", "memory_id": memory_id}

@app.delete("/subjects/{subject_id}")
async def erase_subject(
    subject_id: str, 
    ctx: AuthContext = Depends(authorize("subject.erase"))
):
    # Real cascading erasure: deletes memory documents, vector embeddings, and cache entries
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    result = await repo.delete_subject_cascade(subject_id)
    
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "subject.erase",
        "resource": f"subjects/{subject_id}",
        "details": result
    })
    return result

# --- Global Model Directory ---
@app.get("/directory")
async def get_directory(ctx: AuthContext = Depends(authorize("directory.read"))):
    global_repo = GlobalRepository()
    return await global_repo.get_directory_entries()

@app.get("/directory/status")
async def get_directory_status(ctx: AuthContext = Depends(authorize("directory.read"))):
    global_repo = GlobalRepository()
    state = await global_repo.get_ingestion_state()
    cache = await global_repo.get_cache_metrics()
    
    total_lookups = cache.get("total_lookups", 0)
    total_hits = cache.get("total_hits", 0)
    hit_rate = (total_hits / total_lookups * 100) if total_lookups > 0 else 0.0
    excerpts_count = await global_repo.get_excerpts_count()
    # Same discipline as excerpts_count above: a real query, not
    # state["models_ingested"] - that field is overwritten mid-run with a
    # partial in-progress count (ingest_huggingface writes it once per
    # model as it goes), so reading it while a sync is running showed the
    # model total regress from 9 down to 1, then climb back up - a false
    # "did we just lose data" signal live-verified on a real ingestion run.
    model_count = await global_repo.get_directory_model_count()

    return {
        "total_models": model_count,
        "total_excerpts": excerpts_count,
        "is_ingesting": state.get("is_ingesting", False),
        "is_stale": is_ingestion_stale(state),
        "last_run": state.get("last_run"),
        "cache_hit_rate_pct": round(hit_rate, 2),
        "total_cache_hits": total_hits,
        "total_cache_lookups": total_lookups
    }

@app.post("/directory/ingest")
async def trigger_ingest(ctx: AuthContext = Depends(authorize("directory.ingest"))):
    global_repo = GlobalRepository()
    state = await global_repo.get_ingestion_state()
    if state.get("is_ingesting") and not is_ingestion_stale(state):
        raise HTTPException(409, detail="Ingestion already in progress")

    # Was asyncio.create_task(run_ingestion()) - fire-and-forget inside this
    # handler, which only kept making progress while some other request
    # happened to be in flight on the same instance (Cloud Run throttles
    # CPU between requests). Cloud Tasks calling back into
    # /directory/ingest/execute makes the actual work a real incoming
    # request instead, which gets full CPU for its own duration regardless.
    await enqueue_ingestion_task()

    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "directory.ingest",
        "resource": "global/directory",
        "reason": "Operator triggered directory ingestion"
    })

    return {"status": "Ingestion initiated"}


@app.post("/directory/ingest/execute")
async def execute_ingest_task(request: Request):
    # Called only by Cloud Tasks, never a logged-in principal - there is no
    # AuthContext here, so the gate is this shared secret instead of the
    # usual authorize(). Cloud Run's own invoker policy is public on this
    # service (verified live: allUsers holds run.invoker), so this route
    # has to defend itself rather than lean on platform-level auth.
    provided = request.headers.get("X-Ingestion-Task-Secret", "")
    if not settings.INGESTION_TASK_SECRET or provided != settings.INGESTION_TASK_SECRET:
        raise HTTPException(403, detail="Not a recognized ingestion task caller")

    # Awaited directly, inside this real incoming request, rather than
    # asyncio.create_task() - that's the entire fix. Cloud Run's request
    # timeout (raised to 3600s for this service) is the ceiling on a single
    # run now, not "however long CPU happens to be un-throttled for."
    await run_ingestion()
    return {"status": "completed"}


# --- Observability Feed ---
@app.get("/logs")
async def list_logs(
    cursor: Optional[str] = None, 
    limit: int = 50,
    ctx: AuthContext = Depends(authorize("audit.read"))
):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    items, next_cursor = await repo.list_recalls(limit=limit, cursor_id=cursor)
    return {"items": items, "next_cursor": next_cursor}

@app.get("/audit")
async def list_audit_trail(
    cursor: Optional[str] = None,
    limit: int = 50,
    ctx: AuthContext = Depends(authorize("audit.read"))
):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    items, next_cursor = await repo.list_audit_logs(limit=limit, cursor_id=cursor)
    return {"items": items, "next_cursor": next_cursor}

@app.post("/ask")
async def ask_query(
    req: ChatRequest,
    ctx: AuthContext = Depends(authorize("recall.execute"))
):
    atom_key = ctx.principal_id if ctx.principal_type == "agent" else None
    result = await handle_chat(req.query, ctx.role, atom_key, ctx.tenant_id, ctx.org_id)
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "ask.query",
        "resource": "ask",
        "details": {"query": req.query},
        "decision": "PERMITTED",
    })
    return result

# --- Format-aware hand-off ---
# An atom's profile.format (derived at /atoms/identify handshake time, from
# the model's own documentation-grounded read of how it's best fed data -
# see profile derivation above) was captured and stored, but nothing ever
# read it back - every principal got the same JSON no matter what it asked
# for. That's the actual mechanism this exists for: talking to an AI isn't
# complicated, it just wants its context in the shape it parses best, and
# Curatom already knows that shape per-atom. A human session always gets
# plain JSON; only an agent's own derived format changes what comes back.
def _dict_to_markdown(payload: Any, level: int = 0) -> str:
    indent = "  " * level
    lines = []
    if isinstance(payload, dict):
        for k, v in payload.items():
            if isinstance(v, (dict, list)) and v:
                lines.append(f"{indent}- **{k}**:")
                lines.append(_dict_to_markdown(v, level + 1))
            else:
                lines.append(f"{indent}- **{k}**: {v}")
    elif isinstance(payload, list):
        for item in payload:
            if isinstance(item, (dict, list)):
                lines.append(_dict_to_markdown(item, level))
            else:
                lines.append(f"{indent}- {item}")
    else:
        lines.append(f"{indent}{payload}")
    return "\n".join(lines)


def render_for_principal(payload: Dict[str, Any], ctx: AuthContext):
    if ctx.principal_type != "agent" or not ctx.atom_profile:
        return payload
    fmt = (ctx.atom_profile.get("format") or "JSON").strip().lower()
    if fmt.startswith("yaml"):
        return Response(content=yaml.dump(payload, sort_keys=False, allow_unicode=True), media_type="application/yaml")
    if fmt.startswith("markdown") or fmt == "md":
        return Response(content=_dict_to_markdown(payload), media_type="text/markdown")
    return payload


# --- Business Context ---
# Curatom's actual job: hold the canonical, founder-provided answer to
# "what is this business and what should any LLM or agent know before
# acting on its behalf" - so that intent doesn't get lost or reinvented
# every time a different model (Claude, GPT, Gemini, whatever's next) is
# asked to do something. No synthetic or pre-filled data - a tenant that
# hasn't answered these questions yet simply has no context, and every
# route below says so honestly rather than fabricating an answer.
class BusinessContextPayload(BaseModel):
    business_name: str
    what_you_do: str
    customers: str
    current_stack: str
    priorities: str
    constraints: Optional[str] = None
    voice_and_tone: Optional[str] = None
    anything_else: Optional[str] = None
    # Added in addition to the fields above, all optional so nobody who has
    # already onboarded is forced to re-answer anything. Each can list more
    # than one value in free text (e.g. "12 countries: IN, SG, US...") -
    # there's no separate repeatable-field mechanism, this is one string box.
    brands: Optional[str] = None
    domains: Optional[str] = None
    founders: Optional[str] = None
    no_of_employees: Optional[str] = None
    countries_covered: Optional[str] = None
    key_associations: Optional[str] = None
    spine_of_business: Optional[str] = None
    business_model_evolution: Optional[str] = None
    key_events_and_principles: Optional[str] = None
    user_base: Optional[str] = None
    softwares_involved: Optional[str] = None
    hardwares_firmware: Optional[str] = None
    things_missing_to_ask: Optional[str] = None
    future_goals_or_deadlines: Optional[str] = None
    who_is_writing_and_reliability: Optional[str] = None


@app.get("/context")
async def get_business_context(ctx: AuthContext = Depends(authorize("context.read"))):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    context = await repo.get_business_context()
    payload = {"onboarded": True, "context": context} if context else {"onboarded": False, "context": None}
    # An agent landing on this endpoint for the first time got a bare field
    # dump - no indication of what Curatom even is, which key reached it, or
    # what it's allowed to do next. First version of this greeting was the
    # same generic paragraph for every tenant - founder feedback: identify
    # *this* key and *this* company specifically, not a template that reads
    # the same for anyone who registers. Only for agent callers - a human
    # operator already knows what Curatom is. Built only from real,
    # already-verified fields (the atom's own registered name/model_family,
    # its actual write permission) - never fabricates a summary for a
    # tenant that hasn't answered the White Paper yet, and never invents a
    # human name Curatom was never given one.
    if ctx.principal_type == "agent":
        atom = await repo.get_atom(ctx.principal_id)
        key_label = f"'{atom.get('name')}' ({atom.get('model_family')})" if atom else "this key"
        if context:
            business = context.get('business_name') or 'this business'
            if ctx.requires_approval:
                write_line = (
                    f"You may propose changes to {business}'s White Paper with PUT /context, "
                    f"but nothing you write takes effect until a human at {business} approves it - "
                    f"every proposal is queued, never applied silently."
                )
            else:
                write_line = (
                    f"You're trusted to write directly - PUT /context updates {business}'s "
                    f"White Paper immediately, no approval step."
                )
            payload["greeting"] = (
                f"You've reached Curatom, the founder-verified source of truth {business} uses "
                f"for what it is and how agents should act on its behalf. You're connected as "
                f"{key_label}. Nothing below is guessed - it's what the founder actually wrote. "
                f"In short, {business} {context.get('what_you_do') or 'has not summarised what it does yet'}. "
                f"{write_line} Ask about anything below; don't assume anything that isn't."
            )
        else:
            payload["greeting"] = (
                f"You've reached Curatom, connected as {key_label}, but this business hasn't "
                "answered its White Paper yet - there is no verified context to act on. Don't "
                "infer or assume anything about the business; ask a human operator to complete "
                "onboarding first."
            )
    # Reads were previously silent - a founder had no way to know a key had
    # ever looked at their business context, only that one had changed it.
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "context.read",
        "resource": f"tenant/{ctx.tenant_id}/business_context",
        "decision": "PERMITTED",
    })
    return render_for_principal(payload, ctx)


_ALLOWED_CONTEXT_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
_MAX_CONTEXT_IMAGE_BYTES = 8 * 1024 * 1024

@app.post("/context/from-image")
async def extract_context_from_image(
    file: UploadFile = File(...),
    ctx: AuthContext = Depends(authorize("context.write")),
):
    # A third path alongside typing the form and pasting back a filled-in
    # YAML prompt: a founder who'd rather grab paper and a pen photographs
    # the result instead of typing it up. Extraction only - this never
    # saves anything itself, same as the paste-back path, so the founder
    # always reviews before PUT /context actually persists it.
    if file.content_type not in _ALLOWED_CONTEXT_IMAGE_TYPES:
        raise HTTPException(400, detail=f"Unsupported image type '{file.content_type}'")
    contents = await file.read()
    if len(contents) > _MAX_CONTEXT_IMAGE_BYTES:
        raise HTTPException(413, detail="Image too large (max 8MB)")

    extracted = await extract_business_context_from_image(contents, file.content_type)

    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "context.extract_from_image",
        "resource": f"tenant/{ctx.tenant_id}/business_context",
        "details": {"fields_extracted": list(extracted.keys())},
    })
    return {"extracted": extracted}


@app.put("/context")
async def set_business_context(
    payload: BusinessContextPayload,
    ctx: AuthContext = Depends(authorize("context.write")),
):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)

    if ctx.principal_type == "agent" and ctx.requires_approval:
        approval = await repo.create_pending_approval(
            action="context.write",
            resource=f"tenant/{ctx.tenant_id}/business_context",
            payload=payload.model_dump(),
            requested_by=ctx.principal_id,
        )
        await repo.write_audit_log({
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "actor": ctx.principal_id,
            "action": "context.write.queued",
            "resource": f"tenant/{ctx.tenant_id}/business_context",
            "details": {"approval_id": approval["id"]},
        })
        return {
            "status": "pending_approval",
            "approval_id": approval["id"],
            "message": "This key requires Owner approval before writes take effect. The Owner has been notified.",
        }

    saved = await repo.set_business_context(payload.model_dump())
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "context.write",
        "resource": f"tenant/{ctx.tenant_id}/business_context",
        "decision": "PERMITTED",
    })
    return {"onboarded": True, "context": saved}


@app.delete("/context")
async def delete_business_context(ctx: AuthContext = Depends(authorize("context.write"))):
    if ctx.role != "Owner":
        raise HTTPException(403, detail="Only the Owner can reset business context")
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    await repo.delete_business_context()
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "context.delete",
        "resource": f"tenant/{ctx.tenant_id}/business_context",
        "decision": "PERMITTED",
    })
    return {"onboarded": False, "context": None}


# --- Decision Log ---
# A claim-backed choice, recorded when it's made, and the real outcome tied
# back to it later - so the next similar choice weighs this company's own
# track record against a vendor's claim, not the claim alone. See
# repository.py's create_decision docstring-equivalent comment for the
# concrete example this exists for.
class DecisionCreateSchema(BaseModel):
    claim: str
    decision: str
    reasoning: Optional[str] = None


class DecisionOutcomeSchema(BaseModel):
    outcome_summary: str
    outcome_result: str


@app.post("/decisions")
async def create_decision(
    payload: DecisionCreateSchema,
    ctx: AuthContext = Depends(authorize("decision.write")),
):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)

    if ctx.principal_type == "agent" and ctx.requires_approval:
        approval = await repo.create_pending_approval(
            action="decision.write",
            resource="decisions",
            payload=payload.model_dump(),
            requested_by=ctx.principal_id,
        )
        await repo.write_audit_log({
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "actor": ctx.principal_id,
            "action": "decision.write.queued",
            "resource": "decisions",
            "details": {"approval_id": approval["id"]},
        })
        return {
            "status": "pending_approval",
            "approval_id": approval["id"],
            "message": "This key requires Owner approval before writes take effect. The Owner has been notified.",
        }

    decision = await repo.create_decision(payload.claim, payload.decision, payload.reasoning, ctx.principal_id)
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "decision.create",
        "resource": f"decisions/{decision['id']}",
        "decision": "PERMITTED",
    })
    return decision


@app.get("/decisions")
async def list_decisions(
    cursor: Optional[str] = None,
    limit: int = 50,
    ctx: AuthContext = Depends(authorize("decision.read")),
):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    items, next_cursor = await repo.list_decisions(limit=limit, cursor_id=cursor)
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "decision.read",
        "resource": "decisions",
        "decision": "PERMITTED",
    })
    return {"items": items, "next_cursor": next_cursor}


@app.put("/decisions/{decision_id}/outcome")
async def record_decision_outcome(
    decision_id: str,
    payload: DecisionOutcomeSchema,
    ctx: AuthContext = Depends(authorize("decision.write")),
):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    try:
        updated = await repo.record_decision_outcome(decision_id, payload.outcome_summary, payload.outcome_result)
    except ValueError as exc:
        raise HTTPException(404, detail=str(exc)) from exc
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "decision.outcome_recorded",
        "resource": f"decisions/{decision_id}",
        "details": {"outcome_result": payload.outcome_result},
    })
    return updated


# --- Sketchbooks ---
# Every principal - human or agent - gets its own notebook it can write to
# freely, no approval gate: isolation from every other owner's sketchbook
# is the safety boundary, not a gate on the write itself. Every stroke is
# audited the same as everything else. The Owner sees every sketchbook in
# the tenant (documentation, not restriction, is the whole point); one
# agent never sees another's content, only that something changed and when.
class SketchbookEntrySchema(BaseModel):
    topic: str
    content: str

@app.post("/sketchbook")
async def write_sketchbook(payload: SketchbookEntrySchema, ctx: AuthContext = Depends(authorize("sketchbook.write"))):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    entry = await repo.create_sketchbook_entry(ctx.principal_id, {"topic": payload.topic, "content": payload.content})
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "sketchbook.write",
        "resource": f"sketchbook/{ctx.principal_id}/{entry['id']}",
        "details": {"topic": payload.topic},
    })
    return entry

@app.get("/sketchbook")
async def read_own_sketchbook(ctx: AuthContext = Depends(authorize("sketchbook.read"))):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    items = await repo.list_own_sketchbook(ctx.principal_id)
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "sketchbook.read",
        "resource": f"sketchbook/{ctx.principal_id}",
        "decision": "PERMITTED",
    })
    return {"items": items}

@app.get("/sketchbook/all")
async def read_all_sketchbooks(ctx: AuthContext = Depends(authorize("sketchbook.read"))):
    if ctx.role != "Owner":
        raise HTTPException(403, detail="Only the Owner can read every sketchbook in the tenant")
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    items = await repo.list_all_sketchbooks()
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "sketchbook.read_all",
        "resource": "sketchbook/all",
        "decision": "PERMITTED",
    })
    return {"items": items}

@app.get("/sketchbook/feed")
async def sketchbook_activity_feed(ctx: AuthContext = Depends(authorize("sketchbook.read"))):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    items = await repo.list_sketchbook_activity()
    return {"items": items}


# --- Approval Queue (approval-gated agent keys) ---
# A key registered with requires_approval=true never writes directly - each
# attempted write above was captured as a pending_approvals row instead of
# executing. Nothing here runs on its own; the Owner decides every one of
# these individually. In-app only for now: there is no email/SMS provider
# wired into this deployment, so "notified" means visible in this list,
# not an actual message sent anywhere yet.
@app.get("/approvals")
async def list_approvals(
    status: Optional[str] = "pending",
    ctx: AuthContext = Depends(authorize("approval.read")),
):
    if ctx.role != "Owner":
        raise HTTPException(403, detail="Only the Owner can view the approval queue")
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    return {"items": await repo.list_pending_approvals(status=status)}


@app.post("/approvals/{approval_id}/approve")
async def approve_pending_action(
    approval_id: str,
    ctx: AuthContext = Depends(authorize("approval.decide")),
):
    if ctx.role != "Owner":
        raise HTTPException(403, detail="Only the Owner can approve a pending action")
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)

    approval = await repo.get_pending_approval(approval_id)
    if not approval:
        raise HTTPException(404, detail="Approval request not found")
    if approval["status"] != "pending":
        raise HTTPException(409, detail=f"Approval request is already '{approval['status']}'")

    payload = approval["payload"]
    result: Dict[str, Any]

    if approval["action"] == "context.write":
        result = await repo.set_business_context(payload)
    elif approval["action"] == "decision.write":
        result = await repo.create_decision(payload["claim"], payload["decision"], payload.get("reasoning"), approval["requested_by"])
    elif approval["action"] == "memory.write":
        mem_id = f"mem_{uuid.uuid4().hex}"
        redacted_content, pii_classes = detect_and_redact_pii(payload["content"])
        emb = await embed_text(redacted_content)
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        requester_atom = await repo.get_atom(approval["requested_by"])
        requester_fleet_id = requester_atom.get("fleet_id") if requester_atom else None
        mem_data = {
            "id": mem_id,
            "topic": payload["topic"],
            "region": payload["region"],
            "classification": payload["classification"],
            "content_redacted": redacted_content,
            "embedding": Vector(emb),
            "embedding_model": EMBEDDING_MODEL,
            "embedding_dimension": EMBEDDING_DIM,
            "version": 1,
            "is_superseded": False,
            "created_at": now_iso,
            "updated_at": now_iso,
            "metadata": {
                "source_query": "Approved agent write",
                "domain": "Enterprise",
                "tags": ["manual", payload["region"].lower()],
                "pii_classes": pii_classes,
                "subject_ids": payload.get("subject_ids", []),
                "provenance": {
                    "atom_id": approval["requested_by"],
                    "fleet_id": requester_fleet_id,
                    "timestamp": now_iso,
                },
            },
            "source": "api_entry",
        }
        await repo.create_memory(mem_data)
        result = {"id": mem_id, "status": "created", "pii_classes": pii_classes}
    else:
        raise HTTPException(500, detail=f"Unknown pending action type '{approval['action']}'")

    await repo.resolve_pending_approval(approval_id, "approved", ctx.principal_id)
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": f"{approval['action']}.approved",
        "resource": approval["resource"],
        "details": {"approval_id": approval_id, "requested_by": approval["requested_by"]},
    })
    return {"status": "approved", "approval_id": approval_id, "result": result}


@app.post("/approvals/{approval_id}/deny")
async def deny_pending_action(
    approval_id: str,
    ctx: AuthContext = Depends(authorize("approval.decide")),
):
    if ctx.role != "Owner":
        raise HTTPException(403, detail="Only the Owner can deny a pending action")
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    try:
        approval = await repo.resolve_pending_approval(approval_id, "denied", ctx.principal_id)
    except ValueError as exc:
        raise HTTPException(404, detail=str(exc)) from exc
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": f"{approval['action']}.denied",
        "resource": approval["resource"],
        "details": {"approval_id": approval_id, "requested_by": approval["requested_by"]},
    })
    return {"status": "denied", "approval_id": approval_id}


# Serve the built frontend (frontend/dist, copied into the image by the
# Dockerfile) from the same Cloud Run service as the API, so no separate
# hosting product or deploy path is needed. Registered last so every API
# route above takes priority; unmatched paths fall back to index.html for
# client-side routing.
class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise


_frontend_dist = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_frontend_dist):
    app.mount("/", SPAStaticFiles(directory=_frontend_dist, html=True), name="frontend")
