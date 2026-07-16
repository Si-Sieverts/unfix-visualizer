"""Thin client for the local LightRAG server (unFIX + Team Topologies knowledge)."""

from __future__ import annotations

import httpx

LIGHTRAG_URL = "http://127.0.0.1:9621"
LAUNCH_HINT = "cd /Users/beamer/BRAIN/RAG-Anything && uv run python -m scripts.server"


class RagUnavailable(RuntimeError):
    def __init__(self) -> None:
        super().__init__(
            f"LightRAG server is not reachable at {LIGHTRAG_URL}. Start it with:\n  {LAUNCH_HINT}"
        )


async def health() -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{LIGHTRAG_URL}/health")
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError:
        return None


async def query(query_text: str, user_prompt: str, mode: str = "hybrid") -> str:
    """Run a knowledge-grounded query. `user_prompt` steers the response format."""
    payload = {
        "query": query_text,
        "mode": mode,
        "user_prompt": user_prompt,
    }
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(f"{LIGHTRAG_URL}/query", json=payload)
            resp.raise_for_status()
            return resp.json()["response"]
    except httpx.ConnectError as exc:
        raise RagUnavailable() from exc
