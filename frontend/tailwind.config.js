/**
 * Theme from New-SmartPOS/DESIGN (see src/styles/design.css for the CSS tokens and component classes).
 *
 * Pages are written with Tailwind's stock palette (gray-*, blue-*, emerald-*, ...). Rather than rewrite
 * every class, those palettes are re-pointed at the design system's colours here, so the whole app
 * picks up the same neutrals, navy brand, and status colours.
 */

// Neutrals: --surface-2 … --ink from the design system.
const neutral = {
  50: "#F8FAF9",
  100: "#F1F5F3",
  200: "#E3E8E5",
  300: "#D3DAD6",
  400: "#94A099",
  500: "#6B7670",
  600: "#525E58",
  700: "#3D4A44",
  800: "#26332D",
  900: "#15211B",
  950: "#0B1410",
};

// Brand navy: --green-light … --green-deep, --nav-bg (the design system calls its primary "green").
const navy = {
  50: "#E8EEFB",
  100: "#D3DEF7",
  200: "#AFC2EF",
  300: "#82A0E6",
  400: "#5A86E4",
  500: "#3B6FE0",
  600: "#1E3A8A",
  700: "#16296B",
  800: "#0F1E4D",
  900: "#0A1B2E",
  950: "#06101C",
};

// --color-status-success
const success = {
  50: "#E9F7F0",
  100: "#CDEEDD",
  200: "#9EDCBD",
  300: "#66C597",
  400: "#34AF75",
  500: "#169A5B",
  600: "#128350",
  700: "#0F6B42",
  800: "#0C5535",
  900: "#0A452C",
  950: "#052619",
};

// --red
const danger = {
  50: "#FBEAEA",
  100: "#F7D4D4",
  200: "#EFA9A9",
  300: "#E57B7B",
  400: "#DD4F4F",
  500: "#D62828",
  600: "#BC1F1F",
  700: "#9B1A1A",
  800: "#7B1616",
  900: "#621313",
  950: "#380909",
};

// --amber / --gold
const amber = {
  50: "#FBF1DD",
  100: "#F7E4BC",
  200: "#EFCB85",
  300: "#E5B159",
  400: "#D4A017",
  500: "#B7791F",
  600: "#9C6419",
  700: "#7D4F15",
  800: "#613D12",
  900: "#4D310F",
  950: "#2B1A06",
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        gray: neutral,
        slate: neutral,
        stone: neutral,
        zinc: neutral,
        neutral,
        blue: navy,
        indigo: navy,
        green: success,
        emerald: success,
        red: danger,
        rose: danger,
        amber,
        yellow: amber,

        brand: {
          DEFAULT: "#1E3A8A",
          dark: "#16296B",
          deep: "#0F1E4D",
          light: "#E8EEFB",
          bright: "#3B6FE0",
          sidebar: "#0A1B2E",
          gold: "#D4A017",
        },
        page: "#F4F7F5",
        ink: { DEFAULT: "#15211B", 2: "#3D4A44" },

        // shadcn/ui tokens (components/ui/*), as fixed colours from the design system
        border: "#E3E8E5",
        input: "#D3DAD6",
        ring: "#1E3A8A",
        background: "#F4F7F5",
        foreground: "#15211B",
        primary: { DEFAULT: "#1E3A8A", foreground: "#FFFFFF" },
        secondary: { DEFAULT: "#F1F5F3", foreground: "#15211B" },
        destructive: { DEFAULT: "#D62828", foreground: "#FFFFFF" },
        muted: { DEFAULT: "#F1F5F3", foreground: "#6B7670" },
        accent: { DEFAULT: "#F1F5F3", foreground: "#15211B" },
        popover: { DEFAULT: "#FFFFFF", foreground: "#15211B" },
        card: { DEFAULT: "#FFFFFF", foreground: "#15211B" },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["Space Grotesk", "Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        lg: "10px",
        md: "8px",
        sm: "6px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
