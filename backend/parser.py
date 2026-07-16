"""Crew-list text → OrgModel, via the LightRAG knowledge base.

Pipeline: one grounded LLM call through LightRAG /query asking for strict JSON
conforming to the OrgModel schema, then Pydantic validation with a single
repair round-trip on failure.
"""

from __future__ import annotations

import json
import re

from pydantic import ValidationError

from backend import rag_client
from backend.models import OrgModel

_SCHEMA_HINT = """
Output STRICT JSON (no markdown fences, no commentary) with exactly this shape:

{
  "name": "<short name for this organization>",
  "bases": [{"id": "<kebab-case>", "name": "...", "base_type": "fully-integrated|strongly-aligned|loosely-aligned|fully-segregated"}],
  "crews": [{"id": "<kebab-case>", "name": "...", "crew_type": "value-stream|platform|facilitation|capability|experience|partnership|governance", "base_id": "<id of a base>", "turf_id": "<turf id, value-stream crews only>", "mission": "<one sentence>"}],
  "turfs": [{"id": "<kebab-case>", "name": "...", "description": "<one sentence>"}],
  "forums": [{"id": "<kebab-case>", "name": "...", "member_crew_ids": ["<crew ids>"], "mission": "<one sentence>"}],
  "interactions": [{"from_id": "<crew or forum id>", "to_id": "<crew id>", "mode": "collaboration|x-as-a-service|facilitating", "note": "<optional>", "weight": 1.0}]

Interaction "weight" (0-1, default 1.0) = capacity allocation: use 1.0 unless the text
says a crew spends more time with one team than another (e.g. "mostly supports X,
occasionally Y" → X: 1.0, Y: 0.4).
}

Classification rules (unFIX vocabulary, per the knowledge base):
- Customer-facing teams owning end-to-end value delivery → crew_type "value-stream".
- Teams providing internal products/services consumed as-a-service → "platform"; add an
  "x-as-a-service" interaction from the platform crew to each consuming crew that the text names.
- Enablement/coaching teams that speed up other crews' practices → "facilitation"; add
  "facilitating" interactions to the crews they help.
- Teams with rare specialist expertise others borrow → "capability".
- Teams observing/owning customer experience across value streams with no product of their own → "experience".
- Vendor/freelancer relationship teams → "partnership".
- Oversight/constraint-setting groups → "governance".
- Every value-stream crew staffs a TURF: the stable bounded context / product area /
  customer journey it owns (e.g. the "Checkout Experience" domain). Create one turf per
  value-stream crew (derive the turf name from the domain, not the team name) and set the
  crew's turf_id. The turf is business architecture — it exists even if the crew is
  re-teamed; only value-stream crews get turf_id.
- Communities of interest, guilds, cross-cutting standards groups → forums (NOT crews);
  list every crew the text says participates in member_crew_ids.
- If the text does not describe multiple bases, use one base and choose base_type from how
  coupled the value streams sound (default "strongly-aligned").
- Only create interactions the text states or clearly implies. Keep ids kebab-case and stable.
"""


def _extract_json(text: str) -> dict:
    """Pull the first JSON object out of an LLM response (tolerates fences/prose)."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else None
    if candidate is None:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("no JSON object found in LLM response")
        candidate = text[start : end + 1]
    return json.loads(candidate)


async def parse_crew_list(text: str) -> OrgModel:
    user_prompt = (
        "You are converting a plain-text description of teams into a structured unFIX "
        "organization model. Use the knowledge base to apply unFIX crew-type and forum "
        "definitions correctly.\n" + _SCHEMA_HINT
    )
    query_text = (
        "Classify the following teams into unFIX crew types, forums, and interactions:\n\n" + text
    )
    response = await rag_client.query(query_text, user_prompt)

    try:
        return OrgModel.model_validate(_extract_json(response))
    except (ValueError, ValidationError) as first_error:
        repair_prompt = (
            "Your previous JSON output failed validation with these errors:\n"
            f"{first_error}\n\n"
            "Previous output:\n"
            f"{response[:6000]}\n\n"
            "Return corrected STRICT JSON only.\n" + _SCHEMA_HINT
        )
        repaired = await rag_client.query(query_text, repair_prompt)
        return OrgModel.model_validate(_extract_json(repaired))


def model_to_crew_list(model: OrgModel) -> str:
    """The trivial reverse direction: OrgModel → formatted prose crew list."""
    sections: dict[str, list[str]] = {}
    for crew in model.crews:
        sections.setdefault(crew.crew_type.value, []).append(
            f"- **{crew.name}**: {crew.mission or 'mission not documented'}"
        )
    lines = [f"# {model.name}", ""]
    titles = {
        "value-stream": "Value Stream Crews",
        "platform": "Platform Crews",
        "facilitation": "Facilitation (Enablement) Crews",
        "capability": "Capability Crews",
        "experience": "Experience Crews",
        "partnership": "Partnership Crews",
        "governance": "Governance Crews",
    }
    for key, title in titles.items():
        if key in sections:
            lines += [f"## {title}", *sections[key], ""]
    if model.forums:
        lines.append("## Forums")
        for forum in model.forums:
            members = ", ".join(forum.member_crew_ids)
            lines.append(f"- **{forum.name}**: {forum.mission or ''} (members: {members})")
        lines.append("")
    if model.interactions:
        lines.append("## Interactions")
        for ix in model.interactions:
            note = f" — {ix.note}" if ix.note else ""
            lines.append(f"- {ix.from_id} → {ix.to_id} ({ix.mode.value}){note}")
    return "\n".join(lines)
