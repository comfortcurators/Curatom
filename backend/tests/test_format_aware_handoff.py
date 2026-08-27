"""
Unit tests for render_for_principal - the format-aware hand-off that gives
each agent its business context in the shape its own derived profile says
it parses best, instead of always JSON. No Firestore needed: these test the
pure formatting function directly.
"""
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Required config must be set before importing the FastAPI application.
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-not-the-default-value")
os.environ.setdefault("API_KEY", "test-api-key")
os.environ.setdefault("PROJECT_ID", "curatom-test")
os.environ.setdefault("DEMO_USERNAME", "admin")
os.environ.setdefault("DEMO_PASSWORD", "test-password")
os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")

import yaml
from core.security import AuthContext
from main import render_for_principal

PAYLOAD = {"onboarded": True, "context": {"business_name": "Acme", "what_you_do": "Widgets"}}


def _ctx(principal_type: str, profile=None) -> AuthContext:
    return AuthContext(
        principal_id="p1",
        principal_type=principal_type,
        org_id="org_1",
        tenant_id="tenant_1",
        role="Owner" if principal_type == "human" else "Agent",
        permitted_regions=["US"],
        atom_profile=profile,
    )


def test_human_session_always_gets_plain_json():
    result = render_for_principal(PAYLOAD, _ctx("human"))
    assert result == PAYLOAD


def test_agent_with_no_profile_gets_plain_json():
    result = render_for_principal(PAYLOAD, _ctx("agent", profile=None))
    assert result == PAYLOAD


def test_agent_with_json_format_gets_plain_json():
    result = render_for_principal(PAYLOAD, _ctx("agent", profile={"format": "JSON"}))
    assert result == PAYLOAD


def test_agent_with_yaml_format_gets_real_yaml():
    result = render_for_principal(PAYLOAD, _ctx("agent", profile={"format": "YAML"}))
    assert result.media_type == "application/yaml"
    parsed = yaml.safe_load(result.body)
    assert parsed == PAYLOAD


def test_agent_with_markdown_format_gets_markdown():
    result = render_for_principal(PAYLOAD, _ctx("agent", profile={"format": "Markdown"}))
    assert result.media_type == "text/markdown"
    text = result.body.decode("utf-8")
    assert "**business_name**: Acme" in text
