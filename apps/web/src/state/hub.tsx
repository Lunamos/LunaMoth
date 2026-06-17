import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { HubClient } from "../rpc";
import type { SessionSnapshot } from "../lib/status";

/* The board-level connection + roster snapshot, shared by every view.
   The HubClient reconnects forever; we re-fetch hub.state on (re)connect and
   whenever the hub pushes a notification (life.state etc.), so the board stays
   live without polling. Mirrors app.js's `state.hub` + refreshHub(). */

export interface BoardSession extends SessionSnapshot {
  name: string;
  char_name: string;
  mode: string;
  lang: string;
  speaks?: string[];
}

/** hub.state response — only the fields the board reads are typed; the rest is
 *  tolerated (forward-compat with the Python HubDispatcher). */
export interface HubSnapshot {
  sessions: BoardSession[];
  [k: string]: unknown;
}

interface HubContextValue {
  hub: HubClient;
  connected: boolean;
  snapshot: HubSnapshot | null;
  refresh: () => Promise<void>;
}

const HubContext = createContext<HubContextValue | null>(null);

export function HubProvider({ children }: { children: ReactNode }) {
  const hub = useMemo(() => new HubClient(), []);
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<HubSnapshot | null>(null);
  const refreshing = useRef(false);
  const refreshAgain = useRef(false);

  const refresh = useMemo(
    () => {
      // Coalesce: if a push arrives while a refresh is in flight, don't DROP it
      // (that left the roster stale until the next push) — flag a trailing re-run
      // so we always converge on the latest hub.state.
      const run = async (): Promise<void> => {
        if (refreshing.current) {
          refreshAgain.current = true;
          return;
        }
        refreshing.current = true;
        try {
          const snap = await hub.call<HubSnapshot>("hub.state", {}, 20000);
          setSnapshot(snap);
        } catch {
          /* a failed refresh leaves the last good snapshot; reconnect drives the next */
        } finally {
          refreshing.current = false;
        }
        if (refreshAgain.current) {
          refreshAgain.current = false;
          await run();
        }
      };
      return run;
    },
    [hub],
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 150);
    };
    hub.onReady = () => {
      setConnected(true);
      void refresh();
    };
    hub.onDown = () => setConnected(false);
    // Board-relevant pushes (life.state, hello, …) → re-fetch the roster.
    hub.sock.onEvent = () => debouncedRefresh();
    void hub.start();
    return () => {
      if (timer) clearTimeout(timer);
      hub.stop();
    };
  }, [hub, refresh]);

  const value = useMemo(
    () => ({ hub, connected, snapshot, refresh }),
    [hub, connected, snapshot, refresh],
  );
  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
}

export function useHub(): HubContextValue {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error("useHub must be used within a HubProvider");
  return ctx;
}
