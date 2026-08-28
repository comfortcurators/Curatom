# Plain-English version, for anyone reading this without the vocabulary:
#   - The demo login only accepts the actual demo account, nobody else.
#   - Phone numbers and emails get blacked out wherever they're written
#     into a memory, including short international formats, not just
#     the common US style.
#   - A file exported for training never carries the business or record
#     it came from - checked directly, not assumed.
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

from services.corpus_export import _strip_to_exportable
from core.security import (
    detect_and_redact_pii,
    validate_classification,
    validate_region,
    verify_human_login,
)


@pytest.mark.asyncio
async def test_demo_user_rejects_unconfigured_username():
    with pytest.raises(Exception) as exc:
        await verify_human_login("not-admin", os.environ["DEMO_PASSWORD"])
    assert getattr(exc.value, "status_code", None) == 401


def test_classification_validator_rejects_unknown_value():
    with pytest.raises(ValueError):
        validate_classification("top-secret-ish")


def test_region_validator_rejects_unknown_value():
    with pytest.raises(ValueError):
        validate_region("MARS")


def test_pii_redaction_catches_short_country_code_phone():
    # Regression: the phone pattern used to require the classic NANP
    # 3-3-4 digit grouping, so a shorter "+<country>-<exchange>-<line>"
    # form like "+1-555-0014" was left in plaintext next to a redacted
    # email — found live in a real Memory Bank record.
    redacted, detected = detect_and_redact_pii(
        "Data Subject Reference: user@example.com with phone +1-555-0014."
    )
    assert "phone" in detected
    assert "+1-555-0014" not in redacted
    assert "[REDACTED_PHONE]" in redacted


def test_pii_redaction_still_catches_classic_nanp_phone():
    redacted, detected = detect_and_redact_pii("Call the front desk at 415-555-2671.")
    assert "phone" in detected
    assert "415-555-2671" not in redacted


def test_corpus_export_strips_source_ref_and_doc_id():
    # source_ref carries org_id/tenant_id/memory_id and exists only so an
    # erasure or opt-out can find and purge the document inside Firestore -
    # exporting it as-is would leak tenant identity into the file, defeating
    # the point of de-identifying the corpus in the first place.
    entry = {
        "content_redacted": "hello",
        "topic": "t",
        "region": "US",
        "classification": "internal",
        "pii_classes": [],
        "created_at": "2026-01-01T00:00:00+00:00",
        "id": "corpus_abc",
        "source_ref": {"org_id": "org_x", "tenant_id": "tenant_x", "memory_id": "mem_x"},
    }
    exported = _strip_to_exportable(entry)
    assert "source_ref" not in exported
    assert "id" not in exported
    assert exported["content_redacted"] == "hello"
