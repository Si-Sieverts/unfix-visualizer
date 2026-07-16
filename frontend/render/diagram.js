// Build the unFIX diagram as SVG elements from an OrgModel + computed layout.
import { CREW_COLORS, CREW_LABELS, CREW_ICONS, FORUM_OUTLINES, MODE_STYLE } from "./palette.js";
import { computeLayout } from "./layout.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const child of children) node.append(child);
  return node;
}

function wrapText(textNode, text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line);
  const x = textNode.getAttribute("x");
  lines.slice(0, 3).forEach((ln, i) => {
    textNode.append(el("tspan", { x, dy: i === 0 ? 0 : "1.15em" }, ln));
  });
  return lines.length;
}

function crewBlock(crew, pos) {
  const color = CREW_COLORS[crew.crew_type];
  const g = el("g", { class: "crew", "data-id": crew.id, cursor: "grab" });
  g.append(
    el("rect", {
      x: pos.x, y: pos.y, width: pos.w, height: pos.h,
      rx: 10, fill: color.fill, stroke: color.stroke, "stroke-width": 2,
    })
  );

  const vertical = pos.kind === "vertical";
  const labelDx = vertical ? 0 : (pos.labelDx || 0);
  const title = el("text", {
    x: pos.x + (vertical ? pos.w / 2 : 14 + labelDx),
    y: pos.y + (vertical ? 26 : 24),
    fill: color.text, "font-size": vertical ? 12 : 14, "font-weight": 700,
    "text-anchor": vertical ? "middle" : "start",
  });
  wrapText(title, crew.name, vertical ? 14 : 40);
  g.append(title);

  const subLabel = vertical
    ? `${CREW_ICONS[crew.crew_type]} 👤 Captain`
    : `${CREW_ICONS[crew.crew_type]} ${CREW_LABELS[crew.crew_type]} · 👤 ${crew.crew_type === "governance" ? "Chiefs" : "Captain"}`;
  const sub = el("text", {
    x: pos.x + (vertical ? pos.w / 2 : 14 + labelDx),
    y: pos.y + pos.h - 10,
    fill: color.text, "font-size": 10, opacity: 0.85,
    "text-anchor": vertical ? "middle" : "start",
  }, subLabel);
  g.append(sub);

  if (crew.mission) g.append(el("title", {}, `${crew.name}\n${crew.mission}\nTT: ${crew.tt_mapping ?? ""}`));
  return g;
}

function turfBand(band) {
  const g = el("g", { class: "turf" });
  g.append(el("rect", {
    x: band.x, y: band.y, width: band.w, height: band.h,
    rx: 6, fill: "#d8dbe0", stroke: "#b7bcc4", "stroke-width": 1,
  }));
  g.append(el("text", {
    x: band.x + 10 + (band.labelDx || 0), y: band.y + band.h - 4,
    "font-size": 11, fill: "#565e6a", "font-weight": 700,
  }, band.name ? `Turf · ${band.name}` : "Turf"));
  if (band.description) g.append(el("title", {}, `Turf: ${band.name}\n${band.description}\n(The stable domain — it exists even if the crew re-teams.)`));
  return g;
}

function forumOutline(outline, forum) {
  const color = FORUM_OUTLINES[outline.index % FORUM_OUTLINES.length];
  const g = el("g", { class: "forum-outline", "data-id": forum.id });
  g.append(el("rect", {
    x: outline.x, y: outline.y, width: outline.w, height: outline.h,
    rx: 16, fill: "none", stroke: color, "stroke-width": 2.5, opacity: 0.9,
  }));
  g.append(el("title", {}, `${forum.name} — everything inside or touching this outline is a member`));
  return g;
}

function forumBlock(forum, pos, index, crewsById) {
  const outline = FORUM_OUTLINES[index % FORUM_OUTLINES.length];
  const g = el("g", { class: "forum", "data-id": forum.id });
  g.append(el("rect", {
    x: pos.x, y: pos.y, width: pos.w, height: pos.h,
    rx: 12, fill: "#ffffff", stroke: outline, "stroke-width": 2.5, "stroke-dasharray": "1 0",
  }));
  const title = el("text", {
    x: pos.x + 12, y: pos.y + 20, fill: "#2a2f36", "font-size": 12, "font-weight": 700,
  });
  wrapText(title, `${forum.name} · 💬 Chair`, 34);
  g.append(title);

  // member dots colored by member crew type
  const dotY = pos.y + pos.h - 12;
  forum.member_crew_ids.slice(0, 16).forEach((cid, i) => {
    const crew = crewsById[cid];
    const fill = crew ? CREW_COLORS[crew.crew_type].fill : "#bbb";
    g.append(el("circle", { cx: pos.x + 14 + i * 13, cy: dotY, r: 4.5, fill, stroke: "#666", "stroke-width": 0.6 }));
  });
  if (forum.mission) g.append(el("title", {}, `${forum.name}\n${forum.mission}`));
  return g;
}

function edgeCenter(pos) {
  return { cx: pos.x + pos.w / 2, cy: pos.y + pos.h / 2 };
}

function interactionPath(ix, positions) {
  const from = positions[ix.from_id];
  const to = positions[ix.to_id];
  if (!from || !to) return null;
  const style = MODE_STYLE[ix.mode];
  const a = edgeCenter(from);
  const b = edgeCenter(to);

  // Route from the nearest edges with a gentle curve.
  const dx = b.cx - a.cx, dy = b.cy - a.cy;
  let sx, sy, tx, ty;
  if (Math.abs(dy) > Math.abs(dx)) {
    sy = dy > 0 ? from.y + from.h : from.y;
    sx = a.cx; ty = dy > 0 ? to.y : to.y + to.h; tx = b.cx;
  } else {
    sx = dx > 0 ? from.x + from.w : from.x;
    sy = a.cy; tx = dx > 0 ? to.x : to.x + to.w; ty = b.cy;
  }
  const mx = (sx + tx) / 2, my = (sy + ty) / 2;
  const d = `M ${sx} ${sy} Q ${mx + (sy === ty ? 0 : (tx - sx) * 0.1)} ${my}, ${tx} ${ty}`;

  const g = el("g", { class: "interaction", "data-from": ix.from_id, "data-to": ix.to_id });
  g.append(el("path", {
    d, fill: "none", stroke: style.stroke, "stroke-width": style.width,
    "stroke-dasharray": style.dash, "marker-end": `url(#arrow-${ix.mode})`, opacity: 0.75,
  }));
  g.append(el("title", {}, `${ix.from_id} → ${ix.to_id} (${style.label})${ix.note ? "\n" + ix.note : ""}`));
  return g;
}

function defs() {
  const d = el("defs");
  for (const [mode, style] of Object.entries(MODE_STYLE)) {
    const marker = el("marker", {
      id: `arrow-${mode}`, viewBox: "0 0 10 10", refX: 9, refY: 5,
      markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse",
    });
    marker.append(el("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: style.stroke }));
    d.append(marker);
  }
  return d;
}

function legend(x, y) {
  const g = el("g", { class: "legend", "font-size": 11 });
  let ly = y;
  g.append(el("text", { x, y: ly, "font-weight": 700, "font-size": 12, fill: "#333" }, "Crew types"));
  ly += 8;
  for (const [type, color] of Object.entries(CREW_COLORS)) {
    ly += 18;
    g.append(el("rect", { x, y: ly - 11, width: 13, height: 13, rx: 3, fill: color.fill, stroke: color.stroke }));
    g.append(el("text", { x: x + 19, y: ly, fill: "#333" }, CREW_LABELS[type]));
  }
  ly += 26;
  g.append(el("text", { x, y: ly, "font-weight": 700, "font-size": 12, fill: "#333" }, "Interaction modes"));
  for (const style of Object.values(MODE_STYLE)) {
    ly += 18;
    g.append(el("line", {
      x1: x, y1: ly - 4, x2: x + 30, y2: ly - 4,
      stroke: style.stroke, "stroke-width": style.width, "stroke-dasharray": style.dash,
    }));
    g.append(el("text", { x: x + 37, y: ly, fill: "#333" }, style.label));
  }
  return g;
}

export function renderDiagram(svg, model, options = {}) {
  const { showInteractions = true } = options;
  const { positions, turfBands, forumOutlines, base, totalW, totalH } = computeLayout(model);
  const crewsById = Object.fromEntries(model.crews.map((c) => [c.id, c]));
  const forumsById = Object.fromEntries(model.forums.map((f) => [f.id, f]));

  svg.replaceChildren();
  svg.append(defs());

  const LEGEND_W = 190;
  const margin = 30;
  const root = el("g", { class: "root", transform: `translate(${margin + LEGEND_W}, ${margin + 34})` });

  // Base container: rounded rect with a subtle "roof" line + name tab
  const baseName = model.bases[0]?.name ?? model.name;
  root.append(el("rect", {
    x: base.x - 12, y: base.y - 12, width: base.w + 24, height: base.h + 24,
    rx: 18, fill: "#f2f3f5", stroke: "#9aa2ad", "stroke-width": 2,
  }));
  root.append(el("text", {
    x: base.x + 6, y: base.y - 22, "font-size": 15, "font-weight": 800, fill: "#40474f",
  }, `🏠 ${baseName}${model.bases[0]?.base_type ? "  ·  " + model.bases[0].base_type + " base" : ""}`));

  const domainLayer = el("g", { class: "domain" });      // turf bands + forum outlines (behind everything)
  const interactionLayer = el("g", { class: "interactions" });
  const blockLayer = el("g", { class: "blocks" });

  for (const band of turfBands) domainLayer.append(turfBand(band));
  for (const outline of forumOutlines) {
    const forum = forumsById[outline.forumId];
    if (forum) domainLayer.append(forumOutline(outline, forum));
  }

  // Draw lanes and bars first, crossing (vertical) crews last — they must sit
  // ON TOP of the value streams they serve (unFIX occlusion semantics).
  const drawOrder = [...model.crews].sort((a, b) => {
    const rank = (c) => (positions[c.id]?.kind === "vertical" ? 1 : 0);
    return rank(a) - rank(b);
  });
  for (const crew of drawOrder) {
    const pos = positions[crew.id];
    if (pos) blockLayer.append(crewBlock(crew, pos));
  }
  model.forums.forEach((forum, i) => {
    const pos = positions[forum.id];
    if (pos) blockLayer.append(forumBlock(forum, pos, i, crewsById));
  });

  if (showInteractions) {
    for (const ix of model.interactions) {
      const path = interactionPath(ix, positions);
      if (path) interactionLayer.append(path);
    }
  }

  root.append(domainLayer, interactionLayer, blockLayer);
  svg.append(root);
  svg.append(legend(margin - 8, margin + 20));

  const width = margin * 2 + LEGEND_W + totalW + 20;
  const height = margin * 2 + 40 + totalH + 20;
  svg.setAttribute("viewBox", `0 0 ${Math.max(width, 900)} ${Math.max(height, 500)}`);
  return { positions };
}
