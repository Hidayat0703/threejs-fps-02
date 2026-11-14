// SANDLINE — the look plan in one place. Dusk desert freight yard: sand, rust and one
// amber accent against a deep blue-grey dusk. The same names are the CSS custom
// properties in index.html. No other colour appears in the code.
export const PALETTE = {
  canvas: '#171b22',
  surface: '#232830',
  hairline: '#333a45',
  sand: '#c9a06b',
  rust: '#b5502a',
  ink: '#efe8d8',
  muted: '#8b94a0',
  accent: '#e8b23a',
  teal: '#3fb8a6',
  danger: '#e0533d',
};

export const TEAM = {
  attack: '#e8b23a',
  defend: '#3fb8a6',
};

export function shade(name) {
  return PALETTE[name];
}
