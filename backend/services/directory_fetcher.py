import httpx
import asyncio
import json
import datetime
import logging
from google import genai
from google.genai import types
from google.genai.errors import ClientError
from google.cloud.firestore_v1.vector import Vector
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential
from core.config import settings, build_genai_client
from core.firestore_client import get_db
from core.embedding_config import EMBEDDING_MODEL, EMBEDDING_DIM

ai = build_genai_client()
gemini_sem = asyncio.Semaphore(settings.GEMINI_CONCURRENCY_LIMIT)
logger = logging.getLogger(__name__)


def _is_rate_limited(exc: BaseException) -> bool:
    return isinstance(exc, ClientError) and getattr(exc, "code", None) == 429


class _EmbeddingPacer:
    """Leaky-bucket limiter for the Vertex AI embedding model.

    Verified against the live project (Service Usage API, 26 Aug 2026):
    aiplatform.googleapis.com/online_prediction_requests_per_base_model
    for base_model=gemini-embedding is a hard 5 requests/minute in
    us-central1 (and every other region checked) - not a soft burst
    allowance. A caller that fires several embed_text calls back to back
    with no natural delay between them (the synthetic fixture loader,
    unlike directory ingestion which has network-bound gaps between
    calls) exhausts it in well under a second. Pacing calls under this
    ceiling, rather than only retrying after the fact, is what keeps
    those callers from 429ing at all.
    """

    def __init__(self, max_per_minute: int):
        self._max_per_minute = max_per_minute
        self._lock = asyncio.Lock()
        self._call_times: list[float] = []

    async def wait_turn(self) -> None:
        while True:
            async with self._lock:
                now = asyncio.get_event_loop().time()
                self._call_times = [t for t in self._call_times if now - t < 60]
                if len(self._call_times) < self._max_per_minute:
                    self._call_times.append(now)
                    return
                sleep_for = 60 - (now - self._call_times[0]) + 0.1
            await asyncio.sleep(max(sleep_for, 0.1))


# One request of headroom under the verified 5/min hard quota.
_embedding_pacer = _EmbeddingPacer(max_per_minute=4)


@retry(
    retry=retry_if_exception(_is_rate_limited),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    stop=stop_after_attempt(5),
    reraise=True,
)
async def embed_text(text: str) -> list[float]:
    """Embed text with the configured Gemini embedding model at the index dimension.

    Paced to stay under the verified per-minute quota (see
    _EmbeddingPacer); the retry-with-backoff below is a safety net for
    quota consumed by other traffic sharing the same project, not the
    primary defense against 429s.
    """
    async with gemini_sem:
        await _embedding_pacer.wait_turn()
        response = await ai.aio.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text,
            config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIM),
        )
        if not response.embeddings or response.embeddings[0].values is None:
            raise RuntimeError("Embedding provider returned no vector")
        values = list(response.embeddings[0].values)
        if len(values) != EMBEDDING_DIM:
            raise RuntimeError(
                f"Embedding dimension mismatch: expected {EMBEDDING_DIM}, received {len(values)}"
            )
        return values

async def ingest_huggingface(max_pages: int = 5):
    db = get_db()
    count = 0
    async with httpx.AsyncClient(timeout=30.0) as client:
        for page in range(max_pages):
            resp = await client.get(
                f"https://huggingface.co/api/models?limit=50&sort=downloads&direction=-1&page={page}"
            )
            if resp.status_code != 200:
                break
            
            models = resp.json()
            for m in models:
                model_id = m.get('id')
                if not model_id:
                    continue
                readme_resp = await client.get(f"https://huggingface.co/{model_id}/raw/main/README.md")
                if readme_resp.status_code != 200:
                    continue
                
                text = readme_resp.text
                chunks = [c.strip() for c in text.split('\n#') if len(c.strip()) > 50]
                if not chunks:
                    continue

                for i, chunk in enumerate(chunks[:10]):
                    emb = await embed_text(chunk)
                    exc_ref = db.collection("excerpts").document()
                    await exc_ref.set({
                        "model_id": model_id,
                        "source_url": f"https://huggingface.co/{model_id}",
                        "section_title": f"Section {i+1}",
                        "text": chunk,
                        "embedding": Vector(emb),
                        "embedding_model": EMBEDDING_MODEL,
                        "embedding_dimension": EMBEDDING_DIM,
                        "source": "huggingface"
                    })

                summary_prompt = f"Write a 1-sentence factual summary of this model card:\n{text[:1500]}"
                async with gemini_sem:
                    summary_resp = await ai.aio.models.generate_content(
                        model='gemini-2.5-flash',
                        contents=summary_prompt
                    )
                
                dir_ref = db.collection("model_directory").document(model_id.replace('/', '_'))
                await dir_ref.set({
                    "family": model_id,
                    "source": "huggingface",
                    "summary": summary_resp.text.strip() if summary_resp.text else None,
                    "capabilities": {
                        "context_window": None,
                        "supported_formats": ["text"],
                        "known_quirks": [],
                        "rate_limits": None,
                        "license": m.get('cardData', {}).get('license', 'See Model Card')
                    },
                    "sources": [{"uri": f"https://huggingface.co/{model_id}", "title": model_id}],
                    "fetched_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
                })
                count += 1

    return count

async def ingest_closed_models():
    db = get_db()
    models = [
        "OpenAI GPT-5.6 (Sol, Terra, Luna)", 
        "Anthropic Claude 3.5 Sonnet", 
        "Google Gemini 2.5 Flash", 
        "xAI Grok 2", 
        "Cloudflare Workers AI Hosted Catalog", 
        "Meta Llama 3.3 70B", 
        "Mistral Large 2", 
        "DeepSeek V3", 
        "Qwen 2.5 72B"
    ]
    count = 0
    for m in models:
        async with gemini_sem:
            response = await ai.aio.models.generate_content(
                model='gemini-2.5-flash',
                contents=f"Find official documentation for the AI model {m}. Detail its verified context window, rate limits, and pricing tiers.",
                config=types.GenerateContentConfig(
                    tools=[{"google_search": {}}]
                )
            )
        
        text = response.text or ""
        sources = []
        if response.candidates and response.candidates[0].grounding_metadata:
            chunks = response.candidates[0].grounding_metadata.grounding_chunks
            for chunk in chunks:
                if hasattr(chunk, 'web') and chunk.web:
                    sources.append({"uri": chunk.web.uri, "title": chunk.web.title})
        
        if not sources or len(text.strip()) < 50:
            continue
            
        async with gemini_sem:
            cap_resp = await ai.aio.models.generate_content(
                model='gemini-2.5-flash',
                contents=f"Extract structured capabilities from this verified text: {text}",
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema={
                        "type": "OBJECT",
                        "properties": {
                            "summary": {"type": "STRING"},
                            "context_window": {"type": "INTEGER"},
                            "rate_limits": {"type": "STRING"},
                            "license": {"type": "STRING"}
                        }
                    }
                )
            )
        try:
            caps = json.loads(cap_resp.text)
        except Exception:
            caps = {"summary": None, "context_window": None, "rate_limits": None, "license": None}
            
        emb = await embed_text(text)
        
        exc_ref = db.collection("excerpts").document()
        await exc_ref.set({
            "model_id": m,
            "source_url": sources[0]["uri"],
            "section_title": "Vendor Documentation Overview",
            "text": text,
            "embedding": Vector(emb),
            "embedding_model": EMBEDDING_MODEL,
            "embedding_dimension": EMBEDDING_DIM,
            "source": "vendor_docs"
        })
            
        doc_ref = db.collection("model_directory").document(m.replace('/', '_').replace(' ', '_'))
        await doc_ref.set({
            "family": m,
            "source": "vendor_docs",
            "summary": caps.get("summary"),
            "capabilities": {
                "context_window": caps.get("context_window"),
                "supported_formats": ["text", "json", "multimodal"],
                "known_quirks": [],
                "rate_limits": caps.get("rate_limits"),
                "license": caps.get("license") or "Proprietary"
            },
            "sources": sources,
            "fetched_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        })
        count += 1
    return count

# How long a run is allowed to sit at is_ingesting=True before a fresh
# container is willing to treat it as abandoned rather than genuinely in
# progress. Cloud Run replaces the running container on every deploy, and
# this ingestion has no per-item heartbeat - only a started_at timestamp -
# so a container killed mid-run (a redeploy, a scale-down) leaves the flag
# permanently True with nothing left alive to ever flip it back. Both the
# startup bootstrap and the manual /directory/ingest trigger refused to
# start a new run whenever is_ingesting was True, so a single interrupted
# run could brick ingestion forever. Two hours is generous headroom over
# a real run at this pacer's throughput (~4 embeds/min), not a guess at
# "should be done by now."
STALE_INGESTION_THRESHOLD = datetime.timedelta(hours=2)


def is_ingestion_stale(state: dict) -> bool:
    if not state.get("is_ingesting"):
        return False
    started_at = state.get("started_at")
    if not started_at:
        # is_ingesting=True with no started_at at all predates this field -
        # treat as stale rather than blocking ingestion forever on an
        # unrecoverable, undateable flag.
        return True
    try:
        started = datetime.datetime.fromisoformat(started_at)
        if started.tzinfo is None:
            started = started.replace(tzinfo=datetime.timezone.utc)
    except (ValueError, TypeError):
        return True
    return datetime.datetime.now(datetime.timezone.utc) - started > STALE_INGESTION_THRESHOLD


async def run_ingestion():
    state_ref = None
    try:
        db = get_db()
        state_ref = db.collection("system").document("ingestion_state")
        await state_ref.set({
            "is_ingesting": True,
            "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "failures": None,
        }, merge=True)

        hf_count = await ingest_huggingface(settings.INGESTION_PAGES_LIMIT)
        closed_count = await ingest_closed_models()

        await state_ref.set({
            "is_ingesting": False,
            "completed": True,
            "last_run": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "models_ingested": hf_count + closed_count
        }, merge=True)
    except Exception as exc:
        logger.exception("Directory ingestion failed")
        if state_ref is not None:
            try:
                await state_ref.set({
                    "is_ingesting": False,
                    "last_run": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "failures": str(exc),
                }, merge=True)
            except Exception:
                logger.exception("Failed to persist directory ingestion failure state")
