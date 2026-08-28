import json
from google.genai import types
from core.config import build_genai_client
from services.directory_fetcher import embed_text
from services.repository import GlobalRepository, TenantScopedRepository

ai = build_genai_client()

_ANSWER_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "answer": {"type": "STRING"},
        # Live-verified defect: a purely business-context question (nothing
        # in the answer touched model documentation) still cited two
        # unrelated model_directory excerpts as if they were evidence for
        # it - vector search always returns its "k nearest," regardless of
        # how distant or irrelevant they actually are, and cosine distance
        # alone isn't a safe filter here (a genuinely on-topic query
        # measured 0.41, a genuinely unrelated one measured 0.52 against
        # this embedding model - too close to threshold reliably). Asking
        # the model that actually wrote the answer whether it used the
        # supplementary docs is a real signal, not a guessed number.
        "used_supplementary_documentation": {"type": "BOOLEAN"},
    },
    "required": ["answer", "used_supplementary_documentation"],
}


async def _generate_answer(prompt: str) -> tuple[str, bool]:
    resp = await ai.aio.models.generate_content(
        model='gemini-3.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_ANSWER_SCHEMA,
        ),
    )
    try:
        parsed = json.loads(resp.text)
        return parsed["answer"], bool(parsed.get("used_supplementary_documentation"))
    except Exception:
        # Same fail-open-on-the-side-of-caution as directory_fetcher's own
        # structured-extraction fallback: if parsing fails, still answer
        # with the raw text, but never claim sources were used that we
        # have no confirmation of.
        return resp.text, False

async def handle_chat(query: str, role: str, atom_key: str, tenant_id: str, org_id: str):
    query_emb = await embed_text(query)

    # Use the repository contract so chat cannot mix legacy/differently-sized vectors.
    dir_results = await GlobalRepository().search_excerpts_by_model("", query_emb, limit=4)

    # Labeled explicitly as technical/supplementary, never as "the source" -
    # these are generic model documentation excerpts, not evidence for
    # anything claimed about the business itself. Presenting them
    # unqualified as sources for a business answer they had no part in
    # would be its own quiet fabrication.
    sources = []
    technical_sources = []
    seen_sources = set()
    directory_text = ""
    for d in dir_results:
        if d.get('source_url'):
            # Found live: vector search can surface the same excerpt twice
            # for one query, and nothing deduped it - the same source_url
            # and title landed in the citations list twice, presented as
            # if it were two pieces of corroborating evidence.
            entry = (d['source_url'], d.get('section_title', 'Source'))
            if entry not in seen_sources:
                seen_sources.add(entry)
                technical_sources.append({"uri": entry[0], "title": f"Technical documentation: {entry[1]}"})
        if d.get('text'):
            directory_text += d['text'] + "\n"

    # The tenant's own business context is the primary, authoritative
    # grounding for anything asked about the business itself - the generic
    # model_directory excerpts above are technical documentation (how a
    # given AI model works), a separate and secondary source. Answering a
    # business question from the technical directory alone, with no
    # business_context in the prompt at all, was the actual defect here:
    # every question got answered from whatever generic docs happened to
    # be nearest in the vector index, regardless of what the founder had
    # actually written down.
    tenant_repo = TenantScopedRepository(org_id, tenant_id)
    business_context = await tenant_repo.get_business_context()

    if business_context:
        business_name = business_context.get("business_name", "this business")
        context_lines = [
            f"What the business does: {business_context.get('what_you_do', '')}",
            f"Customers: {business_context.get('customers', '')}",
            f"Current stack: {business_context.get('current_stack', '')}",
            f"Priorities: {business_context.get('priorities', '')}",
        ]
        if business_context.get("constraints"):
            context_lines.append(f"Constraints: {business_context['constraints']}")
        if business_context.get("voice_and_tone"):
            context_lines.append(f"Voice and tone: {business_context['voice_and_tone']}")
        if business_context.get("anything_else"):
            context_lines.append(f"Anything else: {business_context['anything_else']}")
        business_context_text = "\n".join(context_lines)
        sources.insert(0, {"uri": f"tenant/{tenant_id}/business_context", "title": f"{business_name}'s own business context"})
    else:
        business_name = "this business"
        business_context_text = "(No business context has been provided yet - the founder has not answered Curatom's onboarding questions.)"

    # Live-reported defect: "What can you do" - a question about this
    # console, not the business - got answered with a summary of the
    # business instead. The old prompt had only one framing ("answering on
    # behalf of the business") for every query, with nothing telling the
    # model that a meta/capability question about Curatom itself is a
    # different kind of question from one about the tenant's business.
    base_prompt = (
        f"You are the Fleet Control Plane, Curatom's operational assistant for '{business_name}'. "
        f"Curatom lets a founder connect AI agents (issuing scoped, revocable atom keys), group them into "
        f"fleets with shared residency/retention settings, simulate and audit policy decisions, and maintain "
        f"a founder-verified White Paper that grounds what every connected agent knows about the business.\n\n"
        f"Two different kinds of question can arrive here, and they get answered from two different sources:\n"
        f"- A question about THIS CONSOLE - what it can do, how to connect an agent, what a fleet or a "
        f"policy is, how approvals work - answer from what Curatom actually is, described above. Never "
        f"substitute a summary of the business for an answer about the console's own capabilities.\n"
        f"- A question about THE BUSINESS ITSELF - what it does, its customers, its stack, its priorities - "
        f"use the business context below as the authoritative source.\n"
        f"Only fall back to the supplementary technical documentation for questions about how a specific "
        f"AI model or tool works. Report honestly whether your answer actually drew on the supplementary "
        f"technical documentation - say no if it didn't inform the answer at all, even if it was present "
        f"below.\n\n"
        f"Business context:\n{business_context_text}\n\n"
        f"Supplementary technical documentation:\n{directory_text}\n\n"
        f"Query: {query}"
    )

    if atom_key:
        answer, used_technical_docs = await _generate_answer(base_prompt)
        if used_technical_docs:
            sources.extend(technical_sources)
        return {
            "text": answer,
            "is_stale": False,
            "sources": sources
        }
    else:
        options = [
            {"label": "Run Proving Ground Scenarios", "action": "SCENARIO", "target": "/playground"},
            {"label": "Inspect Active Fleets", "action": "NAVIGATE", "target": "/fleets"},
            {"label": "Simulate Policy Permissions", "action": "NAVIGATE", "target": "/policies"}
        ]

        answer, used_technical_docs = await _generate_answer(base_prompt)
        if used_technical_docs:
            sources.extend(technical_sources)

        return {
            "text": answer,
            "options": options,
            "sources": sources
        }
