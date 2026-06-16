/* Attachment reading — ported from chat.js readAttachment/humanSize. Reads a File
 * to RAW base64 (no `data:` prefix) for the wire `data` field, plus a data-URL
 * kept for the local thumbnail preview. */

import type { StagedAttachment } from "../../hooks/useCharaStream";

export const ATTACH_MAX_BYTES = 25 * 1024 * 1024;
export const ATTACH_ACCEPT_ALL = "image/*,.pdf,.txt,.md,.json,.csv,.docx,.doc,.xlsx,.zip,.log";

export function readAttachment(file: File): Promise<StagedAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.onload = () => {
      const url = String(reader.result || "");
      const comma = url.indexOf(",");
      const data = comma >= 0 ? url.slice(comma + 1) : url;
      resolve({
        name: file.name || "file",
        mime: file.type || "application/octet-stream",
        size: file.size || 0,
        data,
        url,
        isImage: (file.type || "").startsWith("image/"),
      });
    };
    reader.readAsDataURL(file);
  });
}

export function humanSize(n: number): string {
  n = Number(n) || 0;
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}
