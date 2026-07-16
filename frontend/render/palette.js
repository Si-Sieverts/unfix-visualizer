// unFIX crew-type palette, per the unfix.com cluster diagrams / crew type cards
// (source: LightRAG knowledge base — Cluster/Crew Types pages).
export const CREW_COLORS = {
  "value-stream": { fill: "#f6a13c", stroke: "#c97a1a", text: "#3a2200" }, // orange
  "platform":     { fill: "#8bc34a", stroke: "#5f8f2f", text: "#1e2e0a" }, // light green
  "facilitation": { fill: "#9b6bc3", stroke: "#6f4694", text: "#ffffff" }, // purple
  "capability":   { fill: "#e05252", stroke: "#a83232", text: "#ffffff" }, // red
  "experience":   { fill: "#f06fa0", stroke: "#bb4a77", text: "#ffffff" }, // pink
  "partnership":  { fill: "#f2c94c", stroke: "#bf9a26", text: "#3a2e00" }, // yellow
  "governance":   { fill: "#7fb8e6", stroke: "#4f88b6", text: "#0c2233" }, // light blue
};

export const CREW_LABELS = {
  "value-stream": "Value Stream Crew",
  "platform": "Platform Crew",
  "facilitation": "Facilitation Crew",
  "capability": "Capability Crew",
  "experience": "Experience Crew",
  "partnership": "Partnership Crew",
  "governance": "Governance Crew",
};

export const CREW_ICONS = {
  "value-stream": "⚙️",
  "platform": "🛤️",
  "facilitation": "🧭",
  "capability": "🔧",
  "experience": "🌺",
  "partnership": "🤝",
  "governance": "🏛️",
};

// Forum outline colors cycle (unfix.com shows forums as outlined blocks, pink/teal)
export const FORUM_OUTLINES = ["#e0559a", "#2aa8a0", "#7a6ff0", "#d98e2b"];

export const MODE_STYLE = {
  "x-as-a-service":
    { stroke: "#5c6672", dash: "", width: 2.5, label: "X-as-a-Service" },
  "facilitating":
    { stroke: "#8a54b8", dash: "3 5", width: 2, label: "Facilitating" },
  "collaboration":
    { stroke: "#d07b2f", dash: "10 4", width: 3, label: "Collaboration" },
};
