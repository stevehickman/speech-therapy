import { useState } from "react";
import ApiKeySetup from "./ApiKeySetup.jsx";
import PpaApp from "./ppa-speech-therapy-bundle.jsx";

export default function App() {
  const [hasKey, setHasKey] = useState(
    () => Boolean(localStorage.getItem("ppa_api_key"))
  );

  if (!hasKey) {
    return <ApiKeySetup onSave={() => setHasKey(true)} />;
  }

  return <PpaApp />;
}
