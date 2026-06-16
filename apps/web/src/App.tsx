import { useEffect, useState } from "react";
import { HubClient } from "./rpc";

/* Minimal shell — Track A scaffold. The real views (Board / Deck / Gateways /
   Settings / Chat) land in Track C; this proves the toolchain + the live hub
   connection end-to-end. Hash routing is set up here so deep links survive. */

type HubState = "connecting" | "ready" | "down";

export function App() {
  const [hub] = useState(() => new HubClient());
  const [state, setState] = useState<HubState>("connecting");

  useEffect(() => {
    hub.onReady = () => setState("ready");
    hub.onDown = () => setState("down");
    void hub.start();
    return () => hub.stop();
  }, [hub]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">LunaMoth</span>
        <span className={`hub-state hub-${state}`} data-state={state}>
          {state}
        </span>
      </header>
      <main className="app-main">
        {/* Track C replaces this with the routed views. */}
        <p>renderer scaffold ready — views land in Track C.</p>
      </main>
    </div>
  );
}
