export const dsColors = {
  accent: "#C04A17",
  accentHover: "#E06030",
  accentGlow: "rgba(212,83,26,0.13)",
  violet: "#6C47FF",
  violetHover: "#7B5CFF",
  violetSoft: "rgba(108,71,255,0.1)",
  success: "#22C55E",
  successSoft: "rgba(34,197,94,0.1)",
  error: "#EF4444",
  errorSoft: "rgba(239,68,68,0.1)",
  light: {
    bg: "#F7F8FC",
    bg2: "#EDEEF5",
    surface: "#FFFFFF",
    surface2: "#F2F3F9",
    text: "#111827",
    text2: "#4B5563",
    muted: "#6B7280",
    border: "#E5E7F0",
    border2: "#D1D5E0",
  },
  dark: {
    bg: "#0D0F14",
    bg2: "#13161E",
    surface: "#1A1D27",
    surface2: "#21253A",
    text: "#EDF0FF",
    text2: "#B0B8D0",
    muted: "#7E89A3",
    border: "#252836",
    border2: "#343748",
    accent: "#FF6B35",
    accentHover: "#FF7D4A",
    violet: "#8B6FFF",
    violetHover: "#9B82FF",
  },
} as const;

export const dsTypography = {
  font: {
    display: "var(--font-geist-sans), sans-serif",
    body: "var(--font-geist-sans), sans-serif",
  },
  tracking: {
    tightest: "-0.03em",
    tighter: "-0.02em",
    label: "0.1em",
    wider: "0.08em",
    widest: "0.12em",
  },
} as const;

export const dsRadius = {
  sm: "6px",
  md: "8px",
  lg: "10px",
  xl: "12px",
  xxl: "14px",
  xxxl: "16px",
  pill: "9999px",
} as const;

export const dsShadows = {
  sm: "0 1px 3px rgba(17,24,39,0.07), 0 4px 16px rgba(17,24,39,0.05)",
  md: "0 4px 12px rgba(17,24,39,0.08), 0 2px 6px rgba(17,24,39,0.05)",
  lg: "0 8px 32px rgba(17,24,39,0.10), 0 2px 8px rgba(17,24,39,0.06)",
  xl: "0 20px 60px rgba(17,24,39,0.12), 0 4px 16px rgba(17,24,39,0.06)",
  accent: "0 4px 14px rgba(212, 83, 26, 0.25)",
  violet: "0 4px 14px rgba(108, 71, 255, 0.25)",
} as const;
