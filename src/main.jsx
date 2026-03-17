import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../ppa-source/ppa-speech-therapy_main.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
