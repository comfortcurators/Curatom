"""
Unit tests for is_ingestion_stale - the self-healing check that lets a fresh
container retry directory ingestion after a previous run was killed mid-flight
(e.g. by a deploy) and left is_ingesting stuck at True forever. No Firestore
needed: pure function over a state dict.
"""
import os
import sys
import datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("JWT_SECRET", "test-secret-that-is-not-the-default-value")
os.environ.setdefault("API_KEY", "test-api-key")
os.environ.setdefault("PROJECT_ID", "curatom-test")
os.environ.setdefault("DEMO_USERNAME", "admin")
os.environ.setdefault("DEMO_PASSWORD", "test-password")
os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")

from services.directory_fetcher import is_ingestion_stale


def test_not_ingesting_is_never_stale():
    assert is_ingestion_stale({"is_ingesting": False}) is False


def test_recently_started_is_not_stale():
    started = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=5)).isoformat()
    assert is_ingestion_stale({"is_ingesting": True, "started_at": started}) is False


def test_old_started_at_is_stale():
    started = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=3)).isoformat()
    assert is_ingestion_stale({"is_ingesting": True, "started_at": started}) is True


def test_is_ingesting_with_no_started_at_is_stale():
    # Predates the started_at field entirely - undateable, so treat as
    # abandoned rather than blocking ingestion forever on it.
    assert is_ingestion_stale({"is_ingesting": True}) is True


def test_unparseable_started_at_is_stale():
    assert is_ingestion_stale({"is_ingesting": True, "started_at": "not-a-timestamp"}) is True
