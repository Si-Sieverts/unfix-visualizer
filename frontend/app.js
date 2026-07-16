import { state, subscribe, notify, setModel } from "./state.js";
import { renderDiagram } from "./render/diagram.js";

const svg = document.getElementById("diagram");
const statusEl = document.getElementById("status");
const inputEl = document.getElementById("crew-input");
const modelPicker = document.getElementById("model-picker");

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = isError ? "status error" : "status";
}

// ---------- rendering ----------
subscribe(() => {
  if (!state.model) return;
  const { positions } = renderDiagram(svg, state.model, { showInteractions: state.showInteractions });
  state.positionsCache = positions;
  applyViewTransform();
});

function applyViewTransform() {
  const root = svg.querySelector("g.root");
  if (!root) return;
  const existing = root.getAttribute("transform").replace(/ scale\([^)]*\)| translate\([^)]*\)$/g, "");
  root.setAttribute(
    "transform",
    `${existing} translate(${state.pan.x} ${state.pan.y}) scale(${state.zoom})`
  );
}

// ---------- API ----------
async function api(path, options) {
  const resp = await fetch(path, options);
  if (!resp.ok) {
    let detail = resp.statusText;
    try { detail = (await resp.json()).detail ?? detail; } catch {}
    throw new Error(detail);
  }
  return resp.json();
}

async function refreshModelList(selectSlug) {
  const models = await api("/api/models");
  modelPicker.replaceChildren(new Option("— load saved model —", ""));
  for (const m of models) modelPicker.append(new Option(m.name, m.slug));
  if (selectSlug) modelPicker.value = selectSlug;
}

async function loadModel(slug) {
  const model = await api(`/api/models/${slug}`);
  setModel(model);
  setStatus(`Loaded "${model.name}".`);
}

// ---------- actions ----------
document.getElementById("btn-parse").addEventListener("click", async () => {
  const text = inputEl.value.trim();
  if (!text) return setStatus("Paste a crew list first.", true);
  setStatus("Parsing via LightRAG (grounded in the unFIX knowledge base) — this can take a minute…");
  document.getElementById("btn-parse").disabled = true;
  try {
    const model = await api("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    setModel(model);
    setStatus(`Parsed "${model.name}": ${model.crews.length} crews, ${model.forums.length} forums, ${model.interactions.length} interactions.`);
  } catch (err) {
    setStatus(`Parse failed: ${err.message}`, true);
  } finally {
    document.getElementById("btn-parse").disabled = false;
  }
});

document.getElementById("btn-save").addEventListener("click", async () => {
  if (!state.model) return setStatus("Nothing to save yet.", true);
  try {
    const { slug } = await api("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.model),
    });
    await refreshModelList(slug);
    setStatus(`Saved as data/${slug}.yaml`);
  } catch (err) {
    setStatus(`Save failed: ${err.message}`, true);
  }
});

modelPicker.addEventListener("change", () => {
  if (modelPicker.value) loadModel(modelPicker.value).catch((e) => setStatus(e.message, true));
});

document.getElementById("toggle-interactions").addEventListener("change", (e) => {
  state.showInteractions = e.target.checked;
  notify();
});

// ---------- M3: diagram image → model ----------
const imageFileInput = document.getElementById("image-file");
document.getElementById("btn-import-image").addEventListener("click", () => imageFileInput.click());

imageFileInput.addEventListener("change", () => {
  const file = imageFileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    setStatus("Reading diagram with Gemini vision — this can take a minute…");
    document.getElementById("btn-import-image").disabled = true;
    try {
      const model = await api("/api/parse-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_data_url: reader.result }),
      });
      setModel(model);
      setStatus(`Read "${model.name}" from image: ${model.crews.length} crews, ${model.forums.length} forums, ${model.interactions.length} interactions.`);
    } catch (err) {
      setStatus(`Image import failed: ${err.message}`, true);
    } finally {
      document.getElementById("btn-import-image").disabled = false;
      imageFileInput.value = "";
    }
  };
  reader.readAsDataURL(file);
});

document.getElementById("btn-export-svg").addEventListener("click", () => {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.style.background = "#ffffff";
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
  downloadBlob(blob, `${slugName()}.svg`);
});

document.getElementById("btn-export-png").addEventListener("click", () => {
  const vb = svg.viewBox.baseVal;
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" })
  );
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = vb.width * scale;
    canvas.height = vb.height * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => downloadBlob(blob, `${slugName()}.png`));
    URL.revokeObjectURL(url);
  };
  img.src = url;
});

document.getElementById("btn-export-list").addEventListener("click", async () => {
  if (!state.model) return setStatus("Nothing to export yet.", true);
  const { markdown } = await api("/api/export/crew-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.model),
  });
  const blob = new Blob([markdown], { type: "text/markdown" });
  downloadBlob(blob, `${slugName()}-crew-list.md`);
  setStatus("Exported crew list markdown (diagram → text direction).");
});

function slugName() {
  return (state.model?.name ?? "unfix-diagram").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- drag crews / pan / zoom ----------
let drag = null; // {id, startX, startY, origX, origY} or {pan:true,...}

svg.addEventListener("pointerdown", (e) => {
  const crewG = e.target.closest("g.crew");
  const pt = svgPoint(e);
  if (crewG) {
    const id = crewG.dataset.id;
    const pos = state.positionsCache[id];
    if (!pos) return;
    drag = { id, startX: pt.x, startY: pt.y, origX: pos.x, origY: pos.y };
    crewG.style.cursor = "grabbing";
  } else {
    drag = { pan: true, startX: e.clientX, startY: e.clientY, origX: state.pan.x, origY: state.pan.y };
  }
  svg.setPointerCapture(e.pointerId);
});

svg.addEventListener("pointermove", (e) => {
  if (!drag) return;
  if (drag.pan) {
    state.pan.x = drag.origX + (e.clientX - drag.startX);
    state.pan.y = drag.origY + (e.clientY - drag.startY);
    applyViewTransform();
    return;
  }
  const pt = svgPoint(e);
  const crew = state.model.crews.find((c) => c.id === drag.id);
  if (!crew) return;
  crew.position = {
    x: drag.origX + (pt.x - drag.startX) / state.zoom,
    y: drag.origY + (pt.y - drag.startY) / state.zoom,
  };
  notify();
});

svg.addEventListener("pointerup", () => { drag = null; });

svg.addEventListener("wheel", (e) => {
  e.preventDefault();
  state.zoom = Math.min(3, Math.max(0.3, state.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
  applyViewTransform();
}, { passive: false });

function svgPoint(e) {
  const pt = new DOMPoint(e.clientX, e.clientY);
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

// ---------- startup ----------
(async function init() {
  try {
    const health = await api("/api/health");
    if (health.lightrag === "down") {
      setStatus(`LightRAG is down — parsing disabled. Start it: ${health.lightrag_hint}`, true);
    }
  } catch { /* backend itself unreachable; static preview still works */ }
  try {
    await refreshModelList("golden-13-crews");
    await loadModel("golden-13-crews");
  } catch (err) {
    setStatus(`Could not load golden model: ${err.message}`, true);
  }
})();
