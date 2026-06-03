import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// In a real deployment this app runs inside an Electron shell that provides
// window.storage. Shim it with localStorage for browser-based development.
if (import.meta.env.DEV && typeof window.storage === "undefined") {
  window.storage = {
    get: async (key) => {
      const v = localStorage.getItem(key);
      return v ? { value: v } : null;
    },
    set: async (key, value) => {
      localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    },
  };
}

createRoot(document.getElementById("root")).render(
  <StrictMode><App /></StrictMode>
);
