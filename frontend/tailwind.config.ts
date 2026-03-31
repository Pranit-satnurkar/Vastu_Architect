import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ── Legacy (used by analysis components) ─────────────────────────────
        background:  "#121414",
        panel:       "#1e2020",
        border:      "#2a2c2c",
        accent:      "#ffc08d",
        "accent-hover": "#ffb77a",

        // ── Material Design 3 — Vastu warm-dark palette ───────────────────────
        "surface":                   "#121414",
        "surface-dim":               "#121414",
        "surface-bright":            "#383939",
        "surface-container-lowest":  "#0d0f0f",
        "surface-container-low":     "#1a1c1c",
        "surface-container":         "#1e2020",
        "surface-container-high":    "#282a2a",
        "surface-container-highest": "#333535",

        "on-surface":         "#e2e2e2",
        "on-surface-variant": "#dbc2b0",

        "outline":         "#a38d7c",
        "outline-variant": "#554336",

        "primary":            "#ffc08d",
        "primary-fixed":      "#ffdcc2",
        "primary-fixed-dim":  "#ffb77a",
        "primary-container":  "#ff9933",
        "on-primary":         "#4c2700",
        "on-primary-fixed":   "#2e1500",
        "on-primary-fixed-variant": "#6d3a00",
        "on-primary-container":     "#693800",

        "secondary":           "#81d6c0",
        "secondary-fixed":     "#9df3dc",
        "secondary-fixed-dim": "#81d6c0",
        "secondary-container": "#006b59",
        "on-secondary":        "#00382d",
        "on-secondary-fixed":  "#00201a",
        "on-secondary-fixed-variant": "#005143",
        "on-secondary-container":     "#93e9d2",

        "tertiary":           "#f0c77c",
        "tertiary-fixed":     "#ffdea5",
        "tertiary-fixed-dim": "#e9c176",
        "tertiary-container": "#d2ac64",
        "on-tertiary":        "#412d00",
        "on-tertiary-fixed":  "#261900",
        "on-tertiary-fixed-variant": "#5d4201",
        "on-tertiary-container":     "#5a3f00",

        "error":           "#ffb4ab",
        "error-container": "#93000a",
        "on-error":        "#690005",
        "on-error-container": "#ffdad6",

        "inverse-surface":    "#e2e2e2",
        "inverse-primary":    "#8f4e00",
        "inverse-on-surface": "#2f3131",

        "surface-tint": "#ffb77a",
      },
      fontFamily: {
        headline: ["var(--font-headline)", "Noto Serif", "Georgia", "serif"],
        body:     ["var(--font-body)", "Manrope", "system-ui", "sans-serif"],
        label:    ["var(--font-body)", "Manrope", "system-ui", "sans-serif"],
        sans:     ["var(--font-body)", "Manrope", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        lg:      "0.25rem",
        xl:      "0.5rem",
        "2xl":   "0.75rem",
        "3xl":   "1rem",
        full:    "9999px",
      },
      boxShadow: {
        "glow-primary": "0 0 20px rgba(255,192,141,0.15)",
        "glow-secondary": "0 0 20px rgba(129,214,192,0.15)",
      },
    },
  },
  plugins: [],
};
export default config;
