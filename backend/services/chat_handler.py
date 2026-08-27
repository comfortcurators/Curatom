from google import genai
from core.config import build_genai_client
from services.directory_fetcher import embed_text
from services.repository import GlobalRepository, TenantScopedRepository

ai = build_genai_client()

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
    directory_text = ""
    for d in dir_results:
        if d.get('source_url'):
            sources.append({"uri": d['source_url'], "title": f"Technical documentation: {d.get('section_title', 'Source')}"})
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

    if atom_key:
        prompt = (
            f"You are answering on behalf of '{business_name}'. Use the business context below as the "
            f"authoritative source for anything about the business itself. Only fall back to the "
            f"supplementary technical documentation for questions about how a specific AI model or tool works.\n\n"
            f"Business context:\n{business_context_text}\n\n"
            f"Supplementary technical documentation:\n{directory_text}\n\n"
            f"Query: {query}"
        )
        resp = await ai.aio.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        return {
            "text": resp.text,
            "is_stale": False,
            "sources": sources
        }
    else:
        options = [
            {"label": "Run Proving Ground Scenarios", "action": "SCENARIO", "target": "/playground"},
            {"label": "Inspect Active Fleets", "action": "NAVIGATE", "target": "/fleets"},
            {"label": "Simulate Policy Permissions", "action": "NAVIGATE", "target": "/policies"}
        ]

        prompt = (
            f"You are answering on behalf of '{business_name}'. Use the business context below as the "
            f"authoritative source for anything about the business itself. Only fall back to the "
            f"supplementary technical documentation for questions about how a specific AI model or tool works.\n\n"
            f"Business context:\n{business_context_text}\n\n"
            f"Supplementary technical documentation:\n{directory_text}\n\n"
            f"Query: {query}"
        )
        resp = await ai.aio.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt
        )

        return {
            "text": resp.text,
            "options": options,
            "sources": sources
        }
