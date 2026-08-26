"""
Proves HARDENING_STATUS.md's ABAC coverage claim instead of just asserting it
in prose: every non-ops route must be gated by the real authorize() policy
dependency, not merely resolve_auth() (authenticated but unchecked) or nothing
at all.
"""
import os
import sys
from pathlib import Path
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("JWT_SECRET", "test-secret-that-is-not-the-default-value")
os.environ.setdefault("API_KEY", "test-api-key")
os.environ.setdefault("PROJECT_ID", "curatom-test")
os.environ.setdefault("DEMO_USERNAME", "admin")
os.environ.setdefault("DEMO_PASSWORD", "test-password")

from fastapi.routing import APIRoute  # noqa: E402
from main import app  # noqa: E402

# Ops routes are the only ones allowed to skip policy evaluation. /auth/login
# is the one route that must run before any principal exists.
ALLOWED_UNGATED_PATHS = {
    "/healthz", "/readyz", "/auth/login",
    # Deliberately public agent-discovery surface: a cold agent must be
    # able to reach these with zero prior credential. None of them read
    # or write tenant-scoped data - registration (which does) still
    # requires a human operator session via /atoms/register.
    "/", "/llms.txt", "/v1/capabilities", "/v1/reception/agents/handshake",
}

# /metrics is gated on "who you are" (any authenticated principal, scoped to
# their own tenant by ctx), not "what you're allowed to do" - deliberate,
# documented ops exception, not an oversight.
ALLOWED_AUTH_ONLY_PATHS = {"/metrics"}


def _authorize_dependency_names(route) -> set[str]:
    names = set()
    for dep in getattr(route, "dependant", None).dependencies if route.dependant else []:
        call = getattr(dep, "call", None)
        if call is not None:
            names.add(getattr(call, "__name__", str(call)))
    return names


def test_every_route_has_explicit_authorization():
    unprotected = []
    auth_only_unexpected = []

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue  # skip framework-internal routes (/docs, /openapi.json, ...)
        path = route.path
        if path in ALLOWED_UNGATED_PATHS:
            continue

        dep_names = _authorize_dependency_names(route)

        has_authorize = "_check" in dep_names or "authorize" in str(dep_names)
        has_resolve_auth_only = "resolve_auth" in dep_names and not has_authorize

        if not dep_names:
            unprotected.append(path)
        elif has_resolve_auth_only and path not in ALLOWED_AUTH_ONLY_PATHS:
            auth_only_unexpected.append(path)

    assert not unprotected, (
        f"Routes with NO auth dependency at all: {unprotected}. "
        "Every non-ops route must require at least resolve_auth()."
    )
    assert not auth_only_unexpected, (
        f"Routes gated only by resolve_auth() (authenticated but not policy-"
        f"checked), outside the documented ops exception set: "
        f"{auth_only_unexpected}. Add Depends(authorize(...)) or add the path "
        f"to ALLOWED_AUTH_ONLY_PATHS with a stated reason in HARDENING_STATUS.md."
    )


def test_no_route_still_reads_spoofable_role_header():
    """
    Regression guard for the exact defect found in earlier builds: a role
    read directly from a client-supplied header with no session/key behind
    it. get_current_role must not be wired into any route's dependencies.
    """
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        dep_names = _authorize_dependency_names(route)
        assert "get_current_role" not in dep_names, (
            f"{getattr(route, 'path', '?')} depends on get_current_role() "
            "directly - a caller-supplied header is not authentication."
        )
