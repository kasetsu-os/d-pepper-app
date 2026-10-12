// Dペッパー API 防御の模擬テスト（2026-10 保守点検）
// 実行: node tests/api-guard.test.mjs
// 外部通信はしない（fetch を差し替えて Gemini / Googleフォーム / URL取得を模擬）。
// 注意: 実ブラウザ・実画像・Vercel本番環境での確認の代わりにはならない。

import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.GEMINI_API_KEY = "TESTKEY";

const calls = [];
globalThis.fetch = async (url, opt = {}) => {
  calls.push({ url: String(url), opt });
  if (String(url).includes("generativelanguage")) {
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] }), { status: 200 });
  }
  if (String(url).includes("docs.google.com")) return new Response("", { status: 302 });
  if (String(url).includes("redirect.example.com")) {
    return new Response("", { status: 302, headers: { location: "http://169.254.169.254/" } });
  }
  return new Response("<html><body>商品ページ</body></html>", { status: 200, headers: { "content-type": "text/html" } });
};
const quiet = () => {};
const realLog = console.log;
console.log = console.warn = console.error = quiet;

const g = await import(path.join(root, "api/gemini.js"));
const sh = await import(path.join(root, "api/share-history.js"));

let ipCounter = 0;
const req = (body, { origin = "https://d-pepper-app.vercel.app", ip } = {}) =>
  new Request("https://x/api", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
      "x-forwarded-for": ip || `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`,
    },
    body: JSON.stringify(body),
  });

const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
const expectStatus = async (name, p, exp) => {
  const r = await p;
  check(name, r.status === exp, `status ${r.status} (期待 ${exp})`);
  return r;
};
const geminiPrompt = () => calls.filter((c) => c.url.includes("generativelanguage")).at(-1);

const P = "相談文\n【出力制約】\n…";
const img = (n) => ({ mimeType: "image/jpeg", data: "A".repeat(n) });

// ── 通常動作 ──
await expectStatus("通常の相談", g.POST(req({ prompt: P })), 200);
const last = geminiPrompt();
check("APIキーがURLに含まれない", !last.url.includes("key="));
check("APIキーはヘッダーで渡す", last.opt.headers["x-goog-api-key"] === "TESTKEY");
await expectStatus("リクルートモード", g.POST(req({ prompt: P, mode: "recruit" })), 200);
await expectStatus("プレビュー環境のOrigin", g.POST(req({ prompt: P }, { origin: "https://d-pepper-app-git-abc-kasetsu.vercel.app" })), 200);
// 画面側の縮小設定（1280px / 品質0.75）での最悪ケース ≒ 1枚 約1.0M文字 × 3枚
await expectStatus("最悪ケース相当の画像3枚（各100万文字）", g.POST(req({ prompt: P, images: [img(1_000_000), img(1_000_000), img(1_000_000)] })), 200);

// ── 入力の上限 ──
await expectStatus("Originなし", g.POST(req({ prompt: P }, { origin: null })), 403);
await expectStatus("他サイトのOrigin", g.POST(req({ prompt: P }, { origin: "https://evil.example" })), 403);
await expectStatus("指示文 40,001文字", g.POST(req({ prompt: "a".repeat(40_001) })), 400);
await expectStatus("画像4枚", g.POST(req({ prompt: P, images: [1, 2, 3, 4].map(() => img(10)) })), 400);
await expectStatus("画像以外の形式", g.POST(req({ prompt: P, images: [{ mimeType: "text/html", data: "AAAA" }] })), 400);
await expectStatus("画像1枚が上限超え", g.POST(req({ prompt: P, images: [img(2_000_001)] })), 400);
await expectStatus("不明なモード", g.POST(req({ prompt: P, mode: "admin" })), 400);
await expectStatus("URL 4件", g.POST(req({ prompt: P, urls: ["https://a.jp", "https://b.jp", "https://c.jp", "https://d.jp"] })), 400);

// ── URL読み込み停止（API直接呼び出しでも外部接続しない）──
let before = calls.length;
let r = await expectStatus("内部アドレスURLつき（停止中）", g.POST(req({ prompt: P, urls: ["http://169.254.169.254/latest/meta-data"] })), 200);
let body = await r.json();
check("停止中はURLへ一切接続しない（Gemini呼び出しのみ）", calls.length === before + 1 && !calls.slice(before).some((c) => c.url.includes("169.254")));
check("urlStatus = disabled", body.urlStatus === "disabled");
check("AIへの指示に一時停止の案内が入る", geminiPrompt().opt.body.includes("一時停止"));

// ── 連続送信 ──
for (let i = 0; i < 6; i++) await g.POST(req({ prompt: P }, { ip: "9.9.9.9" }));
await expectStatus("同じIPから1分以内に7回目", g.POST(req({ prompt: P }, { ip: "9.9.9.9" })), 429);

// ── 履歴共有 ──
const item = { id: 1, createdAt: new Date().toISOString(), category: "カラー相談", text: "t", aiResponse: "a" };
await expectStatus("履歴共有 通常", sh.POST(req({ item })), 200);
await expectStatus("履歴共有 他サイトのOrigin", sh.POST(req({ item }, { origin: "https://evil.example" })), 403);
await expectStatus("履歴共有 不正な形式", sh.POST(req({ item: { ...item, text: { x: 1 } } })), 400);
for (let i = 0; i < 3; i++) await sh.POST(req({ item }, { ip: "8.8.8.8" }));
await expectStatus("履歴共有 同じIPから1分以内に4回目", sh.POST(req({ item }, { ip: "8.8.8.8" })), 429);

// ── 参考：URL読み込みを再開した場合（URL_FETCH_ENABLED=true）の制限 ──
process.env.URL_FETCH_ENABLED = "true";
const g2 = await import(path.join(root, "api/gemini.js") + "?enabled");
before = calls.length;
await g2.POST(req({ prompt: P, urls: ["http://169.254.169.254/", "https://10.0.0.1/", "https://localhost/", "https://metadata.google.internal/"] }));
check("再開時も内部アドレス・IP直書き・http は接続しない", !calls.slice(before).some((c) => !c.url.includes("generativelanguage")));
before = calls.length;
r = await g2.POST(req({ prompt: P, urls: ["https://redirect.example.com/x"] }));
const urlCall = calls.slice(before).find((c) => c.url.includes("redirect.example.com"));
check("再開時は転送先を自動で追わない", urlCall?.opt.redirect === "manual" && !calls.slice(before).some((c) => c.url.includes("169.254")));

console.log = realLog;
console.log(results.join("\n"));
const failed = results.filter((x) => x.startsWith("FAIL")).length;
console.log(`\n合計 ${results.length} 項目 / 失敗 ${failed}`);
process.exit(failed ? 1 : 0);
