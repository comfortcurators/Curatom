"""One-time re-embedding migration for Gemini Embedding 2.

Run from backend/:
    python -m scripts.migrate_embeddings

Use against staging first. The script updates only vector fields/model metadata; it does
not delete source text. Existing vector indexes must remain dimension 768.
"""
import asyncio
from google.cloud.firestore_v1.vector import Vector

from core.firestore_client import get_db
from core.embedding_config import EMBEDDING_DIM, EMBEDDING_MODEL
from services.directory_fetcher import embed_text


async def migrate_collection(collection: str, text_field: str) -> tuple[int, int]:
    db = get_db()
    docs = await db.collection(collection).get()
    migrated = 0
    skipped = 0
    for doc in docs:
        data = doc.to_dict()
        text = data.get(text_field)
        if not isinstance(text, str) or not text.strip():
            skipped += 1
            continue
        if (
            data.get("embedding_model") == EMBEDDING_MODEL
            and data.get("embedding_dimension") == EMBEDDING_DIM
        ):
            skipped += 1
            continue
        vector = await embed_text(text)
        await doc.reference.update({
            "embedding": Vector(vector),
            "embedding_model": EMBEDDING_MODEL,
            "embedding_dimension": EMBEDDING_DIM,
        })
        migrated += 1
    return migrated, skipped


async def main() -> None:
    memories = await migrate_collection("memories", "content_redacted")
    excerpts = await migrate_collection("excerpts", "text")
    print({
        "embedding_model": EMBEDDING_MODEL,
        "embedding_dimension": EMBEDDING_DIM,
        "memories": {"migrated": memories[0], "skipped": memories[1]},
        "excerpts": {"migrated": excerpts[0], "skipped": excerpts[1]},
    })


if __name__ == "__main__":
    asyncio.run(main())
