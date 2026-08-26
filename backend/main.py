from contextlib import asynccontextmanager
import asyncio
import datetime
import hashlib
import json
import logging
import os
import time
import uuid

from fastapi import FastAPI, HTTPException, Depends, Request, Response
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
)
from core.rate_limiter import rate_limiter
from services.repository import TenantScopedRepository, GlobalRepository
from services.policy_engine import PolicyEngine, authorize
from services.directory_fetcher import run_ingestion, embed_text
from core.embedding_config import EMBEDDING_MODEL, EMBEDDING_DIM
from services.chat_handler import handle_chat
from fixtures.synthetic_enterprise import get_synthetic_fixture_records
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
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
        try:
            state = await GlobalRepository().get_ingestion_state()
            if not state.get("completed") and not state.get("is_ingesting"):
                await run_ingestion()
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


@app.get("/debug/auth-fingerprint")
async def debug_auth_fingerprint():
    # TEMPORARY diagnostic — never returns the actual credential, only a
    # truncated hash fingerprint, so a login mismatch can be compared
    # against `echo -n '<value>' | sha256sum` without exposing the secret
    # itself. Remove once the DEMO_USERNAME/DEMO_PASSWORD mismatch is
    # resolved; this should not stay in a shipped build.
    from core.security import DEMO_USERNAME as _u, DEMO_PASSWORD as _p
    return {
        "demo_username_fingerprint": hashlib.sha256(_u.encode()).hexdigest()[:12],
        "demo_password_fingerprint": hashlib.sha256(_p.encode()).hexdigest()[:12],
        "demo_username_length": len(_u),
        "demo_password_length": len(_p),
    }


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
                "A tenant-scoped agent registry with policy-aware, "
                "residency-enforced, grounded memory recall."
            ),
            "human_reception": "/reception",
            "agent_handshake": "/v1/reception/agents/handshake",
            "human_login": "/auth/login",
            "capabilities": "/v1/capabilities",
            "openapi": "/openapi.json",
            "docs": "/docs",
            "llms_txt": "/llms.txt",
            "health": "/healthz",
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
> Google Cloud (Cloud Run, Firestore, Vertex AI / Gemini 3.5-flash).

Every route that reads or writes tenant data requires an authorization
policy check; memory and recall results are filtered by classification
and region, failing closed on missing metadata. No claim in a response
is stated without being traceable to something actually stored.

## Start here

- Discovery manifest: GET / with `Accept: application/json`
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
- Health check: /healthz

## Source & documentation

- Repository: https://github.com/comfortcurators/Curatom
- Hardening status (what's proven vs. still a prototype): https://github.com/comfortcurators/Curatom/blob/main/HARDENING_STATUS.md
- Validation record: https://github.com/comfortcurators/Curatom/blob/main/VALIDATION.md
- Citable release: https://zenodo.org/records/22112980
- License: AGPL-3.0-only

## Policy notes for agents

- Public, no credential needed: /, /v1/reception/agents/handshake,
  /v1/capabilities, /healthz, /llms.txt, /docs, /openapi.json, and the
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
    return [
        {"tenant_id": "tenant_apac_enterprise", "name": "APAC Fleet Cohort", "region": "SG"},
        {"tenant_id": "tenant_emea_subsidiary", "name": "EMEA Fleet Cohort", "region": "EU"},
        {"tenant_id": "tenant_us_travelcorp", "name": "US TravelCorp Cohort", "region": "US"}
    ]

@app.get("/fleets")
async def list_fleets(
    cursor: Optional[str] = None, 
    limit: int = 50,
    ctx: AuthContext = Depends(authorize("fleet.read"))
):
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    items, next_cursor = await repo.list_fleets(limit=limit, cursor_id=cursor)
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
        "error_rate_pct": 0.0
    }

# --- Atoms Registry ---
class AtomRegisterSchema(BaseModel):
    name: str
    fleet_id: str
    model_family: str
    role: str
    description: str
    labels: Dict[str, str] = Field(default_factory=dict)

@app.post("/atoms/register")
async def register_atom(
    atom: AtomRegisterSchema,
    ctx: AuthContext = Depends(authorize("atom.create"))
):
    await rate_limiter.check_rate_limit(ctx.org_id, ctx.tenant_id, 100)
    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)

    fleet = await repo.get_fleet(atom.fleet_id)
    if not fleet:
        raise HTTPException(404, f"Fleet '{atom.fleet_id}' not found")

    default_profile = fleet.get("default_profile", {})
    derived_profile = {
        "format": default_profile.get("format", "JSON"),
        "retention_window_hours": default_profile.get("retention_window_hours", 168),
        "accuracy_tolerance": default_profile.get("accuracy_tolerance", "High"),
        "system_persona": default_profile.get("system_persona", "You are a precise enterprise agent."),
        "max_output_tokens": default_profile.get("max_output_tokens", 2048),
        "permitted_regions": default_profile.get("permitted_regions", ["SG", "US", "IN", "EU"]),
        "classification_ceiling": default_profile.get("classification_ceiling", "internal"),
        "version": 1
    }

    atom_id = f"atom_{uuid.uuid4().hex}"
    raw_key = f"{atom_id}.{uuid.uuid4().hex}"
    hashed = hash_key(raw_key)

    atom_data = {
        "id": atom_id,
        "name": atom.name,
        "fleet_id": atom.fleet_id,
        "model_family": atom.model_family,
        "role": atom.role,
        "description": atom.description,
        "labels": atom.labels,
        "profile": derived_profile,
        "status": "active",
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

    # 4. Vector Grounding Excerpt Retrieval from Global Directory
    query_emb = await embed_text(req.query)
    grounding_excerpts = await global_repo.search_excerpts_by_model(atom.get("model_family", ""), query_emb, limit=3)
    
    grounding_sources = []
    grounding_context = ""
    for ge in grounding_excerpts:
        if ge.get("source_url"):
            grounding_sources.append({"uri": ge["source_url"], "title": ge.get("section_title", "Doc Excerpt")})
        if ge.get("text"):
            grounding_context += ge["text"] + "\n"

    # 5. SHA256 Reshape Caching
    profile_hash = hashlib.sha256(json.dumps(atom["profile"], sort_keys=True).encode()).hexdigest()[:16]
    normalized_query = " ".join(req.query.lower().split())
    cache_key = hashlib.sha256(f"{memory['id']}:{memory.get('version', 1)}:{profile_hash}:{normalized_query}".encode()).hexdigest()
    
    cached = await repo.get_cache(cache_key)
    if cached and not is_stale:
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
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
            "grounding_sources": grounding_sources,
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
            "grounding_sources": grounding_sources,
            "tokens_consumed": 0,
            "token_metering_method": "cache",
            "request_id": req_id
        }

    # 6. Dual PII Guard: Prompt strictly consumes content_redacted & grounding_context
    prompt = (
        f"You are Curatom Adaptive Reshaping Engine for fleet '{settings.ENTERPRISE_NAME}'.\n"
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
    mem_id = f"mem_{uuid.uuid4().hex}"
    
    redacted_content, pii_classes = detect_and_redact_pii(mem.content)
    emb = await embed_text(redacted_content)
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
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
                "atom_id": ctx.principal_id,
                "fleet_id": "fleet_core_apac",
                "timestamp": now_iso
            }
        },
        "source": "api_entry"
    }
    
    await repo.create_memory(mem_data)

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
    filtered = [
        memory
        for memory in items
        if _memory_is_visible_to(ctx, memory)
    ]
    return {"items": filtered, "next_cursor": next_cursor}

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
    
    return {
        "total_models": state.get("models_ingested", 0),
        "total_excerpts": excerpts_count,
        "is_ingesting": state.get("is_ingesting", False),
        "last_run": state.get("last_run"),
        "cache_hit_rate_pct": round(hit_rate, 2),
        "total_cache_hits": total_hits,
        "total_cache_lookups": total_lookups
    }

@app.post("/directory/ingest")
async def trigger_ingest(ctx: AuthContext = Depends(authorize("directory.ingest"))):
    global_repo = GlobalRepository()
    state = await global_repo.get_ingestion_state()
    if state.get("is_ingesting"):
        raise HTTPException(409, detail="Ingestion already in progress")

    asyncio.create_task(run_ingestion())

    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "directory.ingest",
        "resource": "global/directory",
        "reason": "Operator triggered directory ingestion"
    })

    return {"status": "Ingestion initiated"}

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

@app.post("/ask")
async def ask_query(
    req: ChatRequest,
    ctx: AuthContext = Depends(authorize("recall.execute"))
):
    atom_key = ctx.principal_id if ctx.principal_type == "agent" else None
    return await handle_chat(req.query, ctx.role, atom_key, ctx.tenant_id, ctx.org_id)

# --- Synthetic Enterprise Proving Ground Fixture ---
@app.post("/fixtures/load-synthetic")
async def load_synthetic_fixture(ctx: AuthContext = Depends(authorize("atom.create"))):
    if ctx.role != "Owner":
        raise HTTPException(403, detail="Fixture loading restricted to Owner")

    repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
    records = get_synthetic_fixture_records(ctx.org_id, ctx.tenant_id)
    loaded_count = 0
    
    for item in records:
        redacted, pii = detect_and_redact_pii(item["content"])
        emb = await embed_text(redacted)
        
        await repo.create_memory({
            "id": item["id"],
            "region": item["region"],
            "topic": item["topic"],
            "classification": item["classification"],
            "content_redacted": redacted,
            "embedding": Vector(emb),
            "embedding_model": EMBEDDING_MODEL,
            "embedding_dimension": EMBEDDING_DIM,
            "version": 1,
            "is_superseded": False,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "metadata": {
                **item["metadata"],
                "pii_classes": pii
            },
            "source": item["source"]
        })
        loaded_count += 1

    await repo.write_audit_log({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": ctx.principal_id,
        "action": "fixtures.load-synthetic",
        "resource": f"tenant/{ctx.tenant_id}",
        "details": {"loaded_records": loaded_count}
    })
        
    return {
        "status": "success",
        "loaded_records": loaded_count,
        "label": "SYNTHETIC LOAD-TEST FIXTURE — NOT COMPANY FACTS"
    }


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
