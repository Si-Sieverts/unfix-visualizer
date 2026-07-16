"""Golden parse test — requires the LightRAG server (skips otherwise).

This is the M2 acceptance test: Simon's 13-crew list must come back classified
into the right unFIX crew types, with forums recognized as forums.
"""

import asyncio

import httpx
import pytest

from backend.models import CrewType
from backend.parser import parse_crew_list

GOLDEN_TEXT = """
I. Value Stream Crews (The Engines)
1. Onboarding & Identity Crew: Owns the user lifecycle from signup to authenticated session.
2. Checkout Experience Crew: Owns the funnel from "Add to Cart" to "Order Confirmed."
3. Notifications & Engagement Crew: Owns the communication loop (email/push/SMS) and user retention.

II. Platform Crews (The Foundation) — they use the X-as-a-Service interaction mode.
4. Developer Platform Crew: Owns the CI/CD pipeline, artifact repositories, and local development environment setup.
5. Cloud & Infrastructure Crew: Owns the cloud accounts, Kubernetes cluster, networking, and secret management.
6. Data Platform Crew: Owns the data lake, telemetry ingestion pipelines, and database reliability.
7. AuthN/AuthZ Platform Crew: Owns the core identity providers and permissions engine that the Onboarding crew consumes.

III. Enablement Crews (The Accelerators) — "Facilitating" interaction mode.
8. Security Enablement Crew: Self-service threat modeling templates and automated security scanning tools.
9. DevEx (Developer Experience) Crew: Documentation, golden path templates, removing developer friction.
10. Data Literacy Enablement Crew: Helps VS crews query their own data, SQL training, standard analytics events.

IV. Facilitation & Governance (The Glue)
11. Experience Crew: No code of its own; observes the customer journey across the three VS crews and reports flow bottlenecks.
12. Architecture Forum: Cross-cutting group of lead engineers from all crews; agrees cross-crew standards (event schemas, API versions).
13. Quality/Guild Forum: Defines the standard Definition of Done; shares testing best practices across all crews.
"""


def _lightrag_up() -> bool:
    try:
        return httpx.get("http://127.0.0.1:9621/health", timeout=2.0).status_code == 200
    except httpx.HTTPError:
        return False


pytestmark = pytest.mark.skipif(not _lightrag_up(), reason="LightRAG server not running on :9621")


def test_golden_parse():
    model = asyncio.run(parse_crew_list(GOLDEN_TEXT))

    types = {c.crew_type for c in model.crews}
    names = " ".join(c.name.lower() for c in model.crews)

    vs = [c for c in model.crews if c.crew_type == CrewType.VALUE_STREAM]
    platform = [c for c in model.crews if c.crew_type == CrewType.PLATFORM]
    facilitation = [c for c in model.crews if c.crew_type == CrewType.FACILITATION]

    assert len(vs) == 3, f"expected 3 value-stream crews, got {[c.name for c in vs]}"
    assert len(platform) == 4, f"expected 4 platform crews, got {[c.name for c in platform]}"
    assert len(facilitation) == 3, f"expected 3 facilitation crews, got {[c.name for c in facilitation]}"
    assert "experience" in names

    forum_names = " ".join(f.name.lower() for f in model.forums)
    assert len(model.forums) == 2, f"expected 2 forums, got {[f.name for f in model.forums]}"
    assert "architecture" in forum_names and "quality" in forum_names

    modes = {ix.mode.value for ix in model.interactions}
    assert "x-as-a-service" in modes
    assert "facilitating" in modes
