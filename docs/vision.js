// Client-side port of backend/parser.py + backend/vision.py prompts and helpers.
// The phone talks directly to OpenRouter with the user's own key (stored locally);
// there is no server. Keep these prompts in sync with the backend versions.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_MODEL = "google/gemini-2.5-flash";

const SCHEMA_HINT = `
Output STRICT JSON (no markdown fences, no commentary) with exactly this shape:

{
  "name": "<short name for this organization>",
  "bases": [{"id": "<kebab-case>", "name": "...", "base_type": "fully-integrated|strongly-aligned|loosely-aligned|fully-segregated"}],
  "crews": [{"id": "<kebab-case>", "name": "...", "crew_type": "value-stream|platform|facilitation|capability|experience|partnership|governance", "base_id": "<id of a base>", "turf_id": "<turf id, value-stream crews only>", "mission": "<one sentence>"}],
  "turfs": [{"id": "<kebab-case>", "name": "...", "description": "<one sentence>"}],
  "forums": [{"id": "<kebab-case>", "name": "...", "member_crew_ids": ["<crew ids>"], "mission": "<one sentence>"}],
  "interactions": [{"from_id": "<crew or forum id>", "to_id": "<crew id>", "mode": "collaboration|x-as-a-service|facilitating", "note": "<optional>", "weight": 1.0}]
}

Interaction "weight" (0-1, default 1.0) = capacity allocation: 1.0 unless a crew clearly
spends more capacity with one team than another.
`;

export const VISION_INSTRUCTIONS = `
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
  bounded contexts those crews staff. Emit one turf per band and set turf_id on the
  value-stream crew sitting on it. Name each turf after its label if it has one; if the
  band is unlabelled or only numbered, name it after the domain of the crew on it (e.g.
  "Checkout domain") — never leave a turf named with just a number.
- Forums are LARGE OUTLINED CONTAINERS (thin colored borders, e.g. pink/teal) that reach
  from the bottom of the base up around groups of crews, labelled with "Chair"/"Forum".
  MEMBERSHIP RULE: every crew that is inside a forum's outline, on top of it, or touching
  its borderline is a member of that forum — typically several value-stream crews, the
  platform crew, plus the crossing crews the outline passes behind. Trace each outline
  from its label block all the way up and around — forums are usually much bigger than
  they first appear, and several forums may overlap the same crews. A forum with only
  one member is almost certainly traced wrong: re-check the outline. Forums (and
  everything else) are INSIDE the base.
- In Team Topologies notation: yellow/orange horizontal bands = stream-aligned
  (map to value-stream), blue/flat = platform, purple = enabling (map to facilitation),
  orange octagon = complicated-subsystem (map to capability).
- OCCLUSION CARRIES MEANING: when a vertical crew block (facilitation, capability,
  experience, partnership) is drawn overlapping value-stream rows, its vertical extent
  shows WHICH value streams it spends its capacity with. Record an interaction from the
  overlapping crew to each value-stream crew its block covers (facilitation → mode
  "facilitating"; capability/experience → "collaboration"; only span-covered rows count).
- COVERAGE DEPTH = CAPACITY: how MUCH of a value-stream row the block covers is the
  capacity allocation. Fully covering a row → weight 1.0; only partially covering it
  (block starts or ends midway through the row) → weight ~0.4.
- IGNORE HAND-DRAWN ANNOTATIONS: freehand marks, highlighter strokes, red pen traces,
  circles, or arrows that do not match the clean style of the diagram are annotations
  made by a person on top of the image. They are NOT crews, forums, or interactions —
  never create any element from them.
- Lines/arrows between blocks are interactions: solid = x-as-a-service,
  dotted = facilitating, dashed/hatched = collaboration.
- Use the text labels in the image for names and missions; if a mission is not legible,
  leave mission as an empty string. Never invent teams that are not in the image.
` + SCHEMA_HINT;

export const TEXT_INSTRUCTIONS = `
You are converting a plain-text description of teams into a structured unFIX
organization model.

Classification rules (unFIX vocabulary):
- Customer-facing teams owning end-to-end value delivery → crew_type "value-stream".
- Teams providing internal products/services consumed as-a-service → "platform"; add an
  "x-as-a-service" interaction from the platform crew to each consuming crew named.
- Enablement/coaching teams that speed up other crews' practices → "facilitation"; add
  "facilitating" interactions to the crews they help.
- Teams with rare specialist expertise others borrow → "capability".
- Teams observing/owning customer experience across value streams → "experience".
- Vendor/freelancer relationship teams → "partnership".
- Oversight/constraint-setting groups → "governance".
- Every value-stream crew staffs a TURF: the stable bounded context / product area it
  owns. Create one turf per value-stream crew (named after the domain, not the team)
  and set the crew's turf_id.
- Communities of interest, guilds, cross-cutting standards groups → forums (NOT crews).
- If the text does not describe multiple bases, use one base ("strongly-aligned" default).
- Only create interactions the text states or clearly implies. Keep ids kebab-case.
` + SCHEMA_HINT;

export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  let candidate = fenced ? fenced[1] : null;
  if (candidate === null) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("no JSON object found in model response");
    candidate = text.slice(start, end + 1);
  }
  return JSON.parse(candidate);
}

// Light client-side validation (the strict Pydantic checks live server-side).
export function validateModel(m) {
  if (!m || !Array.isArray(m.crews) || m.crews.length === 0) throw new Error("no crews found");
  m.bases ??= [{ id: "base", name: m.name || "Base" }];
  m.turfs ??= []; m.forums ??= []; m.interactions ??= [];
  const crewIds = new Set(m.crews.map((c) => c.id));
  for (const f of m.forums) f.member_crew_ids = (f.member_crew_ids ?? []).filter((id) => crewIds.has(id));
  m.interactions = m.interactions.filter((ix) => {
    const known = (id) => crewIds.has(id) || m.forums.some((f) => f.id === id);
    return known(ix.from_id) && known(ix.to_id);
  });
  return m;
}

async function chat(apiKey, model, content) {
  const resp = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": location.origin,
      "X-Title": "unFIX Visualizer",
    },
    body: JSON.stringify({ model, messages: [{ role: "user", content }], temperature: 0.1 }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenRouter ${resp.status}: ${body.slice(0, 300)}`);
  }
  return (await resp.json()).choices[0].message.content;
}

async function withRepair(apiKey, model, buildContent) {
  const first = await chat(apiKey, model, buildContent(null));
  try {
    return validateModel(extractJson(first));
  } catch (err) {
    const second = await chat(apiKey, model, buildContent(`Your previous output failed validation: ${err.message}\nPrevious output:\n${first.slice(0, 6000)}\nReturn corrected STRICT JSON only.`));
    return validateModel(extractJson(second));
  }
}

export function parseImage(apiKey, model, imageDataUrl) {
  return withRepair(apiKey, model, (repairNote) => [
    { type: "text", text: VISION_INSTRUCTIONS + (repairNote ? `\n\n${repairNote}` : "") },
    { type: "image_url", image_url: { url: imageDataUrl } },
  ]);
}

export function parseText(apiKey, model, text) {
  return withRepair(apiKey, model, (repairNote) =>
    `${TEXT_INSTRUCTIONS}${repairNote ? `\n\n${repairNote}` : ""}\n\nClassify the following teams:\n\n${text}`);
}

// Port of backend model_to_crew_list — the diagram → text direction.
export function modelToCrewList(m) {
  const titles = {
    "value-stream": "Value Stream Crews", platform: "Platform Crews",
    facilitation: "Facilitation (Enablement) Crews", capability: "Capability Crews",
    experience: "Experience Crews", partnership: "Partnership Crews", governance: "Governance Crews",
  };
  const sections = {};
  for (const c of m.crews) (sections[c.crew_type] ??= []).push(`- **${c.name}**: ${c.mission || "mission not documented"}`);
  const lines = [`# ${m.name}`, ""];
  for (const [key, title] of Object.entries(titles)) {
    if (sections[key]) lines.push(`## ${title}`, ...sections[key], "");
  }
  if (m.forums?.length) {
    lines.push("## Forums");
    for (const f of m.forums) lines.push(`- **${f.name}**: ${f.mission || ""} (members: ${f.member_crew_ids.join(", ")})`);
    lines.push("");
  }
  if (m.interactions?.length) {
    lines.push("## Interactions");
    for (const ix of m.interactions) {
      const w = ix.weight != null && ix.weight < 1 ? `, ${Math.round(ix.weight * 100)}% capacity` : "";
      lines.push(`- ${ix.from_id} → ${ix.to_id} (${ix.mode}${w})${ix.note ? " — " + ix.note : ""}`);
    }
  }
  return lines.join("\n");
}
