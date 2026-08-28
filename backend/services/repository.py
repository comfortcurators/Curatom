import datetime
import uuid
from typing import Optional, List, Dict, Any, Tuple
from google.cloud import firestore
from google.cloud.firestore_v1.vector import Vector
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from core.firestore_client import get_db
from core.security import validate_classification, validate_region
from core.embedding_config import EMBEDDING_MODEL, EMBEDDING_DIM

class GlobalRepository:
    def __init__(self):
        self.db = get_db()

    async def get_directory_entries(self) -> List[Dict[str, Any]]:
        docs = await self.db.collection("model_directory").get()
        return [d.to_dict() for d in docs]

    async def list_all_training_corpus_entries(self) -> List[Dict[str, Any]]:
        # Deliberately not tenant-scoped: the corpus is de-identified by
        # construction (no org_id/tenant_id on the document, see
        # TenantScopedRepository.write_training_corpus_entry), so reading it
        # across every consenting tenant is what "aggregate corpus" means -
        # a single tenant's view of it would just be the same data filtered
        # by a field that isn't there.
        docs = await self.db.collection("training_corpus").get()
        return [d.to_dict() for d in docs]

    async def search_excerpts_by_model(self, model_id: str, query_embedding: List[float], limit: int = 4) -> List[Dict[str, Any]]:
        coll = self.db.collection("excerpts")
        if model_id:
            query = coll.where("model_id", "==", model_id)\
                .where("embedding_model", "==", EMBEDDING_MODEL)\
                .where("embedding_dimension", "==", EMBEDDING_DIM)\
                .find_nearest(
                vector_field="embedding",
                query_vector=Vector(query_embedding),
                distance_measure=DistanceMeasure.COSINE,
                limit=limit
            )
        else:
            query = coll.where("embedding_model", "==", EMBEDDING_MODEL)\
                .where("embedding_dimension", "==", EMBEDDING_DIM)\
                .find_nearest(
                vector_field="embedding",
                query_vector=Vector(query_embedding),
                distance_measure=DistanceMeasure.COSINE,
                limit=limit
            )
        docs = await query.get()
        return [d.to_dict() for d in docs]

    async def search_excerpts(self, model_id: str, query_embedding: List[float], limit: int = 4) -> List[Dict[str, Any]]:
        return await self.search_excerpts_by_model(model_id, query_embedding, limit)

    async def get_ingestion_state(self) -> Dict[str, Any]:
        doc = await self.db.collection("system").document("ingestion_state").get()
        return doc.to_dict() if doc.exists else {}

    async def get_cache_metrics(self) -> Dict[str, Any]:
        doc = await self.db.collection("system").document("cache_metrics").get()
        return doc.to_dict() if doc.exists else {}

    async def get_excerpts_count(self) -> int:
        count_res = await self.db.collection("excerpts").count().get()
        return count_res[0][0].value if count_res else 0


class TenantScopedRepository:
    def __init__(self, org_id: str, tenant_id: str):
        self.org_id = org_id
        self.tenant_id = tenant_id
        self.db = get_db()

    async def get_tenant(self) -> Optional[Dict[str, Any]]:
        doc = await self.db.collection("tenants").document(self.tenant_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        if data.get("org_id") != self.org_id:
            return None
        return data

    async def create_tenant(self, name: str, contact_email: str, contact_phone: Optional[str] = None) -> Dict[str, Any]:
        data = {
            "tenant_id": self.tenant_id,
            "org_id": self.org_id,
            "name": name,
            "contact_email": contact_email,
            "contact_phone": contact_phone,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        await self.db.collection("tenants").document(self.tenant_id).set(data)
        return data

    async def update_tenant_name(self, name: str) -> Dict[str, Any]:
        await self.db.collection("tenants").document(self.tenant_id).update({"name": name})
        doc = await self.db.collection("tenants").document(self.tenant_id).get()
        return doc.to_dict()

    async def update_training_consent(self, opt_in: bool, decided_by: str) -> Dict[str, Any]:
        # A stored consent flag, nothing more. There is no training pipeline
        # reading this yet - setting it moves no data anywhere and triggers
        # no anonymization, because neither exists. It exists so the
        # decision is recorded honestly for whenever (if ever) that work
        # gets built, not so this endpoint can claim to already do it.
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        await self.db.collection("tenants").document(self.tenant_id).update({
            "training_data_opt_in": opt_in,
            "training_data_opt_in_decided_by": decided_by,
            "training_data_opt_in_decided_at": now_iso,
        })
        doc = await self.db.collection("tenants").document(self.tenant_id).get()
        return doc.to_dict()

    # --- Users (real accounts, one per human teammate) ---
    async def create_user(self, username: str, password_hash: str, role: str, display_name: str) -> Dict[str, Any]:
        existing = await self.db.collection("users").document(username).get()
        if existing.exists:
            raise ValueError(f"Username '{username}' is already taken")
        data = {
            "username": username,
            "password_hash": password_hash,
            "role": role,
            "display_name": display_name,
            "org_id": self.org_id,
            "tenant_id": self.tenant_id,
            "is_active": True,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        await self.db.collection("users").document(username).set(data)
        return {k: v for k, v in data.items() if k != "password_hash"}

    # Secret-shaped fields that must never leave the server, on any user
    # response - same discipline as password_hash, which this list already
    # excluded. email_verification_code_hash was a real leak found live:
    # GET /users shipped it straight through since only password_hash was
    # ever stripped here.
    _SECRET_USER_FIELDS = {"password_hash", "email_verification_code_hash", "recovery_code_hash"}

    async def list_users(self) -> List[Dict[str, Any]]:
        docs = await self.db.collection("users")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .get()
        return [{k: v for k, v in d.to_dict().items() if k not in self._SECRET_USER_FIELDS} for d in docs]

    async def deactivate_user(self, username: str) -> None:
        doc = await self.db.collection("users").document(username).get()
        if not doc.exists:
            raise ValueError("User not found")
        data = doc.to_dict()
        if data.get("org_id") != self.org_id or data.get("tenant_id") != self.tenant_id:
            raise ValueError("User not found in active tenant scope")
        await self.db.collection("users").document(username).update({"is_active": False})

    def _usage_doc_id(self) -> str:
        return f"{self.org_id}__{self.tenant_id}"

    async def get_tenant_costs(self) -> Dict[str, Any]:
        tenant = await self.get_tenant()
        if not tenant:
            return {}
        doc = await self.db.collection("tenant_usage").document(self._usage_doc_id()).get()
        if not doc.exists:
            return {}
        data = doc.to_dict()
        if data.get("org_id") != self.org_id or data.get("tenant_id") != self.tenant_id:
            return {}
        return data.get("costs", {})

    async def increment_tenant_costs(self, model_calls: int, tokens: int, embeddings: int):
        tenant = await self.get_tenant()
        if not tenant:
            raise ValueError("Tenant does not exist in active org scope")
        ref = self.db.collection("tenant_usage").document(self._usage_doc_id())
        await ref.set({
            "org_id": self.org_id,
            "tenant_id": self.tenant_id,
            "costs": {
                "model_calls": firestore.Increment(model_calls),
                "tokens_consumed": firestore.Increment(tokens),
                "embeddings_generated": firestore.Increment(embeddings),
            },
        }, merge=True)

    # --- Autonomous Task State ---
    async def create_task_record(self, task_data: Dict[str, Any]):
        task_data["org_id"] = self.org_id
        task_data["tenant_id"] = self.tenant_id
        await self.db.collection("tasks").document(task_data["task_id"]).set(task_data)

    async def update_task_record(self, task_id: str, updates: Dict[str, Any]):
        doc = await self.db.collection("tasks").document(task_id).get()
        if doc.exists and doc.to_dict().get("org_id") == self.org_id and doc.to_dict().get("tenant_id") == self.tenant_id:
            await self.db.collection("tasks").document(task_id).update(updates)

    async def get_task_record(self, task_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.db.collection("tasks").document(task_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        if data.get("org_id") != self.org_id or data.get("tenant_id") != self.tenant_id:
            return None
        return data

    async def list_tasks(self, limit: int = 20, cursor_id: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        query = self.db.collection("tasks")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            
        if cursor_id:
            cursor_doc = await self.db.collection("tasks").document(cursor_id).get()
            if cursor_doc.exists:
                query = query.start_after(cursor_doc)
                
        docs = await query.limit(limit + 1).get()
        items = [d.to_dict() for d in docs[:limit]]
        next_cursor = docs[limit].id if len(docs) > limit else None
        return items, next_cursor

    # --- Fleets ---
    async def create_fleet(self, name: str, description: str = "") -> Dict[str, Any]:
        fleet_id = f"fleet_{uuid.uuid4().hex}"
        data = {
            "id": fleet_id,
            "name": name,
            "description": description,
            "default_profile": {},
            "org_id": self.org_id,
            "tenant_id": self.tenant_id,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        await self.db.collection("fleets").document(fleet_id).set(data)
        return data

    async def get_or_create_default_fleet(self) -> Dict[str, Any]:
        # There was, until this method existed, no way for any tenant to
        # ever have a fleet: list/get existed, create never did. That made
        # /atoms/register - which requires a fleet_id - unreachable for
        # every fresh tenant, not just unfriendly to one. This is the
        # transparent fallback: a founder connecting their first agent
        # should never need to understand what a "fleet" is.
        items, _ = await self.list_fleets(limit=1)
        if items:
            return items[0]
        return await self.create_fleet("Default", "Auto-created for the first connected agent.")

    async def list_fleets(self, limit: int = 50, cursor_id: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        query = self.db.collection("fleets")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .order_by("created_at")
            
        if cursor_id:
            cursor_doc = await self.db.collection("fleets").document(cursor_id).get()
            if cursor_doc.exists:
                query = query.start_after(cursor_doc)
                
        docs = await query.limit(limit + 1).get()
        items = [d.to_dict() for d in docs[:limit]]
        next_cursor = docs[limit].id if len(docs) > limit else None
        return items, next_cursor

    async def get_fleet(self, fleet_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.db.collection("fleets").document(fleet_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        if data.get("org_id") != self.org_id or data.get("tenant_id") != self.tenant_id:
            return None
        return data

    # --- Atoms ---
    async def create_atom(self, atom_data: Dict[str, Any]):
        atom_data["org_id"] = self.org_id
        atom_data["tenant_id"] = self.tenant_id
        await self.db.collection("atoms").document(atom_data["id"]).set(atom_data)

    async def get_atom(self, atom_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.db.collection("atoms").document(atom_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        if data.get("org_id") != self.org_id or data.get("tenant_id") != self.tenant_id:
            return None
        return data

    async def update_atom(self, atom_id: str, updates: Dict[str, Any]):
        atom = await self.get_atom(atom_id)
        if not atom:
            raise ValueError("Atom does not exist in active tenant scope")
        await self.db.collection("atoms").document(atom_id).update(updates)

    async def list_atoms(self, limit: int = 50, cursor_id: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        query = self.db.collection("atoms")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .order_by("created_at")
            
        if cursor_id:
            cursor_doc = await self.db.collection("atoms").document(cursor_id).get()
            if cursor_doc.exists:
                query = query.start_after(cursor_doc)
                
        docs = await query.limit(limit + 1).get()
        items = []
        for d in docs[:limit]:
            data = d.to_dict()
            data.pop("api_key_hash", None)
            data.pop("previous_key_hash", None)
            items.append(data)
            
        next_cursor = docs[limit].id if len(docs) > limit else None
        return items, next_cursor

    # --- Policies ---
    async def list_policies(self) -> List[Dict[str, Any]]:
        docs = await self.db.collection("policies").where("org_id", "==", self.org_id).where("tenant_id", "==", self.tenant_id).get()
        return [d.to_dict() for d in docs]

    # --- Decision Log ---
    # A claim-backed choice, recorded at the time it's made, and the real
    # outcome tied back to it later - so the next similar choice has this
    # company's own track record to weigh against whatever a vendor or
    # model claims about itself. Concrete example this exists for: a model
    # claims it does 20 minutes of work for the cost of 2 minutes of a
    # cheaper one; the company acts on that; 40 days later it turns out the
    # choice caused a regression. Without this log, that never gets
    # remembered - the same claim gets trusted again next time.
    async def create_decision(self, claim: str, decision: str, reasoning: Optional[str], recorded_by: str) -> Dict[str, Any]:
        decision_id = f"dec_{uuid.uuid4().hex}"
        data = {
            "id": decision_id,
            "claim": claim,
            "decision": decision,
            "reasoning": reasoning,
            "recorded_by": recorded_by,
            "recorded_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "outcome_summary": None,
            "outcome_result": None,
            "outcome_recorded_at": None,
            "org_id": self.org_id,
            "tenant_id": self.tenant_id,
        }
        await self.db.collection("decisions").document(decision_id).set(data)
        return data

    async def get_decision(self, decision_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.db.collection("decisions").document(decision_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        if data.get("org_id") != self.org_id or data.get("tenant_id") != self.tenant_id:
            return None
        return data

    async def record_decision_outcome(self, decision_id: str, outcome_summary: str, outcome_result: str) -> Dict[str, Any]:
        existing = await self.get_decision(decision_id)
        if not existing:
            raise ValueError("Decision not found in active tenant scope")
        updates = {
            "outcome_summary": outcome_summary,
            "outcome_result": outcome_result,
            "outcome_recorded_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        await self.db.collection("decisions").document(decision_id).update(updates)
        return {**existing, **updates}

    async def list_decisions(self, limit: int = 50, cursor_id: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        query = self.db.collection("decisions")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .order_by("recorded_at", direction=firestore.Query.DESCENDING)

        if cursor_id:
            cursor_doc = await self.db.collection("decisions").document(cursor_id).get()
            if cursor_doc.exists:
                query = query.start_after(cursor_doc)

        docs = await query.limit(limit + 1).get()
        items = [d.to_dict() for d in docs[:limit]]
        next_cursor = docs[limit].id if len(docs) > limit else None
        return items, next_cursor

    # --- Business Context ---
    # The canonical, human-provided answer to "what is this business and what
    # should any LLM or agent know before acting on its behalf." One current
    # document per tenant, corrected in place as the business or its
    # priorities change - plus a plain history of what it used to say, so an
    # agent (or the founder) can see how intent shifted over time rather than
    # only ever seeing the latest snapshot.
    def _context_doc_id(self) -> str:
        return f"{self.org_id}__{self.tenant_id}"

    async def get_business_context(self) -> Optional[Dict[str, Any]]:
        doc = await self.db.collection("business_context").document(self._context_doc_id()).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        if data.get("org_id") != self.org_id or data.get("tenant_id") != self.tenant_id:
            return None
        return data

    async def set_business_context(self, fields: Dict[str, Any]) -> Dict[str, Any]:
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        existing = await self.get_business_context()

        if existing:
            history_entry = {k: v for k, v in existing.items() if k not in ("org_id", "tenant_id")}
            history_entry["org_id"] = self.org_id
            history_entry["tenant_id"] = self.tenant_id
            history_entry["superseded_at"] = now_iso
            await self.db.collection("business_context_history").add(history_entry)

        data = {
            **fields,
            "org_id": self.org_id,
            "tenant_id": self.tenant_id,
            "created_at": (existing or {}).get("created_at", now_iso),
            "updated_at": now_iso,
        }
        await self.db.collection("business_context").document(self._context_doc_id()).set(data)
        return data

    async def delete_business_context(self) -> None:
        # A real reset, not a soft "cleared" flag - the tenant goes back to
        # genuinely unonboarded (GET /context returns onboarded: false), the
        # same state a brand-new tenant is in. Existing history entries are
        # untouched; this only removes the current snapshot.
        await self.db.collection("business_context").document(self._context_doc_id()).delete()

    async def list_business_context_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        docs = await self.db.collection("business_context_history")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .order_by("superseded_at", direction=firestore.Query.DESCENDING)\
            .limit(limit)\
            .get()
        return [d.to_dict() for d in docs]

    # --- Memories & Real Cascading Erasure ---
    async def create_memory(self, memory_data: Dict[str, Any]):
        memory_data["org_id"] = self.org_id
        memory_data["tenant_id"] = self.tenant_id
        await self.db.collection("memories").document(memory_data["id"]).set(memory_data)

    async def get_memory(self, memory_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.db.collection("memories").document(memory_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        if data.get("org_id") != self.org_id or data.get("tenant_id") != self.tenant_id:
            return None
        try:
            validate_classification(data.get("classification"))
            validate_region(data.get("region"))
        except (AttributeError, ValueError) as exc:
            raise ValueError(f"Stored memory '{memory_id}' has invalid security metadata") from exc
        return data

    async def list_memories(self, limit: int = 50, cursor_id: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        query = self.db.collection("memories")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .order_by("created_at")
            
        if cursor_id:
            cursor_doc = await self.db.collection("memories").document(cursor_id).get()
            if cursor_doc.exists:
                query = query.start_after(cursor_doc)
                
        docs = await query.limit(limit + 1).get()
        items = [d.to_dict() for d in docs[:limit]]
        next_cursor = docs[limit].id if len(docs) > limit else None
        return items, next_cursor

    async def vector_search_memories_scoped(self, query_embedding: List[float], limit: int = 20) -> List[Dict[str, Any]]:
        query = self.db.collection("memories")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .where("embedding_model", "==", EMBEDDING_MODEL)\
            .where("embedding_dimension", "==", EMBEDDING_DIM)\
            .find_nearest(
                vector_field="embedding",
                query_vector=Vector(query_embedding),
                distance_measure=DistanceMeasure.COSINE,
                limit=limit
            )
        docs = await query.get()
        return [d.to_dict() for d in docs]

    async def vector_search_memories(self, query_embedding: List[float], limit: int = 20) -> List[Dict[str, Any]]:
        return await self.vector_search_memories_scoped(query_embedding, limit)

    async def delete_memory(self, memory_id: str) -> bool:
        # For a single wrong/stray record (a bad manual entry, leftover test
        # fixture) - not the subject-erasure cascade above, which is a DSR
        # tool keyed by a data subject, not a memory id. Purges its cache
        # entries too, same as delete_subject_cascade, so a stale cached
        # reshape can't outlive the memory it was built from.
        # Not get_memory(): that validates classification/region and raises
        # on a corrupt record, which would make a bad fixture undeletable.
        doc = await self.db.collection("memories").document(memory_id).get()
        if not doc.exists:
            return False
        data = doc.to_dict()
        if data.get("org_id") != self.org_id or data.get("tenant_id") != self.tenant_id:
            return False
        cache_docs = await self.db.collection("cache")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .where("memory_id", "==", memory_id)\
            .get()
        for c_doc in cache_docs:
            await c_doc.reference.delete()
        await self._purge_training_corpus_for_memory(memory_id)
        await self.db.collection("memories").document(memory_id).delete()
        return True

    # --- Training-data consent: an opt-in-only, anonymized copy ---
    # A memory's content is already PII-redacted before it's ever stored
    # (detect_and_redact_pii runs at write time regardless of this flag).
    # For a tenant that has opted in, this writes a *second*, de-identified
    # copy into its own collection: no org_id, no tenant_id, no memory id,
    # nothing that traces back to a business or a person on the document
    # itself. The only linkage back to the source memory lives in
    # source_ref, and it exists purely so an erasure or an opt-out can find
    # and purge the copy - no read/list/export route exposes source_ref or
    # this collection at all, because nothing consumes this corpus yet.
    async def write_training_corpus_entry(self, memory_id: str, entry: Dict[str, Any]) -> None:
        corpus_id = f"corpus_{uuid.uuid4().hex}"
        data = {
            **entry,
            "id": corpus_id,
            "source_ref": {"org_id": self.org_id, "tenant_id": self.tenant_id, "memory_id": memory_id},
        }
        await self.db.collection("training_corpus").document(corpus_id).set(data)

    async def _purge_training_corpus_for_memory(self, memory_id: str) -> int:
        docs = await self.db.collection("training_corpus")\
            .where("source_ref.org_id", "==", self.org_id)\
            .where("source_ref.tenant_id", "==", self.tenant_id)\
            .where("source_ref.memory_id", "==", memory_id)\
            .get()
        for d in docs:
            await d.reference.delete()
        return len(docs)

    async def purge_training_corpus_for_tenant(self) -> int:
        # Consent revoked: every anonymized copy this tenant ever
        # contributed gets purged, not just future writes stopped.
        docs = await self.db.collection("training_corpus")\
            .where("source_ref.org_id", "==", self.org_id)\
            .where("source_ref.tenant_id", "==", self.tenant_id)\
            .get()
        for d in docs:
            await d.reference.delete()
        return len(docs)

    # --- Sketchbooks ---
    # Every principal - human or agent - gets its own isolated notebook it
    # can write to unconditionally, no approval gate, because the isolation
    # itself is the safety boundary: one owner's sketchbook is invisible to
    # every other owner except the tenant's Owner, who sees all of them
    # (documentation, not restriction, is the point). Cross-owner awareness
    # is metadata-only, via the activity feed below - never the content.
    async def create_sketchbook_entry(self, owner_id: str, entry: Dict[str, Any]) -> Dict[str, Any]:
        entry_id = f"sketch_{uuid.uuid4().hex}"
        data = {
            **entry,
            "id": entry_id,
            "owner_id": owner_id,
            "org_id": self.org_id,
            "tenant_id": self.tenant_id,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        await self.db.collection("sketchbooks").document(entry_id).set(data)
        return data

    async def list_own_sketchbook(self, owner_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        docs = await self.db.collection("sketchbooks")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .where("owner_id", "==", owner_id)\
            .order_by("created_at", direction=firestore.Query.DESCENDING)\
            .limit(limit)\
            .get()
        return [d.to_dict() for d in docs]

    async def list_all_sketchbooks(self, limit: int = 100) -> List[Dict[str, Any]]:
        docs = await self.db.collection("sketchbooks")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .order_by("created_at", direction=firestore.Query.DESCENDING)\
            .limit(limit)\
            .get()
        return [d.to_dict() for d in docs]

    async def list_sketchbook_activity(self, limit: int = 50) -> List[Dict[str, Any]]:
        # Metadata only - who wrote, when, to which topic - never the
        # content, so this is safe for any principal to see about any owner.
        docs = await self.db.collection("sketchbooks")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .order_by("created_at", direction=firestore.Query.DESCENDING)\
            .limit(limit)\
            .get()
        return [
            {"owner_id": d.to_dict().get("owner_id"), "topic": d.to_dict().get("topic"), "created_at": d.to_dict().get("created_at")}
            for d in docs
        ]

    async def delete_subject_cascade(self, subject_id: str) -> Dict[str, Any]:
        memories_docs = await self.db.collection("memories")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .where("metadata.subject_ids", "array_contains", subject_id)\
            .get()

        deleted_mem_count = 0
        purged_cache_count = 0
        purged_corpus_count = 0
        for m_doc in memories_docs:
            mem_id = m_doc.id
            cache_docs = await self.db.collection("cache")\
                .where("org_id", "==", self.org_id)\
                .where("tenant_id", "==", self.tenant_id)\
                .where("memory_id", "==", mem_id)\
                .get()
            for c_doc in cache_docs:
                await c_doc.reference.delete()
                purged_cache_count += 1
            purged_corpus_count += await self._purge_training_corpus_for_memory(mem_id)
            await m_doc.reference.delete()
            deleted_mem_count += 1

        recall_docs = await self.db.collection("recalls")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .where("subject_ids", "array_contains", subject_id)\
            .get()
        purged_recall_count = 0
        for r_doc in recall_docs:
            await r_doc.reference.delete()
            purged_recall_count += 1

        task_docs = await self.db.collection("tasks")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .where("subject_ids", "array_contains", subject_id)\
            .get()
        purged_task_count = 0
        for t_doc in task_docs:
            await t_doc.reference.delete()
            purged_task_count += 1

        verify_memories = await self.db.collection("memories")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .where("metadata.subject_ids", "array_contains", subject_id)\
            .get()
        verify_recalls = await self.db.collection("recalls")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .where("subject_ids", "array_contains", subject_id)\
            .get()
        verify_tasks = await self.db.collection("tasks")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .where("subject_ids", "array_contains", subject_id)\
            .get()

        verification_passed = not verify_memories and not verify_recalls and not verify_tasks
        return {
            "status": "erasure_complete" if verification_passed else "erasure_incomplete",
            "subject_id": subject_id,
            "deleted_memories_count": deleted_mem_count,
            "purged_cache_entries": purged_cache_count,
            "purged_recall_logs": purged_recall_count,
            "purged_task_records": purged_task_count,
            "purged_training_corpus_entries": purged_corpus_count,
            "verification_passed": verification_passed,
        }

    # --- Cache ---
    async def get_cache(self, cache_key: str) -> Optional[Dict[str, Any]]:
        doc = await self.db.collection("cache").document(cache_key).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        if data.get("org_id") != self.org_id or data.get("tenant_id") != self.tenant_id:
            return None
        return data

    async def set_cache(self, cache_key: str, cache_data: Dict[str, Any]):
        cache_data["org_id"] = self.org_id
        cache_data["tenant_id"] = self.tenant_id
        await self.db.collection("cache").document(cache_key).set(cache_data)

    # --- Logs & Audit ---
    async def write_recall_log(self, log_data: Dict[str, Any]):
        log_data["org_id"] = self.org_id
        log_data["tenant_id"] = self.tenant_id
        await self.db.collection("recalls").add(log_data)

    async def write_audit_log(self, audit_data: Dict[str, Any]):
        audit_data["org_id"] = self.org_id
        audit_data["tenant_id"] = self.tenant_id
        await self.db.collection("audit").add(audit_data)

    # --- Pending approvals (approval-gated atom keys) ---
    # An atom registered with requires_approval=true never writes directly:
    # the write it asked for is captured here instead, and only actually
    # runs once the Owner approves it. Nothing here executes on its own.
    async def create_pending_approval(self, action: str, resource: str, payload: Dict[str, Any], requested_by: str) -> Dict[str, Any]:
        approval_id = f"appr_{uuid.uuid4().hex}"
        data = {
            "id": approval_id,
            "org_id": self.org_id,
            "tenant_id": self.tenant_id,
            "action": action,
            "resource": resource,
            "payload": payload,
            "requested_by": requested_by,
            "status": "pending",
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "reviewed_by": None,
            "reviewed_at": None,
        }
        await self.db.collection("pending_approvals").document(approval_id).set(data)
        return data

    async def get_pending_approval(self, approval_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.db.collection("pending_approvals").document(approval_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        if data.get("org_id") != self.org_id or data.get("tenant_id") != self.tenant_id:
            return None
        return data

    async def list_pending_approvals(self, status: Optional[str] = "pending") -> List[Dict[str, Any]]:
        query = self.db.collection("pending_approvals")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)
        if status:
            query = query.where("status", "==", status)
        docs = await query.get()
        return [d.to_dict() for d in docs]

    async def resolve_pending_approval(self, approval_id: str, status: str, reviewed_by: str) -> Dict[str, Any]:
        approval = await self.get_pending_approval(approval_id)
        if not approval:
            raise ValueError("Approval request not found")
        if approval["status"] != "pending":
            raise ValueError(f"Approval request is already '{approval['status']}'")
        updates = {
            "status": status,
            "reviewed_by": reviewed_by,
            "reviewed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        await self.db.collection("pending_approvals").document(approval_id).update(updates)
        approval.update(updates)
        return approval

    async def list_recalls(self, limit: int = 50, cursor_id: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        query = self.db.collection("recalls")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .order_by("timestamp", direction=firestore.Query.DESCENDING)

        if cursor_id:
            cursor_doc = await self.db.collection("recalls").document(cursor_id).get()
            if cursor_doc.exists:
                query = query.start_after(cursor_doc)

        docs = await query.limit(limit + 1).get()
        items = [d.to_dict() for d in docs[:limit]]
        next_cursor = docs[limit].id if len(docs) > limit else None
        return items, next_cursor

    async def list_audit_logs(self, limit: int = 50, cursor_id: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        query = self.db.collection("audit")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .order_by("timestamp", direction=firestore.Query.DESCENDING)

        if cursor_id:
            cursor_doc = await self.db.collection("audit").document(cursor_id).get()
            if cursor_doc.exists:
                query = query.start_after(cursor_doc)

        docs = await query.limit(limit + 1).get()
        items = [d.to_dict() for d in docs[:limit]]
        next_cursor = docs[limit].id if len(docs) > limit else None
        return items, next_cursor
