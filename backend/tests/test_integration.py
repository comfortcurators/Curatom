import os
import sys
from pathlib import Path
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
from core.security import AuthContext
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
    assert EMBEDDING_MODEL == "gemini-embedding-2"
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
    assert EMBEDDING_MODEL == "gemini-embedding-2"
