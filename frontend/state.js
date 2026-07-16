// Single central state object (pattern borrowed from the reference repo).
export const state = {
  model: null,          // current OrgModel (plain JS object)
  showInteractions: true,
  zoom: 1,
  pan: { x: 0, y: 0 },
  positionsCache: {},   // id -> {x,y,w,h} from last render (for dragging)
};

const listeners = [];
export function subscribe(fn) { listeners.push(fn); }
export function notify() { for (const fn of listeners) fn(state); }

export function setModel(model) {
  state.model = model;
  notify();
}
