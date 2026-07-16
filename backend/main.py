"""unFIX Visualizer — FastAPI app.

Run:  uv run uvicorn backend.main:app --port 8020 --reload
Needs the LightRAG server up for /api/parse (see rag_client.LAUNCH_HINT).
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend import parser, rag_client, storage, vision
from backend.models import OrgModel

app = FastAPI(title="unFIX Visualizer")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


class ParseRequest(BaseModel):
    text: str


class ParseImageRequest(BaseModel):
    image_data_url: str


@app.get("/api/health")
async def health() -> dict:
    rag = await rag_client.health()
    return {
        "status": "ok",
        "lightrag": "up" if rag else "down",
        "lightrag_hint": None if rag else rag_client.LAUNCH_HINT,
    }


@app.get("/api/models")
def models() -> list[dict]:
    return storage.list_models()


@app.get("/api/models/{slug}")
def get_model(slug: str) -> OrgModel:
    try:
        return storage.load_model(slug)
    except FileNotFoundError:
        raise HTTPException(404, f"no model '{slug}'")


@app.post("/api/models")
def put_model(model: OrgModel) -> dict:
    slug = storage.save_model(model)
    return {"slug": slug}


@app.post("/api/parse")
async def parse(req: ParseRequest) -> OrgModel:
    try:
        return await parser.parse_crew_list(req.text)
    except rag_client.RagUnavailable as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:  # surface parse/validation failures to the UI
        raise HTTPException(422, f"could not parse crew list: {exc}")


@app.post("/api/parse-image")
async def parse_image(req: ParseImageRequest) -> OrgModel:
    if not req.image_data_url.startswith("data:image/"):
        raise HTTPException(400, "expected a data:image/... URL")
    try:
        return await vision.parse_diagram_image(req.image_data_url)
    except Exception as exc:
        raise HTTPException(422, f"could not read diagram image: {exc}")


@app.post("/api/export/crew-list")
def export_crew_list(model: OrgModel) -> dict:
    return {"markdown": parser.model_to_crew_list(model)}


app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
