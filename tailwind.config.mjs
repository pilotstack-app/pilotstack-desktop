/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        chrono: {
          bg: "#0a0a0f",
          surface: "#12121a",
          elevated: "#1a1a25",
          border: "#2a2a3a",
          muted: "#6b7280",
          accent: "#6366f1",
          "accent-light": "#818cf8",
          glow: "#4f46e5",
          success: "#10b981",
          warning: "#f59e0b",
          danger: "#ef4444",
          // Neo-brutal palette additions
          pop: {
            pink: "#ff6b9d",
            yellow: "#ffd93d",
            cyan: "#4ecdc4",
            purple: "#a855f7",
            orange: "#ff8f4c",
          },
        },
      },
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        display: ["Space Grotesk", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        // Neo-brutal chunky shadows
        brutal: "4px 4px 0 0 rgba(0, 0, 0, 0.4)",
        "brutal-sm": "2px 2px 0 0 rgba(0, 0, 0, 0.4)",
        "brutal-lg": "6px 6px 0 0 rgba(0, 0, 0, 0.4)",
        "brutal-xl": "8px 8px 0 0 rgba(0, 0, 0, 0.4)",
        "brutal-accent": "4px 4px 0 0 rgba(99, 102, 241, 0.4)",
        "brutal-inset": "inset 2px 2px 0 0 rgba(0, 0, 0, 0.2)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        glow: "glow 2s ease-in-out infinite alternate",
        float: "float 6s ease-in-out infinite",
        recording: "recording 1.5s ease-in-out infinite",
        "bounce-subtle": "bounce-subtle 2s ease-in-out infinite",
        "scale-in": "scale-in 0.2s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
        "pop-in": "pop-in 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 20px rgba(99, 102, 241, 0.3)" },
          "100%": { boxShadow: "0 0 40px rgba(99, 102, 241, 0.6)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        recording: {
          "0%, 100%": { opacity: 1, transform: "scale(1)" },
          "50%": { opacity: 0.5, transform: "scale(0.95)" },
        },
        "bounce-subtle": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: 0 },
          "100%": { transform: "scale(1)", opacity: 1 },
        },
        "slide-up": {
          "0%": { transform: "translateY(10px)", opacity: 0 },
          "100%": { transform: "translateY(0)", opacity: 1 },
        },
        "pop-in": {
          "0%": { transform: "scale(0.8)", opacity: 0 },
          "100%": { transform: "scale(1)", opacity: 1 },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "neo-grid":
          "linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px)",
      },
      backgroundSize: {
        "neo-grid": "20px 20px",
      },
    },
  },
  plugins: [],
};
