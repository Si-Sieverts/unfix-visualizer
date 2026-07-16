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

export function computeLayout(model) {
  const byType = (t) => model.crews.filter((c) => c.crew_type === t);
  const governance = byType("governance");
  const partnership = byType("partnership");
  const valueStreams = byType("value-stream");
  const rightRail = [...byType("facilitation"), ...byType("capability"), ...byType("experience")];
  const platforms = byType("platform");

  const centerH = Math.max(
    valueStreams.length * LANE_H + Math.max(0, valueStreams.length - 1) * LANE_GAP,
    rightRail.length > 0 || partnership.length > 0 ? 3 * LANE_H : LANE_H
  );
  const leftRailW = partnership.length ? partnership.length * (RAIL_W + RAIL_GAP) : 0;
  const rightRailW = rightRail.length ? rightRail.length * (RAIL_W + RAIL_GAP) : 0;
  const centerW = Math.max(MIN_CENTER_W, 64 * Math.max(1, valueStreams.length));

  const innerW = leftRailW + centerW + rightRailW;
  const baseW = innerW + PAD * 2;

  const govZoneH = governance.length ? governance.length * (GOV_H + 8) + ZONE_GAP : 0;
  const platZoneH = platforms.length ? platforms.length * (PLAT_H + PLAT_GAP) : 0;
  const baseH = PAD + govZoneH + centerH + (platZoneH ? ZONE_GAP + platZoneH : 0) + PAD;

  const positions = {}; // id -> {x, y, w, h, kind}
  const baseX = 0;
  const baseY = 0;
  let cursorY = baseY + PAD;

  governance.forEach((crew, i) => {
    positions[crew.id] = { x: baseX + PAD, y: cursorY + i * (GOV_H + 8), w: innerW, h: GOV_H, kind: "bar" };
  });
  cursorY += govZoneH;

  const turfTop = cursorY;
  partnership.forEach((crew, i) => {
    positions[crew.id] = {
      x: baseX + PAD + i * (RAIL_W + RAIL_GAP),
      y: turfTop, w: RAIL_W, h: centerH, kind: "vertical",
    };
  });
  valueStreams.forEach((crew, i) => {
    positions[crew.id] = {
      x: baseX + PAD + leftRailW,
      y: turfTop + i * (LANE_H + LANE_GAP),
      w: centerW, h: LANE_H, kind: "lane",
    };
  });
  rightRail.forEach((crew, i) => {
    positions[crew.id] = {
      x: baseX + PAD + leftRailW + centerW + RAIL_GAP + i * (RAIL_W + RAIL_GAP),
      y: turfTop, w: RAIL_W, h: centerH, kind: "vertical",
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

  // Forums live OUTSIDE (below) the base, per the unfix.com pictures.
  const forumTop = baseY + baseH + FORUM_GAP + 10;
  const forumW = model.forums.length
    ? Math.max(180, (baseW - FORUM_GAP * (model.forums.length - 1)) / model.forums.length)
    : 0;
  model.forums.forEach((forum, i) => {
    positions[forum.id] = {
      x: baseX + i * (forumW + FORUM_GAP),
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

  const totalH = model.forums.length ? forumTop + FORUM_H : baseY + baseH;
  return { positions, base: { x: baseX, y: baseY, w: baseW, h: baseH }, totalW: baseW, totalH };
}
