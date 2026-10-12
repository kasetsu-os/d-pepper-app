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
await expectStatus("登録していないプレビュー風のOriginは拒否", g.POST(req({ prompt: P }, { origin: "https://d-pepper-app-git-abc-kasetsu.vercel.app" })), 403);
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
// 上限3件に引っかからないよう、1件ずつ送って「接続先の判定」まで到達させる
process.env.URL_FETCH_ENABLED = "true";
const g2 = await import(path.join(root, "api/gemini.js") + "?enabled");
const outbound = (from) => calls.slice(from).filter((c) => !c.url.includes("generativelanguage"));
// 陽性対照：普通の https のページには接続する（＝判定処理まで到達していることの確認）
before = calls.length;
await expectStatus("再開時：通常の https URL 1件", g2.POST(req({ prompt: P, urls: ["https://shop.example.jp/item"] })), 200);
check("再開時：通常の https URL には接続する（陽性対照）", outbound(before).length === 1);
for (const bad of [
  "http://169.254.169.254/latest/meta-data",
  "https://169.254.169.254/",
  "https://10.0.0.1/",
  "https://[::1]/",
  "https://localhost/",
  "https://metadata.google.internal/",
  "https://printer.local/",
  "https://user:pass@shop.example.jp/",
  "https://shop.example.jp:8443/",
]) {
  before = calls.length;
  const r2 = await g2.POST(req({ prompt: P, urls: [bad] }));
  check(`再開時：${bad} には接続しない`, r2.status === 200 && outbound(before).length === 0, `status ${r2.status}`);
}
before = calls.length;
await g2.POST(req({ prompt: P, urls: ["https://redirect.example.com/x"] }));
const urlCall = calls.slice(before).find((c) => c.url.includes("redirect.example.com"));
check("再開時：転送先を自動で追わない", urlCall?.opt.redirect === "manual" && !calls.slice(before).some((c) => c.url.includes("169.254")));
delete process.env.URL_FETCH_ENABLED;

// ── 本文の容量は「バイト数」で判定する ──
const streamReq = (text, { chunk = 16_384, origin = "https://d-pepper-app.vercel.app" } = {}) => {
  const bytes = new TextEncoder().encode(text);
  let pulled = 0;
  const stream = new ReadableStream({
    pull(ctrl) {
      if (pulled >= bytes.length) return ctrl.close();
      ctrl.enqueue(bytes.slice(pulled, pulled + chunk));
      pulled += chunk;
    },
  });
  const r = new Request("https://x/api", {
    method: "POST", body: stream, duplex: "half",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": `10.9.${++ipCounter % 250}.1` },
  });
  return { r, pulled: () => pulled, total: bytes.length };
};
{
  // 日本語は1文字3バイト：約4万文字 ≒ 12万バイト（共有APIの上限は10万バイト）。容量ヘッダーなし
  const text = JSON.stringify({ item: { id: 1, createdAt: new Date().toISOString(), text: "あ".repeat(40_000) } });
  const s1 = streamReq(text);
  check("容量ヘッダーなし・日本語12万バイトの共有は拒否", !s1.r.headers.get("content-length") && (await sh.POST(s1.r)).status === 413,
    `文字数 ${text.length} / バイト数 ${s1.total}`);
  const s2 = streamReq(JSON.stringify({ prompt: "x", pad: "A".repeat(6_000_000) }));
  const st = (await g.POST(s2.r)).status;
  check("上限超えは途中で読み込みを止める", st === 413 && s2.pulled() < s2.total, `読み込み ${s2.pulled()} / 全体 ${s2.total} バイト`);
  const s3 = streamReq(JSON.stringify({ item: { id: 1, createdAt: new Date().toISOString(), text: "あ".repeat(20_000) } }));
  check("上限内（日本語6万バイト）の共有は通る", (await sh.POST(s3.r)).status === 200);
}

// ── Origin の許可は完全一致（環境別） ──
{
  const { originAllowed } = await import(path.join(root, "api/_guard.js"));
  const o = (origin) => new Request("https://x/", { headers: { origin } });
  const prev = { VERCEL_ENV: "preview", VERCEL_URL: "d-pepper-app-abc123-kasetsu.vercel.app", VERCEL_BRANCH_URL: "d-pepper-app-git-fix-kasetsu.vercel.app" };
  const prod = { VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "d-pepper-app.vercel.app" };
  check("本番：本番URLは許可", originAllowed(o("https://d-pepper-app.vercel.app"), prod));
  check("本番：プレビュー風の名前は拒否", !originAllowed(o("https://d-pepper-app-evil.vercel.app"), prod));
  check("本番：localhost は拒否", !originAllowed(o("http://localhost:5173"), prod));
  check("プレビュー：そのデプロイ自身のURLは許可", originAllowed(o("https://d-pepper-app-abc123-kasetsu.vercel.app"), prev));
  check("プレビュー：ブランチURLは許可", originAllowed(o("https://d-pepper-app-git-fix-kasetsu.vercel.app"), prev));
  check("プレビュー：別のプレビュー風URLは拒否", !originAllowed(o("https://d-pepper-app-zzz-kasetsu.vercel.app"), prev));
  check("プレビュー：localhost は拒否", !originAllowed(o("http://localhost:5173"), prev));
  check("ローカル開発：localhost は許可", originAllowed(o("http://localhost:5173"), {}));
  check("ALLOWED_ORIGINS は完全一致", originAllowed(o("https://dpepper.example.jp"), { ...prod, ALLOWED_ORIGINS: "https://dpepper.example.jp/" }) &&
    !originAllowed(o("https://dpepper.example.jp.evil.com"), { ...prod, ALLOWED_ORIGINS: "https://dpepper.example.jp" }));
}

// ── 画面側とサーバー側の上限が一致していること ──
{
  const B = await import(path.join(root, "src/lib/imageBudget.js"));
  const one = (n) => [{ name: "a", mimeType: "image/jpeg", data: "A".repeat(n) }];
  check("1枚 2,000,000文字：画面側OK・サーバー側OK",
    B.withinLimits(one(2_000_000)) && (await g.POST(req({ prompt: P, images: one(2_000_000) }))).status === 200);
  check("1枚 2,000,004文字：画面側NG・サーバー側NG（判断が一致）",
    !B.withinLimits(one(2_000_004)) && (await g.POST(req({ prompt: P, images: one(2_000_004) }))).status === 400);
  // 画面側が送れると判断した最大構成をサーバーが受け付ける
  const per = Math.floor(B.IMAGE_BUDGET_CHARS / 3);
  const imgs3 = [0, 1, 2].map(() => ({ mimeType: "image/jpeg", data: "A".repeat(per) }));
  check("画面側の上限ぎりぎり3枚をサーバーが受け付ける", B.withinLimits(imgs3) && (await g.POST(req({ prompt: P, images: imgs3 }))).status === 200);
}

// ── URLが4件以上でも、画面側で3件に揃えてから送る ──
{
  let sent;
  const saved = globalThis.fetch;
  globalThis.fetch = async (url, opt) => { if (String(url) !== "/api/gemini") return saved(url, opt); sent = JSON.parse(opt.body); return g.POST(new Request("https://x/api", { method: "POST", body: opt.body, headers: { "content-type": "application/json", origin: "https://d-pepper-app.vercel.app", "x-forwarded-for": "10.8.8.8" } })); };
  const { askGemini } = await import(path.join(root, "src/lib/geminiClient.js"));
  let ok = false;
  try { ok = (await askGemini(P, ["https://a.jp", "https://b.jp", "https://c.jp", "https://d.jp", "https://e.jp"])) === "ok"; } catch { ok = false; }
  globalThis.fetch = saved;
  check("URL 5件の相談も、3件に揃えて送られ返答が出る", ok && sent.urls.length === 3);
}

console.log = realLog;
console.log(results.join("\n"));
const failed = results.filter((x) => x.startsWith("FAIL")).length;
console.log(`\n合計 ${results.length} 項目 / 失敗 ${failed}`);
process.exit(failed ? 1 : 0);
