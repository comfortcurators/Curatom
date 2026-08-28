from google import genai
from core.config import build_genai_client
import json
import re
from typing import Dict

ai = build_genai_client()

# Same field set as BusinessContextPayload in main.py (kept in sync by hand -
# there is no shared schema between the Python backend and the TypeScript
# frontend, same as every other field list in this app). Short labels only:
# this is a prompt, not a form.
_FIELD_LABELS: Dict[str, str] = {
    "business_name": "business name",
    "what_you_do": "what the business does",
    "customers": "who the customers are",
    "current_stack": "tools/platforms already in use",
    "priorities": "current priorities",
    "constraints": "things an AI should never do",
    "voice_and_tone": "voice and tone",
    "brands": "brands operated under",
    "domains": "domains/websites",
    "founders": "founders",
    "no_of_employees": "number of employees",
    "countries_covered": "countries/regions covered",
    "key_associations": "key associations or partnerships",
    "spine_of_business": "the spine of the business",
    "business_model_evolution": "how the business model evolved since incorporation",
    "key_events_and_principles": "key events or founding principles",
    "user_base": "user base",
    "softwares_involved": "software directly or indirectly involved",
    "hardwares_firmware": "hardware or firmware involved",
    "things_missing_to_ask": "anything not asked that should have been",
    "future_goals_or_deadlines": "future goals or deadlines",
    "who_is_writing_and_reliability": "who is answering and how reliable they are",
    "anything_else": "anything else worth knowing",
}


async def extract_business_context_from_image(image_bytes: bytes, mime_type: str) -> Dict[str, str]:
    """
    Reads a photo of handwritten (or typed) business-context notes and
    returns only what is actually legible - the same "no synthetic or
    pre-filled data" discipline the rest of business context enforces,
    applied to a photo instead of a typed answer. A field the model can't
    actually read from the image is left out of the result entirely,
    never guessed to fill the shape.
    """
    field_list = "\n".join(f"- {key}: {label}" for key, label in _FIELD_LABELS.items())
    prompt = (
        "You are reading a photo of handwritten or typed notes about a business. "
        "Extract ONLY what is actually legible and present in the image, matched to "
        "these fields:\n\n"
        f"{field_list}\n\n"
        "Rules:\n"
        "- Never invent, guess, or infer a value that is not actually visible in the image.\n"
        "- If a field is not addressed in the notes, or is illegible, omit it entirely - do not include it with an empty or placeholder value.\n"
        "- Preserve the person's own words; do not rephrase or embellish.\n"
        "- Respond with ONLY a single JSON object mapping field keys to string values, nothing else - no markdown fences, no commentary."
    )

    part = genai.types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
    resp = await ai.aio.models.generate_content(
        model="gemini-3.5-flash",
        contents=[part, prompt],
    )
    raw = (resp.text or "").strip()
    # Strip a markdown fence if the model added one despite the instruction not to.
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())

    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}

    if not isinstance(parsed, dict):
        return {}

    return {
        key: str(value).strip()
        for key, value in parsed.items()
        if key in _FIELD_LABELS and isinstance(value, (str, int, float)) and str(value).strip()
    }
