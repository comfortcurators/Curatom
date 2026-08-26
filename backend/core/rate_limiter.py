import hashlib
import time
from fastapi import HTTPException
from google.cloud import firestore
from core.firestore_client import get_db


def _scope_key(org_id: str, tenant_id: str) -> str:
    return hashlib.sha256(f"{org_id}:{tenant_id}".encode("utf-8")).hexdigest()


class FirestoreRateLimiter:
    async def check_rate_limit(self, org_id: str, tenant_id: str, max_rpm: int = 300):
        db = get_db()
        current_minute = int(time.time() // 60)
        doc_id = f"{_scope_key(org_id, tenant_id)}_{current_minute}"
        doc_ref = db.collection("quotas_rpm").document(doc_id)

        await doc_ref.set(
            {
                "org_id": org_id,
                "tenant_id": tenant_id,
                "period": current_minute,
                "count": firestore.Increment(1),
                "expires_at": time.time() + 120,
            },
            merge=True,
        )
        doc = await doc_ref.get()
        count = doc.to_dict().get("count", 1)

        if count > max_rpm:
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "rate_limit_exceeded",
                    "message": f"Rate limit of {max_rpm} RPM exceeded for active scope.",
                },
                headers={"Retry-After": "15"},
            )

    async def check_daily_quota(self, org_id: str, tenant_id: str, max_daily: int = 50000):
        db = get_db()
        current_day = int(time.time() // 86400)
        doc_id = f"{_scope_key(org_id, tenant_id)}_{current_day}"
        doc_ref = db.collection("quotas_daily").document(doc_id)

        await doc_ref.set(
            {
                "org_id": org_id,
                "tenant_id": tenant_id,
                "period": current_day,
                "count": firestore.Increment(1),
                "expires_at": time.time() + 172800,
            },
            merge=True,
        )
        doc = await doc_ref.get()
        count = doc.to_dict().get("count", 1)

        if count > max_daily:
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "daily_quota_exhausted",
                    "message": f"Daily recall quota of {max_daily} exhausted for active scope.",
                },
                headers={"Retry-After": "3600"},
            )


rate_limiter = FirestoreRateLimiter()
