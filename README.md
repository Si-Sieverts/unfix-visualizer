# unFIX Visualizer

Turn a plain-text list of crews into an [unFIX](https://unfix.com)-style org diagram — and turn a photo of an unFIX / [Team Topologies](https://teamtopologies.com) diagram back into a structured, git-friendly team model.

Two front ends share one renderer and one org-model schema:

- **Desktop app** (`backend/` + `frontend/`): FastAPI + vanilla-JS SVG. Text parsing is grounded in a local [LightRAG](https://github.com/HKUDS/LightRAG) knowledge base built from unfix.com and the Team Topologies book. Models are stored as YAML in `data/`.
- **Mobile PWA** (`docs/`, served via GitHub Pages): camera/photo-library capture on your phone, direct browser → OpenRouter vision calls (bring your own API key, stored only on-device — no server).

## The org model

`OrgModel` (see `backend/models.py`) speaks both vocabularies:

- **Bases** (fully-integrated / strongly-aligned / loosely-aligned / fully-segregated)
- **Turfs** — the stable bounded contexts (domains) that exist independently of staffing
- **Crews** — value-stream / platform / facilitation / capability / experience / partnership / governance, each with a Team Topologies mapping
- **Forums** — cross-cutting communities rendered as outline containers wrapping their members
- **Interactions** — collaboration / x-as-a-service / facilitating, with a capacity `weight` (partial weight renders as partial lane coverage)

## Notation rules the renderer implements

- Governance = bar at the top; platform crews = foundation bars at the bottom; value-stream crews = wide lanes on their gray turf bands; facilitation/capability/experience crews = vertical blocks **overlapping** the lanes they serve (occlusion = capacity; partial coverage = partial allocation); partnership crews cross all lanes at the left edge; forums = large outlined containers inside the base, membership = inside-or-touching.

## Run the desktop app

```bash
# knowledge base (for text parsing)
cd ../RAG-Anything && uv run python -m scripts.server
# app
uv run uvicorn backend.main:app --port 8020
# open http://localhost:8020
```

## Mobile PWA

Served from `docs/` by GitHub Pages. After changing `frontend/render/*.js`, run `scripts/sync-mobile.sh` to update the copies in `docs/render/`.

## Tests

```bash
uv run pytest tests/
```

`tests/test_parse_golden.py` needs the LightRAG server running (skips otherwise).

---

Built with extensive AI assistance (Claude Code). Inspired by [wesource/team-topologies-visualizer](https://github.com/wesource/team-topologies-visualizer) and the unFIX model by Jurgen Appelo; this project is not affiliated with unFIX or Team Topologies.
