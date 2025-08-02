import type { Config } from "tailwindcss";
import { heroui } from "@heroui/react";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  darkMode: "class",
  plugins: [heroui({
    themes: {
    "purple": {
      extend: "light",
      "colors": {
        "default": {
          "50": "#f0eff8",
          "100": "#dcd8ee",
          "200": "#c7c1e3",
          "300": "#b2aad9",
          "400": "#9e93cf",
          "500": "#897cc5",
          "600": "#7166a3",
          "700": "#595180",
          "800": "#413b5e",
          "900": "#29253b",
          "foreground": "#000",
          "DEFAULT": "#897cc5"
        },
        "primary": {
          "50": "#eee4f8",
          "100": "#d7bfef",
          "200": "#bf99e5",
          "300": "#a773db",
          "400": "#904ed2",
          "500": "#7828c8",
          "600": "#6321a5",
          "700": "#4e1a82",
          "800": "#39135f",
          "900": "#240c3c",
          "foreground": "#fff",
          "DEFAULT": "#7828c8"
        },
        "secondary": {
          "50": "#e9edff",
          "100": "#cbd4ff",
          "200": "#adbcff",
          "300": "#8fa3ff",
          "400": "#708aff",
          "500": "#5271ff",
          "600": "#445dd2",
          "700": "#3549a6",
          "800": "#273679",
          "900": "#19224d",
          "foreground": "#000",
          "DEFAULT": "#5271ff"
        },
        "success": {
          "50": "#e3f8ef",
          "100": "#bbedd8",
          "200": "#93e3c1",
          "300": "#6bd9ab",
          "400": "#43ce94",
          "500": "#1bc47d",
          "600": "#16a267",
          "700": "#127f51",
          "800": "#0d5d3b",
          "900": "#083b26",
          "foreground": "#000",
          "DEFAULT": "#1bc47d"
        },
        "warning": {
          "50": "#fff5df",
          "100": "#ffe8b3",
          "200": "#ffda86",
          "300": "#ffcc59",
          "400": "#ffbf2d",
          "500": "#ffb100",
          "600": "#d29200",
          "700": "#a67300",
          "800": "#795400",
          "900": "#4d3500",
          "foreground": "#000",
          "DEFAULT": "#ffb100"
        },
        "danger": {
          "50": "#ffe9e9",
          "100": "#ffcaca",
          "200": "#ffabab",
          "300": "#ff8d8d",
          "400": "#ff6e6e",
          "500": "#ff4f4f",
          "600": "#d24141",
          "700": "#a63333",
          "800": "#792626",
          "900": "#4d1818",
          "foreground": "#000",
          "DEFAULT": "#ff4f4f"
        },
        "background": "#f9f7fd",
        "foreground": "#4a3d77",
        "content1": {
          "DEFAULT": "#f2e8ff",
          "foreground": "#000"
        },
        "content2": {
          "DEFAULT": "#e8daff",
          "foreground": "#000"
        },
        "content3": {
          "DEFAULT": "#dccbff",
          "foreground": "#000"
        },
        "content4": {
          "DEFAULT": "#cfbcff",
          "foreground": "#000"
        },
        "focus": "#7828c8",
        "overlay": "#000000"
      }
    },
    "purple-dark": {
      extend: "dark",
      "colors": {
        "default": {
          "50": "#08070b",
          "100": "#100d15",
          "200": "#181420",
          "300": "#201a2a",
          "400": "#282135",
          "500": "#534d5d",
          "600": "#7e7a86",
          "700": "#a9a6ae",
          "800": "#d4d3d7",
          "900": "#ffffff",
          "foreground": "#fff",
          "DEFAULT": "#282135"
        },
        "primary": {
          "50": "#2c193f",
          "100": "#462764",
          "200": "#603689",
          "300": "#7944ae",
          "400": "#9353d3",
          "500": "#a671db",
          "600": "#b98fe2",
          "700": "#ccadea",
          "800": "#dfcbf2",
          "900": "#f2eafa",
          "foreground": "#fff",
          "DEFAULT": "#9353d3"
        },
        "secondary": {
          "50": "#1e254d",
          "100": "#2f3a79",
          "200": "#404fa6",
          "300": "#5265d2",
          "400": "#637aff",
          "500": "#7e91ff",
          "600": "#9aa9ff",
          "700": "#b5c0ff",
          "800": "#d0d7ff",
          "900": "#eceeff",
          "foreground": "#000",
          "DEFAULT": "#637aff"
        },
        "success": {
          "50": "#0b412a",
          "100": "#116743",
          "200": "#178d5c",
          "300": "#1db374",
          "400": "#23d98d",
          "500": "#4ae0a1",
          "600": "#70e6b5",
          "700": "#97edc9",
          "800": "#bdf4dd",
          "900": "#e4faf1",
          "foreground": "#000",
          "DEFAULT": "#23d98d"
        },
        "warning": {
          "50": "#4d3d11",
          "100": "#79601c",
          "200": "#a68326",
          "300": "#d2a730",
          "400": "#ffca3a",
          "500": "#ffd35c",
          "600": "#ffdd7f",
          "700": "#ffe6a1",
          "800": "#ffefc4",
          "900": "#fff8e6",
          "foreground": "#000",
          "DEFAULT": "#ffca3a"
        },
        "danger": {
          "50": "#4d2020",
          "100": "#793333",
          "200": "#a64646",
          "300": "#d25858",
          "400": "#ff6b6b",
          "500": "#ff8585",
          "600": "#ff9f9f",
          "700": "#ffb9b9",
          "800": "#ffd3d3",
          "900": "#ffeded",
          "foreground": "#000",
          "DEFAULT": "#ff6b6b"
        },
        "background": "#1b1526",
        "foreground": "#d0aaff",
        "content1": {
          "DEFAULT": "#392a4a",
          "foreground": "#fff"
        },
        "content2": {
          "DEFAULT": "#4c3560",
          "foreground": "#fff"
        },
        "content3": {
          "DEFAULT": "#5e4180",
          "foreground": "#fff"
        },
        "content4": {
          "DEFAULT": "#704ea0",
          "foreground": "#fff"
        },
        "focus": "#9353d3",
        "overlay": "#ffffff"
      }
    }
  },
  "layout": {
    "disabledOpacity": "0.5"
  }
  })],
};
export default config;