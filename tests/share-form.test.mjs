// 履歴共有 → Googleフォーム → 通知メール の流れの確認（2026-10 保守点検）
// 実行: node tests/share-form.test.mjs
// 本物の Googleフォーム・メールには送らない。必須項目を検査する「模擬フォーム」と、
// MailApp を差し替えた通知スクリプトで、送信 → 記録 → 通知 を再現する。
// 返信の質問の項目ID・選択肢は api/_share-form.js の REPLY_FIELD（店長がフォームで確認した値）を使う。

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quiet = () => {};
const realLog = console.log;
console.log = console.warn = console.error = quiet;

const F = await import(path.join(root, "api/_share-form.js"));
const sh = await import(path.join(root, "api/share-history.js"));
const gsSource = await readFile(path.join(root, "docs/dpepper-form-notification.gs"), "utf8");

const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);

// ── 模擬フォーム：必須項目・選択肢を Google と同じように検査し、受け付けた回答を記録する ──
// 本物のフォームの項目ID（2026-10-14 確認）。REPLY_FIELD がこれと一致していることもテストする
const FORM_REPLY_ENTRY = "entry.1518046549";
const TEST_REPLY_FIELD = { entry: FORM_REPLY_ENTRY, choices: { 返信希望: "返信希望", 返信不要: "返信不要" } };
const mockForm = {
  questions: [
    { entry: "entry.1825538084", title: "ご相談内容", required: true },
    { entry: "entry.948403332", title: "Dペッパーの返答・メモ", required: false },
    { entry: "entry.1738990388", title: "添付情報", required: false },
    { entry: TEST_REPLY_FIELD.entry, title: "返信を希望しますか？", required: true, choices: ["返信希望", "返信不要"] },
  ],
  responses: [],
  submit(body) {
    const p = new URLSearchParams(body);
    for (const q of this.questions) {
      const v = p.get(q.entry);
      if (q.required && !v) return new Response("missing required", { status: 400 });
      if (v && q.choices && !q.choices.includes(v)) return new Response("invalid choice", { status: 400 });
    }
    const namedValues = {};
    for (const q of this.questions) if (p.get(q.entry)) namedValues[q.title] = [p.get(q.entry)];
    this.responses.push(namedValues);
    return new Response("<html>回答を記録しました</html>", { status: 200 });
  },
};

// 通知スクリプト（リポジトリ版）を、記録された回答で動かす
function notify(namedValues) {
  const sent = [];
  const sandbox = { MailApp: { sendEmail: (o) => sent.push(o) }, console: { log: quiet, error: quiet, warn: quiet } };
  vm.createContext(sandbox);
  vm.runInContext(gsSource, sandbox);
  sandbox.onFormSubmit({ namedValues });
  return sent;
}

let formCalls = 0;
let formHandler = (body) => mockForm.submit(body);
globalThis.fetch = async (url, opt = {}) => {
  if (String(url) === F.FORM_ACTION) { formCalls++; return formHandler(opt.body); }
  throw new Error("unexpected fetch " + url);
};

let ip = 0;
const shareReq = (replyRequest) => new Request("https://x/api/share-history", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://d-pepper-app.vercel.app", "x-forwarded-for": `10.5.${++ip}.1` },
  body: JSON.stringify({
    item: { id: 1712345678901, createdAt: "2026-10-12T01:00:00.000Z", category: "カラー相談", group: "ケア", text: "色落ちが気になります", aiResponse: "洗い方を見直しましょう。" },
    replyRequest,
  }),
});

// ── 1) 返信の質問を送らない場合（修正前と同じ状態）は、必須の質問が欠けて 400 になる（不具合の再現）──
{
  const res = mockForm.submit(F.buildFormParams({ consultText: "c", aiText: "a", reply: "返信希望" }, null).toString());
  check("返信の質問を送らないと、模擬フォームは 400（Preview で起きた失敗の再現）", res.status === 400);
}
check("REPLY_FIELD はフォームで確認した項目ID・選択肢と一致",
  F.REPLY_FIELD?.entry === FORM_REPLY_ENTRY && F.REPLY_FIELD?.choices?.返信希望 === "返信希望" && F.REPLY_FIELD?.choices?.返信不要 === "返信不要");

// ── 1b) 履歴共有API を通して：返信希望／返信不要 の両方で 受け付け → 記録 → 通知 ──
for (const reply of ["返信希望", "返信不要"]) {
  formCalls = 0;
  const before = mockForm.responses.length;
  const r = await sh.POST(shareReq(reply));
  const body = await r.json();
  const recorded = mockForm.responses.at(-1);
  check(`API（${reply}）：200 で ok を返す`, r.status === 200 && body.ok === true, `status ${r.status}`);
  check(`API（${reply}）：フォームへの送信は1回、回答は1件だけ記録`, formCalls === 1 && mockForm.responses.length === before + 1);
  check(`API（${reply}）：回答の「返信を希望しますか？」＝${reply}`, recorded?.["返信を希望しますか？"]?.[0] === reply);
  const mails = notify(recorded);
  check(`API（${reply}）：店舗宛てに通知が1通、件名は【${reply}】`,
    mails.length === 1 && mails[0].to === "dais20101119@gmail.com" && mails[0].subject.endsWith(`【${reply}】`), mails[0]?.subject);
}

// ── 2) 項目ID と選択肢を設定すれば、返信希望／返信不要 の両方で 記録 → 通知 まで通る ──
for (const reply of ["返信希望", "返信不要"]) {
  const params = F.buildFormParams({ consultText: `【Dペッパー履歴共有】\n返信希望：${reply}\n\n＝＝ご相談内容＝＝\nテスト`, aiText: "返答", reply }, TEST_REPLY_FIELD);
  const res = mockForm.submit(params.toString());
  const recorded = mockForm.responses.at(-1);
  check(`${reply}：模擬フォームが受け付ける（200）`, res.status === 200);
  check(`${reply}：回答に「返信を希望しますか？」＝${reply} が記録される`, recorded?.["返信を希望しますか？"]?.[0] === reply);
  const mails = notify(recorded);
  check(`${reply}：店舗宛てに通知が1通、件名は【${reply}】`,
    mails.length === 1 && mails[0].to === "dais20101119@gmail.com" && mails[0].subject.endsWith(`【${reply}】`), mails[0]?.subject);
}
check("返信の指定がない場合は「返信希望」の選択肢を送る",
  F.buildFormParams({ consultText: "c", aiText: "a", reply: undefined }, TEST_REPLY_FIELD).get(TEST_REPLY_FIELD.entry) === "返信希望");
{
  let threw = false;
  try { F.buildFormParams({ consultText: "c", aiText: "a", reply: "返信不要" }, { entry: "entry.1", choices: { 返信希望: "x" } }); } catch { threw = true; }
  check("選択肢が設定されていない場合は送らずにエラー（空欄で送らない）", threw);
}

// ── 3) Google の応答の判定：成功と誤って扱わない ──
const resp = (status, location) => new Response(null, { status, headers: location ? { location } : {} });
check("200 は受け付け", F.classifyFormResponse(resp(200)).ok === true);
check("ログイン画面への転送（302）は失敗", F.classifyFormResponse(resp(302, "https://accounts.google.com/ServiceLogin?continue=x")).ok === false);
check("400・404・500 は失敗", [400, 404, 500].every((s) => F.classifyFormResponse(resp(s)).ok === false));
for (const [name, handler, expected] of [
  ["Google が 400", () => new Response("", { status: 400 }), 502],
  ["ログイン画面へ転送", () => resp(302, "https://accounts.google.com/v3/signin/identifier?continue=x"), 502],
  ["通信エラー", () => { throw new Error("network"); }, 500],
]) {
  formHandler = handler;
  const r = await sh.POST(shareReq("返信不要"));
  const body = await r.json().catch(() => ({}));
  check(`履歴共有API：${name} → ${expected}（ok を返さない）`, r.status === expected && body.ok !== true, `status ${r.status}`);
}
formHandler = (body) => mockForm.submit(body);

console.log = realLog;
console.log(results.join("\n"));
const failed = results.filter((x) => x.startsWith("FAIL")).length;
console.log(`\n合計 ${results.length} 項目 / 失敗 ${failed}`);
process.exit(failed ? 1 : 0);
