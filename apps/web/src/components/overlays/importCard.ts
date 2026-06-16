/* importCard — the card-file upload, a port of app.js importCardFile (1420). It
 * POSTs the raw bytes to the supervisor's `/upload` endpoint (NOT a JSON-RPC
 * method — cards.draft/from_draft create cards, but a SillyTavern PNG/JSON file is
 * uploaded as-is) with the token in the query and the filename in a header. */

import { BOOT } from "../../rpc";

/** Upload one card file. Throws on a non-OK response (body as the message). */
export async function importCardFile(file: File): Promise<void> {
  const buf = await file.arrayBuffer();
  const resp = await fetch(`/upload?token=${encodeURIComponent(BOOT.token)}`, {
    method: "POST",
    body: buf,
    headers: { "X-Filename": file.name },
  });
  if (!resp.ok) throw new Error(await resp.text());
}

/** Whether a dropped/selected filename is an importable card (app.js drop guard). */
export function isCardFile(name: string): boolean {
  const n = name.toLowerCase();
  return n.endsWith(".json") || n.endsWith(".png");
}
