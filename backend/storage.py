"""Load/save OrgModels as YAML files in data/."""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from backend.models import OrgModel

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "untitled"


def list_models() -> list[dict]:
    out = []
    for path in sorted(DATA_DIR.glob("*.yaml")):
        try:
            raw = yaml.safe_load(path.read_text())
            out.append({"slug": path.stem, "name": raw.get("name", path.stem)})
        except Exception:
            continue
    return out


def load_model(slug: str) -> OrgModel:
    path = DATA_DIR / f"{slug}.yaml"
    if not path.is_file() or path.parent != DATA_DIR:
        raise FileNotFoundError(slug)
    return OrgModel.model_validate(yaml.safe_load(path.read_text()))


def save_model(model: OrgModel) -> str:
    slug = slugify(model.name)
    path = DATA_DIR / f"{slug}.yaml"
    path.write_text(
        yaml.safe_dump(model.model_dump(mode="json", exclude_none=True), sort_keys=False, allow_unicode=True)
    )
    return slug
