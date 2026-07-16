// Deterministic unFIX layout, following the unfix.com Base diagrams:
//   - Governance crews: narrow horizontal bars across the top ("Chiefs")
//   - Turf (middle): Partnership crews as vertical blocks on the LEFT rail;
//     Value Stream crews as wide horizontal blocks stacked in the CENTER;
//     Facilitation / Capability / Experience crews as vertical blocks on the RIGHT rail
//   - Platform crews: horizontal bars along the BOTTOM (the foundation)
//   - Forums: outlined blocks anchored BELOW the base ("Chair")
// Manual position overrides (crew.position) shift a block from its computed spot.

const PAD = 26;          // base inner padding
const GOV_H = 40;        // governance bar height
const LANE_H = 74;       // value-stream lane height
const LANE_GAP = 16;
const RAIL_W = 108;      // vertical crew block width
const RAIL_GAP = 14;
const PLAT_H = 52;       // platform bar height
const PLAT_GAP = 12;
const FORUM_H = 52;
const FORUM_GAP = 14;
const ZONE_GAP = 22;
const MIN_CENTER_W = 520;

// Which value-stream lanes does a crossing crew serve? Derived from its
// interactions; a crew with no stated interactions spans all lanes.
function laneSpan(crew, model, laneIndexById, laneCount) {
  const targets = new Set();
  for (const ix of model.interactions) {
    const other = ix.from_id === crew.id ? ix.to_id : ix.to_id === crew.id ? ix.from_id : null;
    if (other !== null && other in laneIndexById) targets.add(laneIndexById[other]);
  }
  if (targets.size === 0) return [0, Math.max(0, laneCount - 1)];
  return [Math.min(...targets), Math.max(...targets)];
}

export function computeLayout(model) {
  const byType = (t) => model.crews.filter((c) => c.crew_type === t);
  const governance = byType("governance");
  const partnership = byType("partnership");
  const valueStreams = byType("value-stream");
  const crossing = [...byType("facilitation"), ...byType("capability"), ...byType("experience")];
  const platforms = byType("platform");

  const laneCount = Math.max(1, valueStreams.length);
  const centerH = Math.max(
    valueStreams.length * LANE_H + Math.max(0, valueStreams.length - 1) * LANE_GAP,
    crossing.length > 0 || partnership.length > 0 ? 3 * LANE_H : LANE_H
  );
  // Crossing crews sit ON TOP of the lanes (unFIX occlusion semantics), so the
  // lanes must be wide enough to keep their labels readable to the left of the
  // crossing slots.
  const leftOverlayW = partnership.length * (RAIL_W + RAIL_GAP);
  const crossingW = crossing.length * (RAIL_W + RAIL_GAP);
  const centerW = Math.max(MIN_CENTER_W, 340 + leftOverlayW + crossingW);

  const innerW = centerW;
  const baseW = innerW + PAD * 2;

  const govZoneH = governance.length ? governance.length * (GOV_H + 8) + ZONE_GAP : 0;
  const platZoneH = platforms.length ? platforms.length * (PLAT_H + PLAT_GAP) : 0;
  // Forums live INSIDE the base (bottom row), so the base grows to hold them.
  const forumZoneH = model.forums.length ? ZONE_GAP + FORUM_H + 14 : 0;
  const baseH = PAD + govZoneH + centerH + (platZoneH ? ZONE_GAP + platZoneH : 0) + forumZoneH + PAD;

  const positions = {}; // id -> {x, y, w, h, kind}
  const baseX = 0;
  const baseY = 0;
  let cursorY = baseY + PAD;

  governance.forEach((crew, i) => {
    positions[crew.id] = { x: baseX + PAD, y: cursorY + i * (GOV_H + 8), w: innerW, h: GOV_H, kind: "bar" };
  });
  cursorY += govZoneH;

  const turfTop = cursorY;
  const laneIndexById = {};
  const turfsById = Object.fromEntries((model.turfs ?? []).map((t) => [t.id, t]));
  const turfBands = []; // gray domain bands behind the VS crew blocks
  const TURF_INSET = 7; // crew block sits inset on its turf band
  valueStreams.forEach((crew, i) => {
    laneIndexById[crew.id] = i;
    const bandY = turfTop + i * (LANE_H + LANE_GAP);
    const turf = crew.turf_id ? turfsById[crew.turf_id] : null;
    turfBands.push({
      x: baseX + PAD - 6, y: bandY - TURF_INSET,
      w: centerW + 12, h: LANE_H + TURF_INSET * 2,
      name: turf ? turf.name : "Turf",
      description: turf?.description ?? "",
    });
    positions[crew.id] = {
      x: baseX + PAD + TURF_INSET,
      y: bandY,
      w: centerW - TURF_INSET * 2, h: LANE_H, kind: "lane",
      // keep lane titles readable to the right of the partnership overlay
      labelDx: partnership.length ? leftOverlayW : 0,
    };
  });

  const laneTop = (i) => turfTop + i * (LANE_H + LANE_GAP);
  const laneBottom = (i) => laneTop(i) + LANE_H;
  const OVERHANG = 12; // crossing crews poke out past the lanes they serve

  // Partnership crews cross ALL lanes at the left edge (per the unFIX Base diagram).
  partnership.forEach((crew, i) => {
    positions[crew.id] = {
      x: baseX + PAD + 6 + i * (RAIL_W + RAIL_GAP),
      y: turfTop - OVERHANG, w: RAIL_W, h: centerH + OVERHANG * 2, kind: "vertical",
    };
  });

  // Facilitation / capability / experience crews overlay the lanes they serve:
  // their vertical extent spans exactly the value streams they interact with —
  // the occlusion IS the information (capacity spent with those crews).
  crossing.forEach((crew, i) => {
    const [first, last] = laneSpan(crew, model, laneIndexById, laneCount);
    positions[crew.id] = {
      x: baseX + PAD + centerW - crossingW + i * (RAIL_W + RAIL_GAP),
      y: laneTop(first) - OVERHANG,
      w: RAIL_W,
      h: laneBottom(last) - laneTop(first) + OVERHANG * 2,
      kind: "vertical",
    };
  });
  cursorY = turfTop + centerH;

  if (platforms.length) {
    cursorY += ZONE_GAP;
    platforms.forEach((crew, i) => {
      positions[crew.id] = { x: baseX + PAD, y: cursorY + i * (PLAT_H + PLAT_GAP), w: innerW, h: PLAT_H, kind: "bar" };
    });
    cursorY += platZoneH;
  }

  // Forum label blocks: bottom row INSIDE the base.
  const forumTop = cursorY + ZONE_GAP;
  const forumW = model.forums.length
    ? Math.max(180, (innerW - FORUM_GAP * (model.forums.length - 1)) / model.forums.length)
    : 0;
  model.forums.forEach((forum, i) => {
    positions[forum.id] = {
      x: baseX + PAD + i * (forumW + FORUM_GAP),
      y: forumTop, w: forumW, h: FORUM_H, kind: "forum",
    };
  });

  // Apply manual overrides last.
  for (const crew of model.crews) {
    if (crew.position && positions[crew.id]) {
      positions[crew.id].x = crew.position.x;
      positions[crew.id].y = crew.position.y;
    }
  }

  // Forum outlines: each forum is a large container reaching up from its label
  // block around every member crew — crews inside/touching the outline are the
  // members. Drawn behind the crews; overlapping outlines get staggered padding.
  const forumOutlines = model.forums.map((forum, i) => {
    const label = positions[forum.id];
    let minX = label.x, maxX = label.x + label.w, minY = label.y, maxY = label.y + label.h;
    for (const cid of forum.member_crew_ids) {
      const p = positions[cid];
      if (!p) continue;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + p.w);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y + p.h);
    }
    const stagger = 5 + i * 6; // keep overlapping forum borders distinguishable
    return {
      forumId: forum.id, index: i,
      x: minX - stagger, y: minY - stagger,
      w: maxX - minX + stagger * 2, h: maxY - minY + stagger * 2,
    };
  });

  const totalH = baseY + baseH;
  return {
    positions, turfBands, forumOutlines,
    base: { x: baseX, y: baseY, w: baseW, h: baseH }, totalW: baseW, totalH,
  };
}
