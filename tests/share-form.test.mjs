// 履歴共有 → Googleフォーム → 通知メール の流れの確認（2026-10 保守点検）
// 実行: node tests/share-form.test.mjs
// 本物の Googleフォーム・メールには送らない。必須項目を検査する「模擬フォーム」と、
// MailApp を差し替えた通知スクリプトで、送信 → 記録 → 通知 を再現する。
// 返信の質問の項目ID・選択肢は api/_share-form.js の REPLY_FIELD（店長がフォームで確認した値）を使う。

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

// Vercel のサーバーと同じく UTC で動かす（日本時間の端末でも時差の不具合を再現できるように）
process.env.TZ = "UTC";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quiet = () => {};
const realLog = console.log;
// サーバーのログは画面に出さず記録だけする（メールアドレスが出ていないかを確認するため）
const serverLogs = [];
console.log = console.warn = console.error = (...a) => serverLogs.push(a.map(String).join(" "));

const F = await import(path.join(root, "api/_share-form.js"));
const sh = await import(path.join(root, "api/share-history.js"));
const gsSource = await readFile(path.join(root, "docs/dpepper-form-notification.gs"), "utf8");

const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);

// ── 模擬フォーム：必須項目・選択肢を Google と同じように検査し、受け付けた回答を記録する ──
// 本物のフォームの項目ID（2026-10-14 確認）。REPLY_FIELD がこれと一致していることもテストする
const FORM_REPLY_ENTRY = "entry.1518046549";
const TEST_REPLY_FIELD = { entry: FORM_REPLY_ENTRY, choices: { 返信希望: "返信希望", 返信不要: "返信不要" } };
// 返信先メールアドレスの質問の項目ID（2026-10-14 フォームの事前入力URLで確認）
const TEST_EMAIL_ENTRY = "entry.792546235";
const EMAIL_QUESTION = "返信希望の場合のみ入力してください。";
const CUSTOMER_EMAIL = "customer.test@example.com";
const mockForm = {
  questions: [
    { entry: "entry.1825538084", title: "ご相談内容", required: true },
    { entry: "entry.948403332", title: "Dペッパーの返答・メモ", required: false },
    { entry: "entry.1738990388", title: "添付情報", required: false },
    { entry: TEST_REPLY_FIELD.entry, title: "返信を希望しますか？", required: true, choices: ["返信希望", "返信不要"] },
    { entry: TEST_EMAIL_ENTRY, title: EMAIL_QUESTION, required: false },
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
// 本番と同じ設定（REPLY_FIELD・EMAIL_FIELD）の履歴共有API
const shT = sh;
const shareReq = (replyRequest, createdAt = "2026-10-12T01:00:00.000Z", replyEmail) => new Request("https://x/api/share-history", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://d-pepper-app.vercel.app", "x-forwarded-for": `10.5.${++ip}.1` },
  body: JSON.stringify({
    item: { id: 1712345678901, createdAt, category: "カラー相談", group: "ケア", text: "色落ちが気になります", aiResponse: "洗い方を見直しましょう。" },
    replyRequest,
    ...(replyEmail !== undefined ? { replyEmail } : {}),
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
  const r = await shT.POST(shareReq(reply, undefined, reply === "返信希望" ? CUSTOMER_EMAIL : undefined));
  const body = await r.json();
  const recorded = mockForm.responses.at(-1);
  check(`API（${reply}）：200 で ok を返す`, r.status === 200 && body.ok === true, `status ${r.status}`);
  check(`API（${reply}）：フォームへの送信は1回、回答は1件だけ記録`, formCalls === 1 && mockForm.responses.length === before + 1);
  check(`API（${reply}）：回答の「返信を希望しますか？」＝${reply}`, recorded?.["返信を希望しますか？"]?.[0] === reply);
  const mails = notify(recorded);
  check(`API（${reply}）：店舗宛てに通知が1通、件名は【${reply}】`,
    mails.length === 1 && mails[0].to === "dais20101119@gmail.com" && mails[0].subject.endsWith(`【${reply}】`), mails[0]?.subject);
  if (reply === "返信希望") {
    check("API（返信希望）：返信先が回答に記録され、通知の本文（テキスト・HTML）に表示される",
      recorded?.[EMAIL_QUESTION]?.[0] === CUSTOMER_EMAIL && mails[0].body.includes(`返信先メール：${CUSTOMER_EMAIL}`) && mails[0].htmlBody.includes(CUSTOMER_EMAIL));
    check("API（返信希望）：通知は店舗宛てだけ（お客様のアドレスへ自動送信しない）",
      Object.keys(mails[0]).sort().join(",") === "body,htmlBody,subject,to" && mails[0].to !== CUSTOMER_EMAIL);
  } else {
    check("API（返信不要）：連絡先なしで共有でき、回答に返信先は記録されない", !(EMAIL_QUESTION in (recorded || {})));
  }
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

// ── 4) 相談日時は日本時間で送る（サーバーは UTC）──
{
  const sentBodies = [];
  formHandler = (body) => { sentBodies.push(new URLSearchParams(body)); return mockForm.submit(body); };
  const cases = [
    ["2026-10-14T01:29:00.000Z", "2026/10/14 10:29", "通常（+9時間）"],
    ["2026-10-14T16:30:00.000Z", "2026/10/15 01:30", "日付をまたぐ"],
    ["2026-12-31T15:00:00.000Z", "2027/01/01 00:00", "年をまたぐ"],
    ["2026-10-31T23:59:00.000Z", "2026/11/01 08:59", "月をまたぐ"],
  ];
  check("このテストは UTC で動いている（時差の不具合を再現できる条件）", new Date("2026-10-14T01:29:00.000Z").getHours() === 1);
  for (const [iso, expected, label] of cases) {
    const r = await shT.POST(shareReq("返信不要", iso));
    const consult = sentBodies.at(-1)?.get("entry.1825538084") || "";
    const line = consult.split("\n").find((l) => l.startsWith("相談日時：")) || "";
    check(`相談日時（${label}）：${iso} → ${expected}`, r.status === 200 && line === `相談日時：${expected}`, line);
  }

  // ── 5) 返信希望：API から送る値（フォームの選択肢そのもの）──
  for (const [replyRequest, expected, label] of [["返信希望", "返信希望", "返信希望"], ["返信不要", "返信不要", "返信不要"], [undefined, "返信希望", "指定なし"], ["その他", "返信希望", "想定外の値"]]) {
    await shT.POST(shareReq(replyRequest, undefined, expected === "返信希望" ? CUSTOMER_EMAIL : undefined));
    const sent = sentBodies.at(-1);
    check(`返信（${label}）：entry.1518046549 に「${expected}」を送り、相談文の「返信希望：」行も一致`,
      sent?.get("entry.1518046549") === expected && (sent?.get("entry.1825538084") || "").includes(`返信希望：${expected}`), sent?.get("entry.1518046549"));
  }
  formHandler = (body) => mockForm.submit(body);
}

// ── 6) 返信先メールアドレスの検証（サーバー側）──
{
  const sentBodies = [];
  formHandler = (body) => { sentBodies.push(new URLSearchParams(body)); return mockForm.submit(body); };
  const bad = [
    ["未入力", undefined], ["空欄", ""], ["空白だけ", "   "], ["@なし", "customer.example.com"],
    ["ドメインなし", "customer@"], ["空白を含む", "cus tomer@example.com"], ["改行で宛先を足す", "a@example.com\nBcc: x@evil.example"],
    ["カンマで複数", "a@example.com,b@example.com"], ["タグを含む", "<script>@example.com"], ["文字列以外", 12345], ["長すぎる", "a".repeat(250) + "@example.com"],
  ];
  for (const [label, email] of bad) {
    formCalls = 0;
    const r = await shT.POST(shareReq("返信希望", undefined, email));
    check(`返信希望で返信先が${label}：400 で拒否し、フォームへ送らない`, r.status === 400 && formCalls === 0, `status ${r.status} / 送信 ${formCalls}`);
  }
  // 前後の空白は取り除いて送る
  await shT.POST(shareReq("返信希望", undefined, `  ${CUSTOMER_EMAIL}  `));
  check("返信先の前後の空白は取り除いて送る", sentBodies.at(-1)?.get(TEST_EMAIL_ENTRY) === CUSTOMER_EMAIL);
  // 返信不要で連絡先が混入しない
  formCalls = 0;
  const r = await shT.POST(shareReq("返信不要", undefined, CUSTOMER_EMAIL));
  const sent = sentBodies.at(-1);
  check("返信不要で連絡先が送られてきても、フォームへは送らない（項目にも本文にも入らない）",
    r.status === 200 && formCalls === 1 && !sent.has(TEST_EMAIL_ENTRY) && ![...sent.values()].some((v) => v.includes(CUSTOMER_EMAIL)));
  // 設定値がフォームで確認した項目IDと一致していること
  check("EMAIL_FIELD はフォームで確認した項目ID（entry.792546235）", F.EMAIL_FIELD === "entry.792546235");
  check("REPLY_FIELD は変更されていない（entry.1518046549／返信希望・返信不要）",
    F.REPLY_FIELD?.entry === "entry.1518046549" && F.REPLY_FIELD?.choices?.返信希望 === "返信希望" && F.REPLY_FIELD?.choices?.返信不要 === "返信不要");
  // 返信希望：入力したアドレスが entry.792546235 にだけ送られる
  formCalls = 0;
  const r4 = await sh.POST(shareReq("返信希望", undefined, CUSTOMER_EMAIL));
  const sent4 = sentBodies.at(-1);
  const holders = [...sent4.entries()].filter(([, v]) => v.includes(CUSTOMER_EMAIL)).map(([k]) => k);
  check("返信希望：アドレスは entry.792546235 にだけ送られ、返信は entry.1518046549＝返信希望",
    r4.status === 200 && formCalls === 1 && holders.join(",") === "entry.792546235" && sent4.get("entry.1518046549") === "返信希望", holders.join(","));
  // 項目IDを外した場合の安全装置（返信先なしで返信希望を送らない）は残っている
  formCalls = 0;
  const shNoEmail = sh.createSharePOST({ emailField: null });
  const r2 = await shNoEmail.call(null, shareReq("返信希望", undefined, CUSTOMER_EMAIL));
  check("返信先の項目IDがない設定では、返信希望を 503 で止め、フォームへ送らない", r2.status === 503 && formCalls === 0, `status ${r2.status}`);
  const r3 = await shNoEmail.call(null, shareReq("返信不要"));
  check("その設定でも、返信不要の共有はできる", r3.status === 200);
  // メールアドレスをログに出さない
  check("サーバーログにお客様のメールアドレスが出ない", !serverLogs.some((l) => l.includes("customer.test@") || l.includes("@example.com")),
    `ログ ${serverLogs.length} 行を確認`);
  formHandler = (body) => mockForm.submit(body);
}

console.log = realLog;
console.log(results.join("\n"));
const failed = results.filter((x) => x.startsWith("FAIL")).length;
console.log(`\n合計 ${results.length} 項目 / 失敗 ${failed}`);
process.exit(failed ? 1 : 0);
