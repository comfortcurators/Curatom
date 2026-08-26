import datetime
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

    async def list_users(self) -> List[Dict[str, Any]]:
        docs = await self.db.collection("users")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .get()
        return [{k: v for k, v in d.to_dict().items() if k != "password_hash"} for d in docs]

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

    async def delete_subject_cascade(self, subject_id: str) -> Dict[str, Any]:
        memories_docs = await self.db.collection("memories")\
            .where("org_id", "==", self.org_id)\
            .where("tenant_id", "==", self.tenant_id)\
            .where("metadata.subject_ids", "array_contains", subject_id)\
            .get()

        deleted_mem_count = 0
        purged_cache_count = 0
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
