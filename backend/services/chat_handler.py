from google import genai
from core.config import settings, build_genai_client
from services.directory_fetcher import embed_text
from services.repository import GlobalRepository

ai = build_genai_client()

async def handle_chat(query: str, role: str, atom_key: str, tenant_id: str, org_id: str):
    query_emb = await embed_text(query)

    # Use the repository contract so chat cannot mix legacy/differently-sized vectors.
    dir_results = await GlobalRepository().search_excerpts_by_model("", query_emb, limit=4)

    sources = []
    context_text = ""
    for d in dir_results:
        if d.get('source_url'):
            sources.append({"uri": d['source_url'], "title": d.get('section_title', 'Source')})
        if d.get('text'):
            context_text += d['text'] + "\n"

    if atom_key:
        prompt = f"Reshape this documentation context to answer the query: {query}\nContext: {context_text}"
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
            
        resp = await ai.aio.models.generate_content(
            model='gemini-2.5-flash', 
            contents=f"Summarize this context for user query '{query}' in enterprise fleet '{settings.ENTERPRISE_NAME}':\n\n{context_text}"
        )
        
        return {
            "text": resp.text,
            "options": options,
            "sources": sources
        }
