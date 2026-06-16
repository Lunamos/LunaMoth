import { useT } from "../i18n";
import { useNavigate, type ChatSub } from "../hooks/useHashRoute";

/* STUB — the Chat view is the largest Track C piece (stream renderer, muse/think/
   tool/attachment rendering, composer, works + terminal sub-pages, the right
   panel tabs). Filled in by a dedicated follow-up against the shell + the
   ported rpc.ts CharaClient + protocol.ts event union. See §5/§6 of the plan. */
export function Chat({ name, sub }: { name: string; sub: ChatSub }) {
  const t = useT();
  const nav = useNavigate();
  return (
    <div className="view active" id="view-chat">
      <div className="chat-root">
        <div className="chat-col">
          <div className="chat-head">
            <button className="back" onClick={() => nav("#/")}>
              ‹
            </button>
            <div className="who">
              <b>{name}</b>
            </div>
          </div>
          <div className="placeholder-pane">
            {t("tab-chat")} · {sub} — Track C (stream view pending)
          </div>
        </div>
      </div>
    </div>
  );
}
