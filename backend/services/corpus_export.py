import datetime
import json
import uuid
from typing import Any, Dict, List

from google.cloud import storage

TRAINING_CORPUS_BUCKET = "curatom-training-corpus"

_EXPORTABLE_FIELDS = {"content_redacted", "topic", "region", "classification", "pii_classes", "created_at"}


def _strip_to_exportable(entry: Dict[str, Any]) -> Dict[str, Any]:
    # source_ref exists only so an erasure or an opt-out can find and purge
    # a document inside Firestore - it is never meant to leave this
    # service. Exporting the raw document as-is would leak org_id/tenant_id
    # into the file, defeating the whole point of de-identifying it in the
    # first place. Allowlist, not denylist: a field added to the corpus
    # schema later has to be deliberately added here too before it can ever
    # leave, not silently exported by default.
    return {k: v for k, v in entry.items() if k in _EXPORTABLE_FIELDS}


def export_training_corpus_to_gcs(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Writes the current training_corpus as JSONL to a GCS bucket - real
    storage, nothing consumes it from there yet. No training job, no
    fine-tuning pipeline reads this bucket; this is the "throw it
    somewhere real" step and nothing more than that.
    """
    lines = [json.dumps(_strip_to_exportable(e), ensure_ascii=False) for e in entries]
    jsonl = "\n".join(lines)

    now = datetime.datetime.now(datetime.timezone.utc)
    object_name = f"exports/{now.strftime('%Y-%m-%d')}/{uuid.uuid4().hex}.jsonl"

    client = storage.Client()
    bucket = client.bucket(TRAINING_CORPUS_BUCKET)
    blob = bucket.blob(object_name)
    blob.upload_from_string(jsonl, content_type="application/x-ndjson")

    return {
        "bucket": TRAINING_CORPUS_BUCKET,
        "object": object_name,
        "entry_count": len(entries),
        "exported_at": now.isoformat(),
    }
