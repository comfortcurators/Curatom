import os
import sys
from pathlib import Path
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Required config must be set before importing the FastAPI application.
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-not-the-default-value")
os.environ.setdefault("API_KEY", "test-api-key")
os.environ.setdefault("PROJECT_ID", "curatom-test")
os.environ.setdefault("DEMO_USERNAME", "admin")
os.environ.setdefault("DEMO_PASSWORD", "test-password")
# Avoid Application Default Credentials discovery during local tests.
os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")

from fastapi.testclient import TestClient
from main import app, _memory_is_visible_to
from core.security import AuthContext, resolve_auth
from services.repository import TenantScopedRepository
from core.rate_limiter import _scope_key

client = TestClient(app)



def _without_rate_limit_store():
    return patch("main.rate_limiter.check_rate_limit", new=AsyncMock(return_value=None))

def _owner_token() -> str:
    with _without_rate_limit_store():
        response = client.post(
            "/auth/login",
            json={"username": "admin", "password": os.environ["DEMO_PASSWORD"]},
        )
    assert response.status_code == 200
    return response.json()["session_token"]


def _without_stored_policies():
    """Keep authorization local: Owner fallback is evaluated without Firestore I/O."""
    return patch.object(TenantScopedRepository, "list_policies", new=AsyncMock(return_value=[]))


def test_auth_rejects_wrong_password():
    with _without_rate_limit_store():
        response = client.post("/auth/login", json={"username": "admin", "password": "wrong"})
    assert response.status_code == 401


def test_auth_rejects_arbitrary_username_even_with_demo_password():
    with _without_rate_limit_store():
        response = client.post(
            "/auth/login",
            json={"username": "someone-else", "password": os.environ["DEMO_PASSWORD"]},
        )
    assert response.status_code == 401


def test_auth_accepts_env_password():
    with _without_rate_limit_store():
        response = client.post(
            "/auth/login",
            json={"username": "admin", "password": os.environ["DEMO_PASSWORD"]},
        )
    assert response.status_code == 200
    assert "session_token" in response.json()


def test_atoms_requires_auth():
    response = client.get("/atoms")
    assert response.status_code in [401, 403]


def test_tasks_are_explicitly_disabled_for_authenticated_owner():
    token = _owner_token()
    with _without_stored_policies():
        response = client.post(
            "/tasks",
            headers={"Authorization": f"Bearer {token}"},
            json={"goal": "test durable task"},
        )
    assert response.status_code == 501
    assert response.json()["detail"]["code"] == "not_implemented"


def test_classification_validation_returns_422_before_backend_write():
    token = _owner_token()
    with _without_stored_policies():
        response = client.post(
            "/memories",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "topic": "test",
                "content": "safe",
                "region": "SG",
                "classification": "unknown",
            },
        )
    assert response.status_code == 422


def test_region_validation_returns_422_before_backend_write():
    token = _owner_token()
    with _without_stored_policies():
        response = client.post(
            "/memories",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "topic": "test",
                "content": "safe",
                "region": "MARS",
                "classification": "internal",
            },
        )
    assert response.status_code == 422


def test_embedding_configuration_matches_firestore_index():
    from services.directory_fetcher import EMBEDDING_DIM, EMBEDDING_MODEL
    assert EMBEDDING_MODEL == "gemini-embedding-001"
    assert EMBEDDING_DIM == 768


def test_rate_limit_scope_includes_org_and_tenant():
    assert _scope_key("org-a", "tenant") != _scope_key("org-b", "tenant")


def test_login_rate_limit_is_five_rpm_per_client_ip():
    limiter = AsyncMock(return_value=None)
    with patch("main.rate_limiter.check_rate_limit", new=limiter):
        response = client.post(
            "/auth/login",
            json={"username": "admin", "password": os.environ["DEMO_PASSWORD"]},
        )
    assert response.status_code == 200
    args, kwargs = limiter.await_args
    assert args[0] == "auth"
    assert args[1].startswith("ip:")
    assert kwargs["max_rpm"] == 5


def test_login_uses_first_forwarded_ip_for_rate_limit_scope():
    limiter = AsyncMock(return_value=None)
    with patch("main.rate_limiter.check_rate_limit", new=limiter):
        response = client.post(
            "/auth/login",
            headers={"X-Forwarded-For": "203.0.113.10, 10.0.0.2"},
            json={"username": "admin", "password": os.environ["DEMO_PASSWORD"]},
        )
    assert response.status_code == 200
    args, _kwargs = limiter.await_args
    assert args[1] == "ip:203.0.113.10"


def test_memory_visibility_enforces_classification_and_region():
    context = AuthContext(
        principal_id="atom_test",
        principal_type="agent",
        org_id="org_test",
        tenant_id="tenant_test",
        role="Agent",
        permitted_regions=["SG"],
        classification_ceiling="internal",
    )

    assert _memory_is_visible_to(
        context, {"classification": "public", "region": "SG"}
    )
    assert not _memory_is_visible_to(
        context, {"classification": "confidential", "region": "SG"}
    )
    assert not _memory_is_visible_to(
        context, {"classification": "internal", "region": "US"}
    )
    assert not _memory_is_visible_to(context, {"classification": "internal"})


def test_firestore_vector_indexes_match_embedding_contract():
    import json
    from pathlib import Path
    from core.embedding_config import EMBEDDING_DIM, EMBEDDING_MODEL

    indexes_path = Path(__file__).resolve().parents[2] / "frontend" / "firestore.indexes.json"
    payload = json.loads(indexes_path.read_text())
    vector_indexes = [
        idx for idx in payload["indexes"]
        if any("vectorConfig" in field for field in idx.get("fields", []))
    ]

    memory_indexes = [idx for idx in vector_indexes if idx["collectionGroup"] == "memories"]
    excerpt_indexes = [idx for idx in vector_indexes if idx["collectionGroup"] == "excerpts"]
    assert memory_indexes
    assert len(excerpt_indexes) >= 2  # model-scoped and global fallback searches

    def assert_embedding_contract(idx):
        by_name = {field["fieldPath"]: field for field in idx["fields"]}
        assert by_name["embedding_model"]["order"] == "ASCENDING"
        assert by_name["embedding_dimension"]["order"] == "ASCENDING"
        assert by_name["embedding"]["vectorConfig"]["dimension"] == EMBEDDING_DIM

    for idx in memory_indexes + excerpt_indexes:
        assert_embedding_contract(idx)

    assert any("model_id" in {f["fieldPath"] for f in idx["fields"]} for idx in excerpt_indexes)
    assert any("model_id" not in {f["fieldPath"] for f in idx["fields"]} for idx in excerpt_indexes)
    assert EMBEDDING_MODEL == "gemini-embedding-001"


# ---------------------------------------------------------------------------
# Tenant isolation
#
# The repository is constructed with an org_id/tenant_id and filters every
# query on both. These prove a caller authenticated into one tenant cannot
# reach another tenant's records through the HTTP surface — the guarantee
# TenantScopedRepository's docstring claims.
# ---------------------------------------------------------------------------

def _alien_tenant_context() -> AuthContext:
    """An Owner — maximum in-tenant privilege — but in a DIFFERENT tenant."""
    return AuthContext(
        principal_id="owner_alien",
        principal_type="human",
        org_id="org_alien",
        tenant_id="tenant_alien",
        role="Owner",
        permitted_regions=["SG"],
        classification_ceiling="restricted",
    )


def _no_stored_policies():
    """Evaluate authorization without Firestore I/O (Owner fallback applies)."""
    return patch.object(
        TenantScopedRepository, "list_policies", new=AsyncMock(return_value=[])
    )


@contextmanager
def _alien_principal():
    """
    Override the resolved principal at the FastAPI dependency layer.

    patch("main.resolve_auth") does NOT work here: FastAPI captures the
    dependency callable when the route is declared, so rebinding the module
    attribute afterwards has no effect and the request falls through to real
    authentication (and then a real Firestore call, which hangs).
    dependency_overrides is the supported interception point.
    """
    app.dependency_overrides[resolve_auth] = _alien_tenant_context
    try:
        yield
    finally:
        app.dependency_overrides.pop(resolve_auth, None)


@contextmanager
def _empty_atom_listing():
    """Record the org/tenant the repository was scoped to; return no rows."""
    spy = {}
    original_init = TenantScopedRepository.__init__

    def capturing_init(self, org_id, tenant_id, *args, **kwargs):
        spy["org_id"], spy["tenant_id"] = org_id, tenant_id
        original_init(self, org_id, tenant_id, *args, **kwargs)

    with patch.object(TenantScopedRepository, "__init__", capturing_init), \
         patch.object(TenantScopedRepository, "list_atoms",
                      new=AsyncMock(return_value=([], None))):
        yield spy


@contextmanager
def _empty_memory_listing():
    spy = {}
    original_init = TenantScopedRepository.__init__

    def capturing_init(self, org_id, tenant_id, *args, **kwargs):
        spy["org_id"], spy["tenant_id"] = org_id, tenant_id
        original_init(self, org_id, tenant_id, *args, **kwargs)

    with patch.object(TenantScopedRepository, "__init__", capturing_init), \
         patch.object(TenantScopedRepository, "list_memories",
                      new=AsyncMock(return_value=([], None))):
        yield spy


def test_tenant_isolation_atoms_returns_only_own_tenant():
    with _alien_principal(), _no_stored_policies(), _empty_atom_listing() as spy:
        response = client.get("/atoms")
    assert response.status_code == 200
    assert response.json()["items"] == []
    # The repository must have been constructed for the ALIEN tenant, never
    # the tenant whose data exists.
    assert spy["org_id"] == "org_alien"
    assert spy["tenant_id"] == "tenant_alien"


def test_tenant_isolation_memories_returns_only_own_tenant():
    with _alien_principal(), _no_stored_policies(), _empty_memory_listing() as spy:
        response = client.get("/memories")
    assert response.status_code == 200
    assert response.json()["items"] == []
    assert spy["org_id"] == "org_alien"
    assert spy["tenant_id"] == "tenant_alien"


# ---------------------------------------------------------------------------
# Subject erasure
#
# Deleting the memory but leaving its derived cache entries, recall payloads,
# or task records behind would be a compliance failure — the erasure receipt
# would claim something untrue. This proves .delete() is actually called on
# every discovered document across all four collections, and that the
# post-deletion verification query comes back empty.
# ---------------------------------------------------------------------------

def test_subject_erasure_cascades_and_verifies_empty():
    import asyncio
    from unittest.mock import MagicMock

    repo = TenantScopedRepository("org_test", "tenant_test")
    subject_id = "subj_erasure_verification"

    def _doc(doc_id):
        d = MagicMock()
        d.id = doc_id
        d.reference = AsyncMock()
        return d

    class _Query:
        def __init__(self, docs):
            self._docs = docs

        def where(self, *args, **kwargs):
            return self

        async def get(self):
            return self._docs

    mem_doc, cache_doc = _doc("mem_1"), _doc("cache_1")
    recall_doc, task_doc = _doc("recall_1"), _doc("task_1")
    corpus_doc = _doc("corpus_1")

    seen = []

    def _collection(name):
        seen.append(name)
        nth = seen.count(name)
        # First query per collection finds the records; the second is the
        # post-deletion verification sweep and must come back empty.
        if name == "memories":
            return _Query([mem_doc] if nth == 1 else [])
        if name == "cache":
            return _Query([cache_doc] if nth == 1 else [])
        if name == "recalls":
            return _Query([recall_doc] if nth == 1 else [])
        if name == "tasks":
            return _Query([task_doc] if nth == 1 else [])
        if name == "training_corpus":
            return _Query([corpus_doc] if nth == 1 else [])
        return _Query([])

    mock_db = MagicMock()
    mock_db.collection = MagicMock(side_effect=_collection)

    with patch.object(repo, "db", mock_db):
        result = asyncio.run(repo.delete_subject_cascade(subject_id))

    assert result["deleted_memories_count"] == 1
    assert result["purged_cache_entries"] == 1
    assert result["purged_recall_logs"] == 1
    assert result["purged_task_records"] == 1
    assert result["purged_training_corpus_entries"] == 1

    # The receipt is only honest if the deletes actually happened.
    mem_doc.reference.delete.assert_awaited_once()
    cache_doc.reference.delete.assert_awaited_once()
    recall_doc.reference.delete.assert_awaited_once()
    task_doc.reference.delete.assert_awaited_once()
    corpus_doc.reference.delete.assert_awaited_once()


# ---------------------------------------------------------------------------
# Training-corpus consent: opt-in writes a de-identified copy, opt-out
# purges every copy the tenant ever contributed, not just future writes.
# ---------------------------------------------------------------------------

def test_training_corpus_entry_carries_no_direct_tenant_identifier_on_the_document():
    import asyncio
    from unittest.mock import MagicMock

    repo = TenantScopedRepository("org_test", "tenant_test")
    written = {}

    class _DocRef:
        def __init__(self, doc_id):
            self.doc_id = doc_id

        async def set(self, data):
            written["data"] = data

    class _Collection:
        def document(self, doc_id):
            return _DocRef(doc_id)

    mock_db = MagicMock()
    mock_db.collection = MagicMock(return_value=_Collection())

    with patch.object(repo, "db", mock_db):
        asyncio.run(repo.write_training_corpus_entry("mem_abc", {
            "content_redacted": "some redacted content",
            "topic": "t",
            "region": "US",
            "classification": "internal",
            "pii_classes": [],
            "created_at": "2026-01-01T00:00:00+00:00",
        }))

    data = written["data"]
    assert data["content_redacted"] == "some redacted content"
    assert "org_id" not in data
    assert "tenant_id" not in data
    # The linkage exists, but only inside source_ref - not at the top level
    # where a naive read of the document would surface it.
    assert data["source_ref"] == {"org_id": "org_test", "tenant_id": "tenant_test", "memory_id": "mem_abc"}


def test_opting_out_purges_every_corpus_entry_for_the_tenant():
    import asyncio
    from unittest.mock import MagicMock

    repo = TenantScopedRepository("org_test", "tenant_test")

    def _doc(doc_id):
        d = MagicMock()
        d.id = doc_id
        d.reference = AsyncMock()
        return d

    class _Query:
        def __init__(self, docs):
            self._docs = docs

        def where(self, *args, **kwargs):
            return self

        async def get(self):
            return self._docs

    corpus_docs = [_doc("corpus_1"), _doc("corpus_2")]
    mock_db = MagicMock()
    mock_db.collection = MagicMock(return_value=_Query(corpus_docs))

    with patch.object(repo, "db", mock_db):
        purged = asyncio.run(repo.purge_training_corpus_for_tenant())

    assert purged == 2
    for d in corpus_docs:
        d.reference.delete.assert_awaited_once()


# ---------------------------------------------------------------------------
# /tasks stays honestly disabled
#
# HARDENING_STATUS.md states durable task execution is not implemented. These
# guard against a future change quietly turning 501 into a fake success — the
# exact "mechanism that claims more than it does" pattern this codebase spent
# nine builds removing.
# ---------------------------------------------------------------------------

def test_tasks_list_returns_501():
    token = _owner_token()
    with _no_stored_policies():
        response = client.get("/tasks", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 501
    assert response.json()["detail"]["code"] == "not_implemented"


def test_tasks_get_returns_501():
    token = _owner_token()
    with _no_stored_policies():
        response = client.get(
            "/tasks/task-123", headers={"Authorization": f"Bearer {token}"}
        )
    assert response.status_code == 501
    assert response.json()["detail"]["code"] == "not_implemented"


# ---------------------------------------------------------------------------
# Auditor and Technical Reviewer had a deny-only rule for their restriction
# (rules 3/4 in policy_engine.py) but no matching baseline ALLOW for the
# lane itself, so both roles were locked out of everything - including the
# read/audit actions their role exists for. Found live via the Policy
# Simulator: Auditor denied on its own audit.read; Technical Reviewer
# denied on memory.read.
# ---------------------------------------------------------------------------

def test_auditor_can_read_audit_log():
    token = _owner_token()
    with _no_stored_policies():
        response = client.post(
            "/policies/simulate",
            json={"principal": "Auditor", "action": "audit.read", "resource": "audit/x"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.json()["allowed"] is True


def test_auditor_can_read_directory():
    token = _owner_token()
    with _no_stored_policies():
        response = client.post(
            "/policies/simulate",
            json={"principal": "Auditor", "action": "directory.read", "resource": "directory/x"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.json()["allowed"] is True


def test_auditor_still_cannot_write_memory():
    token = _owner_token()
    with _no_stored_policies():
        response = client.post(
            "/policies/simulate",
            json={"principal": "Auditor", "action": "memory.write", "resource": "memories/x"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.json()["allowed"] is False


def test_technical_reviewer_can_read_memory():
    token = _owner_token()
    with _no_stored_policies():
        response = client.post(
            "/policies/simulate",
            json={"principal": "Technical Reviewer", "action": "memory.read", "resource": "memories/x"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.json()["allowed"] is True


def test_technical_reviewer_still_cannot_write():
    token = _owner_token()
    with _no_stored_policies():
        response = client.post(
            "/policies/simulate",
            json={"principal": "Technical Reviewer", "action": "atom.create", "resource": "atoms/x"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.json()["allowed"] is False


# ---------------------------------------------------------------------------
# Fleet health used to hardcode error_rate_pct to 0.0 - a confident-looking
# real percentage next to an honestly-labeled "unknown" health_status, with
# no actual error tracking behind it (a recall failure like a residency
# denial raises before any log is ever written, so there's nothing to
# compute a rate from). null until that data source exists.
# ---------------------------------------------------------------------------

def test_fleet_health_does_not_fabricate_an_error_rate():
    token = _owner_token()
    fleet = {"fleet_id": "fleet_test", "org_id": "org_test", "tenant_id": "tenant_test"}
    with _no_stored_policies(), \
         patch.object(TenantScopedRepository, "get_fleet", new=AsyncMock(return_value=fleet)), \
         patch.object(TenantScopedRepository, "list_atoms", new=AsyncMock(return_value=([], None))):
        response = client.get("/fleets/fleet_test/health", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert body["error_rate_pct"] is None


def test_fleets_list_includes_fleet_id_alongside_stored_id():
    # Every fleet document stores its primary key as "id" (same as every
    # other collection here), but the frontend's Fleet type - and every
    # call site using it, api.getFleetHealth(f.fleet_id) chief among them -
    # has always expected "fleet_id". Without this alias f.fleet_id is
    # undefined, api.getFleetHealth(undefined) 404s, and the whole health
    # panel fails silently (console.error only) for every fleet, always.
    token = _owner_token()
    stored_fleet = {"id": "fleet_abc123", "name": "Default", "org_id": "org_test", "tenant_id": "tenant_test"}
    with _no_stored_policies(), \
         patch.object(TenantScopedRepository, "list_fleets", new=AsyncMock(return_value=([stored_fleet], None))):
        response = client.get("/fleets", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["id"] == "fleet_abc123"
    assert item["fleet_id"] == "fleet_abc123"
