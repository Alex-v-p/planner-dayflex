/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#17211b",
          800: "#2c3d34",
          600: "#597166",
        },
        mist: {
          50: "#f7fbf8",
          100: "#eaf3ef",
          200: "#cfe1d8",
        },
        meadow: {
          50: "#edf7f1",
          600: "#477b5a",
          700: "#356346",
          800: "#244833",
        },
        signal: {
          600: "#b45309",
          700: "#92400e",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      boxShadow: {
        focus: "0 0 0 3px rgb(71 123 90 / 0.28)",
      },
    },
  },
  plugins: [],
};
