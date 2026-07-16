"""OrgModel — the structured contract shared by both directions (text→diagram, diagram→text).

Vocabulary follows unFIX (Jurgen Appelo) with a Team Topologies mapping kept per crew,
so the app can speak both languages.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, model_validator


class BaseType(str, Enum):
    FULLY_INTEGRATED = "fully-integrated"
    STRONGLY_ALIGNED = "strongly-aligned"
    LOOSELY_ALIGNED = "loosely-aligned"
    FULLY_SEGREGATED = "fully-segregated"


class CrewType(str, Enum):
    VALUE_STREAM = "value-stream"
    PLATFORM = "platform"
    FACILITATION = "facilitation"
    CAPABILITY = "capability"
    EXPERIENCE = "experience"
    PARTNERSHIP = "partnership"
    GOVERNANCE = "governance"


class Axis(str, Enum):
    X = "X"  # flow of customer value
    Y = "Y"  # foundation / acceleration (cognitive-load reduction)
    Z = "Z"  # cross-cutting (spans crews)


class TTTeamType(str, Enum):
    STREAM_ALIGNED = "stream-aligned"
    PLATFORM = "platform"
    ENABLING = "enabling"
    COMPLICATED_SUBSYSTEM = "complicated-subsystem"


class InteractionMode(str, Enum):
    COLLABORATION = "collaboration"
    X_AS_A_SERVICE = "x-as-a-service"
    FACILITATING = "facilitating"


# Default axis per crew type — where a crew sits in the unFIX picture
# unless explicitly overridden.
DEFAULT_AXIS: dict[CrewType, Axis] = {
    CrewType.VALUE_STREAM: Axis.X,
    CrewType.PLATFORM: Axis.Y,
    CrewType.FACILITATION: Axis.Y,
    CrewType.CAPABILITY: Axis.Y,
    CrewType.EXPERIENCE: Axis.Z,
    CrewType.PARTNERSHIP: Axis.Y,
    CrewType.GOVERNANCE: Axis.Z,
}

# Default Team Topologies mapping per unFIX crew type ("inspired by, not the same as").
DEFAULT_TT_MAPPING: dict[CrewType, TTTeamType] = {
    CrewType.VALUE_STREAM: TTTeamType.STREAM_ALIGNED,
    CrewType.PLATFORM: TTTeamType.PLATFORM,
    CrewType.FACILITATION: TTTeamType.ENABLING,
    CrewType.CAPABILITY: TTTeamType.COMPLICATED_SUBSYSTEM,
    CrewType.EXPERIENCE: TTTeamType.STREAM_ALIGNED,
    CrewType.PARTNERSHIP: TTTeamType.PLATFORM,
    CrewType.GOVERNANCE: TTTeamType.ENABLING,
}


class Position(BaseModel):
    x: float
    y: float


class Base(BaseModel):
    id: str
    name: str
    base_type: BaseType | None = None


class Crew(BaseModel):
    id: str
    name: str
    crew_type: CrewType
    base_id: str
    mission: str = ""
    axis: Axis | None = None
    tt_mapping: TTTeamType | None = None
    position: Position | None = None  # manual override; None → computed layout

    @model_validator(mode="after")
    def _fill_defaults(self) -> "Crew":
        if self.axis is None:
            self.axis = DEFAULT_AXIS[self.crew_type]
        if self.tt_mapping is None:
            self.tt_mapping = DEFAULT_TT_MAPPING[self.crew_type]
        return self


class Forum(BaseModel):
    """Cross-cutting community of interest (Z-axis) — members keep their crew seats."""

    id: str
    name: str
    member_crew_ids: list[str] = Field(default_factory=list)
    mission: str = ""


class Interaction(BaseModel):
    from_id: str
    to_id: str
    mode: InteractionMode
    note: str = ""


class OrgModel(BaseModel):
    name: str
    bases: list[Base]
    crews: list[Crew]
    forums: list[Forum] = Field(default_factory=list)
    interactions: list[Interaction] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_references(self) -> "OrgModel":
        base_ids = {b.id for b in self.bases}
        crew_ids = {c.id for c in self.crews}
        node_ids = crew_ids | {f.id for f in self.forums}

        for crew in self.crews:
            if crew.base_id not in base_ids:
                raise ValueError(f"crew '{crew.id}' references unknown base '{crew.base_id}'")
        dupes = [cid for cid in crew_ids if sum(1 for c in self.crews if c.id == cid) > 1]
        if dupes:
            raise ValueError(f"duplicate crew ids: {sorted(set(dupes))}")
        for forum in self.forums:
            unknown = [m for m in forum.member_crew_ids if m not in crew_ids]
            if unknown:
                raise ValueError(f"forum '{forum.id}' references unknown crews {unknown}")
        for ix in self.interactions:
            for endpoint in (ix.from_id, ix.to_id):
                if endpoint not in node_ids:
                    raise ValueError(f"interaction references unknown node '{endpoint}'")
        return self
