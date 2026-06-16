/* deckToast — a self-contained imperative toast, a faithful port of app.js:109
 * toast() + 117 workingToast(). Module-level (no provider needed, so App.tsx
 * stays untouched): it lazily mounts ONE `.toast-wrap` host in document.body and
 * appends `.toast` nodes, matching the vanilla markup + CSS. Namespaced
 * `deckToast` to avoid colliding with any future shared toast system. */

function host(): HTMLElement {
  let wrap = document.getElementById("lm-deck-toasts");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "lm-deck-toasts";
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  return wrap;
}

/** A transient toast (app.js:109). Errors linger longer + get the .err style. */
export function deckToast(msg: string, isErr = false): void {
  const node = document.createElement("div");
  node.className = "toast" + (isErr ? " err" : "");
  node.textContent = msg;
  host().appendChild(node);
  setTimeout(() => node.remove(), isErr ? 5200 : 3200);
}

/** A sticky spinner toast for a slow call (app.js:117 workingToast). Returns a
 *  dismiss fn — call it the instant the call resolves so the wait is never
 *  silent. */
export function deckWorkingToast(msg: string): () => void {
  const node = document.createElement("div");
  node.className = "toast";
  const spin = document.createElement("span");
  spin.className = "spin";
  node.appendChild(spin);
  node.appendChild(document.createTextNode(" " + msg));
  host().appendChild(node);
  return () => node.remove();
}
