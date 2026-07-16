"""Diagram image → OrgModel (M3, the reverse direction).

LightRAG /query is text-only, so this module calls Gemini 2.5 Flash directly
via OpenRouter (same key/model the RAG pipeline already uses — no new providers).
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import httpx
from pydantic import ValidationError

from backend.models import OrgModel
from backend.parser import _SCHEMA_HINT, _extract_json

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
VISION_MODEL = "google/gemini-2.5-flash"

# Reuse the key already configured for the RAG pipeline.
_ENV_CANDIDATES = [
    Path(__file__).resolve().parent.parent / ".env",
    Path("/Users/beamer/BRAIN/RAG-Anything/.env"),
]


def _api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    if key:
        return key
    for env_path in _ENV_CANDIDATES:
        if env_path.is_file():
            for line in env_path.read_text().splitlines():
                if line.startswith("OPENROUTER_API_KEY="):
                    return line.split("=", 1)[1].strip()
    raise RuntimeError(
        "OPENROUTER_API_KEY not found (env var or .env in unfix-visualizer / RAG-Anything)"
    )


_VISION_INSTRUCTIONS = """
You are reading an organizational diagram image (unFIX and/or Team Topologies notation).
Extract every team/crew, forum, base, and interaction you can see and return the
structured model.

Reading guide:
- unFIX color code: orange = value-stream, green = platform, purple = facilitation,
  red = capability, pink = experience, yellow = partnership, light blue = governance.
- Wide horizontal blocks in the middle are usually value-stream crews; horizontal bars
  at the bottom are platform crews; a narrow bar at the top is governance; vertical
  side blocks are facilitation/capability/experience/partnership crews.
- Gray horizontal bands behind/around the value-stream crew blocks are TURFS: the stable
  bounded contexts those crews staff. Emit one turf per band (name it after the domain if
  labelled, else after the crew's domain) and set turf_id on the value-stream crew sitting
  on it.
- Forums are LARGE OUTLINED CONTAINERS (thin colored borders, e.g. pink/teal) that reach
  from the bottom of the base up around groups of crews, labelled with "Chair"/"Forum".
  MEMBERSHIP RULE: every crew that is inside a forum's outline, on top of it, or touching
  its borderline is a member of that forum. Trace each outline carefully — forums are
  usually bigger than they first appear, and several forums may overlap the same crews.
  Forums (and everything else) are INSIDE the base.
- In Team Topologies notation: yellow/orange horizontal bands = stream-aligned
  (map to value-stream), blue/flat = platform, purple = enabling (map to facilitation),
  orange octagon = complicated-subsystem (map to capability).
- OCCLUSION CARRIES MEANING: when a vertical crew block (facilitation, capability,
  experience, partnership) is drawn overlapping value-stream rows, its vertical extent
  shows WHICH value streams it spends its capacity with. Record an interaction from the
  overlapping crew to each value-stream crew its block covers (facilitation → mode
  "facilitating"; capability/experience → "collaboration"; only span-covered rows count).
- Lines/arrows between blocks are interactions: solid = x-as-a-service,
  dotted = facilitating, dashed/hatched = collaboration.
- Use the text labels in the image for names and missions; if a mission is not legible,
  leave mission as an empty string. Never invent teams that are not in the image.
""" + _SCHEMA_HINT


async def parse_diagram_image(image_data_url: str) -> OrgModel:
    """`image_data_url` is a data: URL (PNG/JPEG base64) from the frontend upload."""
    first = await _vision_call(image_data_url, _VISION_INSTRUCTIONS)
    try:
        return OrgModel.model_validate(_extract_json(first))
    except (ValueError, ValidationError, json.JSONDecodeError) as err:
        repair = (
            _VISION_INSTRUCTIONS
            + f"\n\nYour previous output failed validation:\n{err}\n\nPrevious output:\n{first[:6000]}\n\nReturn corrected STRICT JSON only."
        )
        second = await _vision_call(image_data_url, repair)
        return OrgModel.model_validate(_extract_json(second))


async def _vision_call(image_data_url: str, instructions: str) -> str:
    payload = {
        "model": VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": instructions},
                    {"type": "image_url", "image_url": {"url": image_data_url}},
                ],
            }
        ],
        "temperature": 0.1,
    }
    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(
            OPENROUTER_URL,
            headers={"Authorization": f"Bearer {_api_key()}", "Content-Type": "application/json"},
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
