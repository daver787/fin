import type { Config } from "tailwindcss";

// Dark trading-terminal theme (SPEC §2). Backgrounds avoid pure black; accents
// follow the spec palette. Semantic up/down colors drive price-flash animations.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Layered surfaces — darkest base up to raised panels/borders.
        bg: {
          base: "#0d1117",
          deep: "#1a1a2e",
          panel: "#161b22",
          raised: "#21262d",
        },
        border: {
          muted: "#30363d",
          subtle: "#21262d",
        },
        accent: {
          yellow: "#ecad0a",
          blue: "#209dd7",
          purple: "#753991",
        },
        // P&L / price direction semantics.
        up: "#26a641",
        down: "#f85149",
        // Connection-status dot states.
        status: {
          connected: "#26a641",
          reconnecting: "#ecad0a",
          disconnected: "#f85149",
        },
        text: {
          primary: "#e6edf3",
          muted: "#8b949e",
          faint: "#6e7681",
        },
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      keyframes: {
        "flash-up": {
          "0%": { backgroundColor: "rgba(38, 166, 65, 0.45)" },
          "100%": { backgroundColor: "transparent" },
        },
        "flash-down": {
          "0%": { backgroundColor: "rgba(248, 81, 73, 0.45)" },
          "100%": { backgroundColor: "transparent" },
        },
      },
      animation: {
        // ~500ms fade per SPEC §2 price-flash effect.
        "flash-up": "flash-up 500ms ease-out",
        "flash-down": "flash-down 500ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
