import { renderDiagram } from "./render/diagram.js";
import { parseImage, parseText, modelToCrewList, DEFAULT_MODEL } from "./vision.js";

const $ = (id) => document.getElementById(id);
const svg = $("diagram");
const statusEl = $("status");

let model = null;

function setStatus(msg, cls = "") {
  statusEl.textContent = msg;
  statusEl.className = cls;
}

// ---------- API key (device-local only) ----------
const KEY_STORAGE = "openrouter_key";
const getKey = () => localStorage.getItem(KEY_STORAGE) || "";

$("btn-settings").addEventListener("click", () => {
  $("api-key").value = getKey();
  $("settings").showModal();
});
$("btn-save-key").addEventListener("click", () => {
  localStorage.setItem(KEY_STORAGE, $("api-key").value.trim());
  $("settings").close();
  setStatus("Key saved on this device.");
});
$("btn-close-settings").addEventListener("click", () => $("settings").close());

function requireKey() {
  if (getKey()) return true;
  $("settings").showModal();
  setStatus("Add your OpenRouter API key first.", "error");
  return false;
}

// ---------- image intake ----------
$("btn-camera").addEventListener("click", () => requireKey() && $("file-camera").click());
$("btn-gallery").addEventListener("click", () => requireKey() && $("file-gallery").click());
$("file-camera").addEventListener("change", (e) => handleFile(e.target));
$("file-gallery").addEventListener("change", (e) => handleFile(e.target));

async function handleFile(input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const dataUrl = await downscale(file, 1600);
  $("preview-img").src = dataUrl;
  $("preview-img").style.display = "block";
  setStatus("Reading diagram with Gemini vision — this can take a minute…", "busy");
  try {
    model = await parseImage(getKey(), DEFAULT_MODEL, dataUrl);
    showResult(`Read "${model.name}": ${model.crews.length} crews, ${model.forums.length} forums.`);
  } catch (err) {
    setStatus(`Could not read the diagram: ${err.message}`, "error");
  }
}

function downscale(file, maxDim) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ---------- text intake ----------
$("btn-parse-text").addEventListener("click", async () => {
  if (!requireKey()) return;
  const text = $("crew-text").value.trim();
  if (!text) return setStatus("Paste a crew list first.", "error");
  setStatus("Classifying crews — this can take a minute…", "busy");
  try {
    model = await parseText(getKey(), DEFAULT_MODEL, text);
    showResult(`Parsed "${model.name}": ${model.crews.length} crews, ${model.forums.length} forums.`);
  } catch (err) {
    setStatus(`Parse failed: ${err.message}`, "error");
  }
});

// ---------- result / rendering ----------
function showResult(msg) {
  $("input-card").style.display = "none";
  $("preview-img").style.display = "none";
  $("result").style.display = "flex";
  renderDiagram(svg, model, { showInteractions: true });
  resetView();
  setStatus(msg);
}

$("btn-new").addEventListener("click", () => {
  $("result").style.display = "none";
  $("input-card").style.display = "block";
  setStatus("");
});

// ---------- pan & pinch-zoom ----------
const view = { x: 0, y: 0, scale: 1 };
const pointers = new Map();
let pinchStart = null;

function resetView() { view.x = 0; view.y = 0; view.scale = 1; applyView(); }
function applyView() {
  const root = svg.querySelector("g.root");
  if (!root) return;
  const base = root.getAttribute("transform").split(" translate(")[0].split(" scale(")[0];
  root.setAttribute("transform", `${base} translate(${view.x} ${view.y}) scale(${view.scale})`);
}

svg.addEventListener("pointerdown", (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
  }
  svg.setPointerCapture(e.pointerId);
});
svg.addEventListener("pointermove", (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  if (pointers.size === 1) {
    view.x += e.clientX - prev.x;
    view.y += e.clientY - prev.y;
    applyView();
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    view.scale = Math.min(4, Math.max(0.3, (pinchStart.scale * dist) / pinchStart.dist));
    applyView();
  }
});
const endPointer = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchStart = null; };
svg.addEventListener("pointerup", endPointer);
svg.addEventListener("pointercancel", endPointer);

// ---------- exports ----------
function slugName() { return (model?.name ?? "unfix-diagram").toLowerCase().replace(/[^a-z0-9]+/g, "-"); }

function download(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function serializeSvg() {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const root = clone.querySelector("g.root");
  if (root) {
    const t = root.getAttribute("transform").split(" translate(")[0].split(" scale(")[0];
    root.setAttribute("transform", t);
  }
  return new XMLSerializer().serializeToString(clone);
}

$("btn-svg").addEventListener("click", () => {
  download(new Blob([serializeSvg()], { type: "image/svg+xml" }), `${slugName()}.svg`);
});

$("btn-png").addEventListener("click", () => {
  const vb = svg.viewBox.baseVal;
  const url = URL.createObjectURL(new Blob([serializeSvg()], { type: "image/svg+xml" }));
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = vb.width * 2; canvas.height = vb.height * 2;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => download(blob, `${slugName()}.png`));
    URL.revokeObjectURL(url);
  };
  img.src = url;
});

$("btn-list").addEventListener("click", async () => {
  const md = modelToCrewList(model);
  if (navigator.share) {
    try { await navigator.share({ title: model.name, text: md }); return; } catch { /* fall through */ }
  }
  await navigator.clipboard.writeText(md);
  setStatus("Crew list copied to clipboard.");
});
