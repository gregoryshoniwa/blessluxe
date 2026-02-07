import type { Config } from "tailwindcss";

const config: Omit<Config, "content"> = {
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: "#C9A84C",
          dark: "#B8860B",
          light: "#D4AF37",
        },
        cream: {
          DEFAULT: "#FDF8F3",
          dark: "#F5EDE3",
        },
        blush: "#F5E6E0",
      },
      fontFamily: {
        display: ["Cormorant Garamond", "serif"],
        body: ["Montserrat", "sans-serif"],
        script: ["Niconne", "Great Vibes", "Pinyon Script", "cursive"],
      },
    },
  },
  plugins: [],
};

export default config;
