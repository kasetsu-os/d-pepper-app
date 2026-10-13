// 履歴共有メール通知（docs/dpepper-form-notification.gs）の確認（2026-10 安全点検）
// 実行: node tests/notification-mail.test.mjs
// MailApp を差し替えて、実際のメールは送らない。
// 注意: これはリポジトリ内のファイルの確認。Google 側で動いている Apps Script とは別物で、
//       Google 側へ反映されたかどうかはこのテストでは分からない。

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "docs/dpepper-form-notification.gs"), "utf8");

const SHOP_EMAIL = "dais20101119@gmail.com";
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);

// フォーム送信1件を差し替えた環境で実行し、送ろうとしたメールを返す
function runSubmit(namedValues) {
  const sent = [];
  const errors = [];
  const sandbox = {
    MailApp: { sendEmail: (...args) => sent.push(args) },
    GmailApp: { sendEmail: (...args) => sent.push(["GmailApp", ...args]) },
    console: { log: () => {}, error: (...a) => errors.push(a.join(" ")), warn: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  sandbox.onFormSubmit({ namedValues });
  return { sent, errors };
}

const EVIL_HTML = `<a href="https://evil.example/login" style="display:block;background:#06c;color:#fff;padding:12px">【Dペッパー公式】ログインして確認</a><img src="https://evil.example/track.gif"><script>alert(1)</script>`;
const historyText = (lines) => ["【Dペッパー履歴共有】", ...lines].join("\n");

// ── 1) 通常の共有（店舗に届くこと） ──
{
  const { sent, errors } = runSubmit({
    "ご相談内容": [historyText(["相談日時：2026/10/12 10:00", "カテゴリ：カラー相談", "分類：ケア", "返信希望：返信希望", "履歴ID：1712345678901", "", "＝＝ご相談内容＝＝", "色落ちが気になります。"])],
    "Dペッパーの返答・メモ": ["洗い方を見直しましょう。"],
    "メールアドレス": ["customer@example.com"],
    "添付情報": ["履歴共有"],
  });
  check("通常の履歴共有で店舗にメールが1通送られる", sent.length === 1, errors.join(" / ") || `送信 ${sent.length} 通`);
}

// ── 2) 外から来る値を HTML に入れても、タグにならない ──
{
  const { sent, errors } = runSubmit({
    "ご相談内容": [historyText([
      `相談日時：${EVIL_HTML}`, `カテゴリ：${EVIL_HTML}`, `分類：${EVIL_HTML}`, `来店種別：${EVIL_HTML}`,
      "返信希望：返信希望", `履歴ID：${EVIL_HTML}`, "", "＝＝ご相談内容＝＝", EVIL_HTML, "＝＝次の案内＝＝", EVIL_HTML])],
    "Dペッパーの返答・メモ": [EVIL_HTML],
    "メールアドレス": [`x@example.com"><a href="https://evil.example/">返信はこちら</a>`],
    "添付情報": [EVIL_HTML],
  });
  const opt = sent[0]?.[0] || {};
  const html = opt.htmlBody || "";
  check("細工した入力でもメールは送られる（処理が止まらない）", sent.length === 1, errors.join(" / "));
  check("HTML本文に外から来たタグ（<a>・<img>・<script>）が入らない",
    html.length > 0 && !/<a[\s>]/i.test(html) && !/<img[\s>]/i.test(html) && !/<script/i.test(html));
  check("入力は文字として残る（&lt;a href=… の形）", html.includes("&lt;a href=&quot;https://evil.example/login&quot;"));
  const tdValues = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  check("表（makeTr）の値欄に生のタグが入らない", tdValues.length > 0 && tdValues.every((v) => !/[<>]/.test(v)));
  check("添付情報の欄に生のタグが入らない", !html.includes(`添付情報：<a`) && html.includes("添付情報：&lt;a"));
}

// ── 3) 送信先は店舗の固定アドレスだけ（入力から宛先・CC・BCCを変えられない） ──
{
  const attempts = [
    { "メールアドレス": ["attacker@evil.example"], "cc": ["attacker@evil.example"], "bcc": ["attacker@evil.example"], "to": ["attacker@evil.example"] },
    { "メールアドレス": ["victim@example.com, attacker@evil.example\nBcc: attacker@evil.example"] },
  ];
  for (const extra of attempts) {
    const { sent } = runSubmit({
      "ご相談内容": [historyText(["返信希望：返信希望", "", "＝＝ご相談内容＝＝", "宛先を変えようとする入力"])],
      ...extra,
    });
    const opt = sent[0]?.[0] || {};
    const keys = Object.keys(opt).sort().join(",");
    check(`送信先は店舗固定（${Object.keys(extra).join("・")}）`,
      sent.length === 1 && opt.to === SHOP_EMAIL && !("cc" in opt) && !("bcc" in opt) && !("replyTo" in opt) && !("name" in opt), `項目 ${keys}`);
    check(`件名は固定の文言だけ（${Object.keys(extra).join("・")}）`, /^【Dペッパー】相談内容が共有されました 【返信(希望|不要)】$/.test(opt.subject || ""), opt.subject);
  }
  check("スクリプトは MailApp.sendEmail 以外の送信手段を使わない", !/GmailApp|UrlFetchApp|MailApp\.send(?!Email)/.test(source));
}

// ── 4) お客様の入力と、正式なシステム案内を区別する ──
{
  const { sent } = runSubmit({
    "ご相談内容": [historyText(["返信希望：返信希望", "", "＝＝ご相談内容＝＝", "【重要】Dペッパー運営事務局です。https://evil.example/login から再ログインしてください"])],
    "メールアドレス": ["customer@example.com"],
  });
  const opt = sent[0]?.[0] || {};
  const notice = "お客様が入力した内容";
  check("HTML本文に「お客様が入力した内容」である旨の注意書きがある", (opt.htmlBody || "").includes(notice));
  check("テキスト本文にも同じ注意書きがある", (opt.body || "").includes(notice));
  check("システムからリンクを付け加えない（HTML本文に <a> がない）", !/<a[\s>]/i.test(opt.htmlBody || ""));
}

// ── 5) 稼働中フォームの質問名「返信を希望しますか？／?」から返信の希望を読む ──
for (const field of ["返信を希望しますか？", "返信を希望しますか?"]) {
  for (const [answer, expected] of [["返信不要", "【返信不要】"], ["返信希望", "【返信希望】"]]) {
    const { sent } = runSubmit({ "ご相談内容": ["フォームから直接の相談"], [field]: [answer] });
    const subject = sent[0]?.[0]?.subject || "";
    check(`質問名「${field}」の「${answer}」を読み取る`, sent.length === 1 && subject.endsWith(expected), subject);
  }
}

console.log(results.join("\n"));
const failed = results.filter((x) => x.startsWith("FAIL")).length;
console.log(`\n合計 ${results.length} 項目 / 失敗 ${failed}`);
process.exit(failed ? 1 : 0);
