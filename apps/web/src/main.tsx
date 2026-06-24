import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initTheme } from "./theme";
import { mintAuthCookie } from "./rpc";
import "./styles/global.css";
import "./styles/mobile.css";  // small-screen overrides — loaded after global.css so they win

initTheme();
// Mint the auth cookie before the first asset/image renders (fire-and-forget;
// asset-bearing views load their data over the WS first, so the cookie is set
// well before any <img src="/asset"> appears). See rpc.mintAuthCookie.
void mintAuthCookie();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
