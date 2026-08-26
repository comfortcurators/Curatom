import os
import sys
import bcrypt
import re
import datetime
import jwt
import uuid
from fastapi import Header, HTTPException
from typing import Optional, List, Tuple, Dict, Any
from core.config import settings
from core.firestore_client import get_db

# Demo authentication is deliberately staging-only and fail-closed.
# Exactly one username may authenticate and its password is supplied out of band.
DEMO_USERNAME = os.getenv("DEMO_USERNAME", "admin")
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD")
if not DEMO_PASSWORD:
    print("FATAL: DEMO_PASSWORD must be set for demo authentication")
    sys.exit(1)
DEMO_PASSWORD_HASH = bcrypt.hashpw(
    DEMO_PASSWORD.encode("utf-8"), bcrypt.gensalt()
).decode("utf-8")

VALID_CLASSIFICATIONS = {"public", "internal", "confidential", "restricted"}
VALID_REGIONS = {"IN", "EU", "UK", "CN", "US", "SG", "AU"}
CLASSIFICATION_HIERARCHY = {
    "public": 1,
    "internal": 2,
    "confidential": 3,
    "restricted": 4,
}


def validate_classification(classification: str) -> str:
    normalized = classification.lower().strip()
    if normalized not in VALID_CLASSIFICATIONS:
        allowed = ", ".join(sorted(VALID_CLASSIFICATIONS))
        raise ValueError(f"Invalid classification '{classification}'. Must be one of: {allowed}")
    return normalized


def validate_region(region: str) -> str:
    normalized = region.upper().strip()
    if normalized not in VALID_REGIONS:
        allowed = ", ".join(sorted(VALID_REGIONS))
        raise ValueError(f"Invalid region '{region}'. Must be one of: {allowed}")
    return normalized


def get_classification_rank(classification: str) -> int:
    """Return a known classification rank; unknown values fail closed as restricted."""
    try:
        normalized = validate_classification(classification)
    except (AttributeError, ValueError):
        return CLASSIFICATION_HIERARCHY["restricted"]
    return CLASSIFICATION_HIERARCHY[normalized]


def is_classification_permitted(atom_ceiling: str, resource_classification: str) -> bool:
    # Access checks reject unknown labels instead of relying on rank fallback.
    try:
        ceiling = validate_classification(atom_ceiling)
        resource = validate_classification(resource_classification)
    except (AttributeError, ValueError):
        return False
    return CLASSIFICATION_HIERARCHY[ceiling] >= CLASSIFICATION_HIERARCHY[resource]


def hash_key(key: str) -> str:
    return bcrypt.hashpw(key.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_key(plain_key: str, hashed_key: str) -> bool:
    try:
        return bcrypt.checkpw(plain_key.encode("utf-8"), hashed_key.encode("utf-8"))
    except (ValueError, TypeError):
        return False


PII_PATTERNS = {
    "email": re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"),
    "phone": re.compile(r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"),
    "payment_ref": re.compile(r"\b(?:\d[ -]*?){13,16}\b"),
    "gov_id": re.compile(r"\b\d{3}-\d{2}-\d{4}\b|\b[A-Z]{1,2}\d{6,8}\b|\b\d{4}-\d{4}-\d{4}\b"),
    "aadhaar": re.compile(r"\b\d{4}\s?\d{4}\s?\d{4}\b"),
}


def detect_and_redact_pii(text: str) -> Tuple[str, List[str]]:
    detected: List[str] = []
    redacted = text
    for pii_type, pattern in PII_PATTERNS.items():
        if pattern.search(redacted):
            detected.append(pii_type)
            redacted = pattern.sub(f"[REDACTED_{pii_type.upper()}]", redacted)
    return redacted, detected


class AuthContext:
    def __init__(
        self,
        principal_id: str,
        principal_type: str,
        org_id: str,
        tenant_id: str,
        role: str,
        permitted_regions: List[str],
        classification_ceiling: str = "restricted",
        session_id: Optional[str] = None,
        atom_profile: Optional[Dict[str, Any]] = None,
    ):
        self.principal_id = principal_id
        self.principal_type = principal_type
        self.org_id = org_id
        self.tenant_id = tenant_id
        self.role = role
        self.permitted_regions = permitted_regions
        self.classification_ceiling = classification_ceiling
        self.session_id = session_id
        self.atom_profile = atom_profile


def create_session_token(principal_id: str, role: str, org_id: str, tenant_id: str) -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        "sub": principal_id,
        "role": role,
        "org_id": org_id,
        "tenant_id": tenant_id,
        "type": "human",
        "jti": f"sess_{uuid.uuid4().hex}",
        "iat": now,
        "exp": now + datetime.timedelta(hours=12),
        "iss": "curatom",
        "aud": "curatom-api",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def verify_session_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"],
            issuer="curatom",
            audience="curatom-api",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, detail={"code": "token_expired", "message": "Session token has expired"})
    except jwt.InvalidTokenError as exc:
        raise HTTPException(401, detail={"code": "invalid_token", "message": f"Token verification failed: {exc}"})


async def verify_human_login(username: str, password: str) -> Dict[str, Any]:
    if username != DEMO_USERNAME:
        raise HTTPException(401, detail={"code": "invalid_credentials", "message": "Invalid username or password"})

    if not bcrypt.checkpw(password.encode("utf-8"), DEMO_PASSWORD_HASH.encode("utf-8")):
        raise HTTPException(401, detail={"code": "invalid_credentials", "message": "Invalid username or password"})

    return {
        "principal_id": username,
        "role": "Owner",
        "org_id": os.getenv("DEMO_ORG_ID", "org_comfort_curators"),
        "tenant_id": os.getenv("DEMO_TENANT_ID", "tenant_apac_enterprise"),
    }


async def resolve_auth(
    authorization: Optional[str] = Header(None),
    x_atom_key: Optional[str] = Header(None),
) -> AuthContext:
    # Do not initialize Firestore unless agent-key authentication actually needs it.
    if x_atom_key:
        db = get_db()
        try:
            key_id, _secret = x_atom_key.split(".", 1)
            if not key_id.startswith("atom_"):
                raise ValueError("Invalid atom ID prefix")
            atom_id = key_id
        except ValueError as exc:
            raise HTTPException(
                status_code=401,
                detail={
                    "code": "invalid_key_format",
                    "message": f"Invalid atom key format. Expected 'atom_<id>.<secret>'. Error: {exc}",
                },
            )

        atom_doc = await db.collection("atoms").document(atom_id).get()
        if not atom_doc.exists:
            raise HTTPException(status_code=401, detail={"code": "atom_not_found", "message": "Agent account not found"})

        atom = atom_doc.to_dict()
        if atom.get("status") not in ["active", "draining"]:
            raise HTTPException(status_code=403, detail={"code": "atom_inactive", "message": f"Atom status is {atom.get('status')}"})

        is_valid = verify_key(x_atom_key, atom.get("api_key_hash", ""))
        if not is_valid and atom.get("previous_key_hash") and atom.get("rotated_at"):
            try:
                rotated_at = datetime.datetime.fromisoformat(atom["rotated_at"])
                if rotated_at.tzinfo is None:
                    rotated_at = rotated_at.replace(tzinfo=datetime.timezone.utc)
                if (datetime.datetime.now(datetime.timezone.utc) - rotated_at).total_seconds() < 86400:
                    is_valid = verify_key(x_atom_key, atom["previous_key_hash"])
            except (ValueError, TypeError):
                is_valid = False

        if not is_valid:
            raise HTTPException(status_code=401, detail={"code": "invalid_credentials", "message": "Invalid agent API key credentials"})

        profile = atom.get("profile", {})
        return AuthContext(
            principal_id=atom["id"],
            principal_type="agent",
            org_id=atom["org_id"],
            tenant_id=atom["tenant_id"],
            role="Agent",
            permitted_regions=profile.get("permitted_regions", ["SG", "US", "IN", "EU"]),
            classification_ceiling=profile.get("classification_ceiling", "confidential"),
            atom_profile=profile,
        )

    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        payload = verify_session_token(token)
        return AuthContext(
            principal_id=payload["sub"],
            principal_type="human",
            org_id=payload["org_id"],
            tenant_id=payload["tenant_id"],
            role=payload["role"],
            permitted_regions=["IN", "EU", "UK", "CN", "US", "SG", "AU"],
            classification_ceiling="restricted",
            session_id=payload.get("jti"),
        )

    raise HTTPException(status_code=401, detail={"code": "auth_required", "message": "Authentication required via Bearer session token or X-Atom-Key"})
