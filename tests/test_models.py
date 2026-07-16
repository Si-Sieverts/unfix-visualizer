"""Schema + golden-file tests (no LLM needed)."""

import pytest
import yaml
from pathlib import Path

from backend.models import Axis, CrewType, OrgModel, TTTeamType
from backend.parser import model_to_crew_list
from backend.storage import DATA_DIR

GOLDEN = DATA_DIR / "golden-13-crews.yaml"


@pytest.fixture()
def golden() -> OrgModel:
    return OrgModel.model_validate(yaml.safe_load(GOLDEN.read_text()))


def test_golden_loads_and_counts(golden: OrgModel):
    assert len(golden.crews) == 11  # 13 named units = 11 crews + 2 forums
    assert len(golden.forums) == 2
    by_type = {t: [c for c in golden.crews if c.crew_type == t] for t in CrewType}
    assert len(by_type[CrewType.VALUE_STREAM]) == 3
    assert len(by_type[CrewType.PLATFORM]) == 4
    assert len(by_type[CrewType.FACILITATION]) == 3
    assert len(by_type[CrewType.EXPERIENCE]) == 1


def test_default_axes_and_tt_mapping(golden: OrgModel):
    for crew in golden.crews:
        if crew.crew_type == CrewType.VALUE_STREAM:
            assert crew.axis == Axis.X
            assert crew.tt_mapping == TTTeamType.STREAM_ALIGNED
        elif crew.crew_type == CrewType.PLATFORM:
            assert crew.axis == Axis.Y
            assert crew.tt_mapping == TTTeamType.PLATFORM
        elif crew.crew_type == CrewType.FACILITATION:
            assert crew.axis == Axis.Y
            assert crew.tt_mapping == TTTeamType.ENABLING
        elif crew.crew_type == CrewType.EXPERIENCE:
            assert crew.axis == Axis.Z


def test_reference_validation_rejects_unknown_ids(golden: OrgModel):
    raw = golden.model_dump(mode="json")
    raw["interactions"].append({"from_id": "ghost", "to_id": "checkout-experience", "mode": "collaboration"})
    with pytest.raises(ValueError, match="unknown node 'ghost'"):
        OrgModel.model_validate(raw)


def test_round_trip_yaml(golden: OrgModel, tmp_path: Path):
    dumped = yaml.safe_dump(golden.model_dump(mode="json", exclude_none=True), sort_keys=False)
    reloaded = OrgModel.model_validate(yaml.safe_load(dumped))
    assert reloaded == golden


def test_model_to_crew_list_contains_all_units(golden: OrgModel):
    text = model_to_crew_list(golden)
    for crew in golden.crews:
        assert crew.name in text
    for forum in golden.forums:
        assert forum.name in text
    assert "Value Stream Crews" in text
    assert "Forums" in text
