import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0F0F0F",
        panel: "#1A1A1A",
        border: "#2A2A2A",
        accent: "#6366F1",
        "accent-hover": "#4F46E5",
      },
    },
  },
  plugins: [],
};
export default config;
