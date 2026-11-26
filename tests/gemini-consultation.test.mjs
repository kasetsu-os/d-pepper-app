import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../api/gemini.js";
import { askGemini, INCOMPLETE_RESPONSE } from "../src/lib/geminiClient.js";

const prompt = "朝、毛先が広がります。来店時に何を相談すればよいですか？\n【出力制約】";
const png = { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/abcAAAAASUVORK5CYII=" };

// 通常の画面用クライアントと API を通し、Google からの応答だけを模擬する。
function simulateGemini(t, candidates) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "/api/gemini") {
      return POST(new Request("http://localhost:3000/api/gemini", {
        ...options,
        headers: { ...options.headers, origin: "http://localhost:3000" },
      }));
    }
    calls.push({ url, request: JSON.parse(options.body) });
    return Response.json({ candidates });
  });
  return calls;
}

process.env.GEMINI_API_KEY = "test-only";
for (const images of [[], [png]]) {
  test(images.length ? "画像つき相談" : "文章のみの相談", async (t) => {
    const start = images.length ? "添付画像も参考にします。" : "朝の状態を伺います。";
    const end = "「乾かした直後も広がりますか？」";
    const calls = simulateGemini(t, [{
      finishReason: "STOP",
      content: { parts: [{ thought: true, text: "内部メモ" }, { text: start }, { text: end }] },
    }]);
    assert.equal(await askGemini(prompt, [], images), start + end);
    assert.equal(calls.length, 1);
    const [{ url, request }] = calls;
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    assert.deepEqual(Object.keys(request.generationConfig), ["maxOutputTokens"]);
    const [{ role, parts }] = request.contents;
    assert.equal(role, "user");
    assert.ok(parts[0].text.includes("朝、毛先が広がります。"));
    assert.deepEqual(parts.slice(1), images.map((inlineData) => ({ inlineData })));
  });
}

for (const [label, candidates] of [
  ["出力上限", [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "ここで途中。" }] } }]],
  ["候補なし", []],
  ["本文なし", [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "内部メモ" }] } }]],
]) {
  test(label + "のときは完了した回答として返さない", async (t) => {
    simulateGemini(t, candidates);
    await assert.rejects(askGemini(prompt, [], [png]), { code: INCOMPLETE_RESPONSE });
  });
}
