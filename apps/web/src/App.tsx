import { I18nProvider } from "./i18n";
import { HubProvider, useHub } from "./state/hub";
import { useHashRoute } from "./hooks/useHashRoute";
import { Sidebar } from "./components/Sidebar";
import { Board } from "./views/Board";
import { Deck } from "./views/Deck";
import { Gateways } from "./views/Gateways";
import { Settings } from "./views/Settings";
import { Chat } from "./views/Chat";

/* The shell — providers + sidebar + the routed view. Hash routing (useHashRoute)
   switches the main pane; the chara page is a full-bleed view without the board
   chrome. Views land per Track C against this contract (see Board.tsx). */

function Shell() {
  const route = useHashRoute();
  const { connected } = useHub();

  return (
    <div id="app">
      <Sidebar view={route.view} />
      <div className="main">
        {route.view === "board" && <Board />}
        {route.view === "deck" && <Deck />}
        {route.view === "gateways" && <Gateways />}
        {route.view === "settings" && <Settings />}
        {route.view === "chat" && route.name && <Chat name={route.name} sub={route.sub} />}
      </div>
      <div id="statusbar">
        <span className="grow" />
        <i id="conn-dot" className={connected ? "ok" : ""} />
      </div>
    </div>
  );
}

export function App() {
  return (
    <I18nProvider>
      <HubProvider>
        <Shell />
      </HubProvider>
    </I18nProvider>
  );
}
