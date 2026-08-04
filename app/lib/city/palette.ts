/**
 * The single source of truth for Tata's colours.
 * CSS tokens (--v0..--v7, --amber), the 2D pixel renderer and the future 3D
 * palette pass must all read from here — never fork these values.
 * Amber is reserved: it marks tonight's building and nothing else, ever.
 */

export const PALETTE = {
  v0: "#06070a",
  v1: "#0d0f13",
  v2: "#171a20",
  v3: "#2a2e36",
  v4: "#4a4f59",
  v5: "#8b9099",
  v6: "#c9ccd2",
  v7: "#f2f3f5",
  amber: "#e8b464",
} as const;

/** greys used by the pixel city renderer */
export const CITY = {
  sky: "#07080c",
  far: PALETTE.v2,
  side: "#1d2129",
  face: PALETTE.v3,
  top: "#5a626e",
  light: PALETTE.v6,
  bright: PALETTE.v7,
  amber: PALETTE.amber,
  amberDim: "#8a6c3c",
} as const;
