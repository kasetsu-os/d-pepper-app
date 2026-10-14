import { bodyByteLength, PAYLOAD_TOO_LARGE, REQUEST_LIMIT_BYTES } from "./imageBudget.js";
import { MAX_URLS } from "./limits.js";

export async function askGemini(prompt, urls = [], images = [], mode = "customer") {
  console.log("Sending images count:", images?.length || 0);
  // URL欄と相談文中のURLを合わせると上限を超えることがあるため、サーバーの上限件数までに揃える
  const body = JSON.stringify({ prompt, urls: (urls || []).slice(0, MAX_URLS), images, mode });

  // 送信前に、実際に送るデータ全体の容量を測る（2026-10 保守点検）
  const bytes = bodyByteLength(body);
  if (bytes > REQUEST_LIMIT_BYTES) {
    console.warn("Request too large, not sent | bytes:", bytes);
    const e = new Error(PAYLOAD_TOO_LARGE);
    e.code = PAYLOAD_TOO_LARGE;
    throw e;
  }

  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (res.status === 413) {
    const e = new Error(PAYLOAD_TOO_LARGE);
    e.code = PAYLOAD_TOO_LARGE;
    throw e;
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message = errBody?.error ?? "(no message)";
    throw new Error(`Gemini API error: ${res.status} – ${message}`);
  }

  const data = await res.json();

  if (!data.text) {
    throw new Error("Gemini response has no text");
  }

  console.log("AI response length:", data.text.length);

  return data.text;
}
