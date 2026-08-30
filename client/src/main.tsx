import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { startReleaseSync } from "./lib/release-sync";

createRoot(document.getElementById("root")!).render(<App />);
startReleaseSync();
