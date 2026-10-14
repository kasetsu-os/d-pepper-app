import { originAllowed, rateLimited, readJsonLimited, reject } from "./_guard.js";
import { SHARE_MAX_BODY_BYTES } from "../src/lib/limits.js";
import { FORM_ACTION, buildFormParams, classifyFormResponse } from "./_share-form.js";

// POST to Google Forms formResponse endpoint (server-side)
// Reuses the same form that powers the existing Da-is share flow

// 履歴の形式チェック（日付の変換や文字列処理より前に行う）
const OPTIONAL_STRING_FIELDS = ["text", "aiResponse", "category", "group", "entryTitle", "nextAction"];
function isValidItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  if (typeof item.createdAt !== "string" || Number.isNaN(new Date(item.createdAt).getTime())) return false;
  if (!(typeof item.id === "number" && Number.isFinite(item.id)) && !(typeof item.id === "string" && item.id.length <= 64)) return false;
  for (const f of OPTIONAL_STRING_FIELDS) {
    if (item[f] != null && typeof item[f] !== "string") return false;
  }
  if (item.favorite != null && typeof item.favorite !== "boolean") return false;
  return true;
}

function buildConsultText(item, replyRequest) {
  // サーバー（Vercel）は UTC で動くため、日本時間を明示する
  const dateStr = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(item.createdAt));

  const catDisplay =
    item.category === "__complaint__"
      ? "内容を確認しました"
      : (item.category ?? "");
  const isFav = item.favorite ?? false;
  // 未指定・空欄・undefined → 返信希望 として扱う
  const reply = replyRequest === "返信不要" ? "返信不要" : "返信希望";

  return [
    "【Dペッパー履歴共有】",
    `相談日時：${dateStr}`,
    `カテゴリ：${catDisplay}`,
    `分類：${item.group ?? ""}`,
    `返信希望：${reply}`,
    item.entryTitle ? `来店種別：${item.entryTitle}` : null,
    isFav ? "お気に入り：⭐️" : null,
    `履歴ID：${item.id}`,
    "",
    "＝＝ご相談内容＝＝",
    item.text ?? "",
    item.nextAction ? `\n＝＝次の案内＝＝\n${item.nextAction}` : null,
  ]
    .filter((x) => x !== null)
    .join("\n")
    .slice(0, 3500);
}

export async function POST(request) {
  const ts = new Date().toISOString();

  // ── 2026-10 保守点検：入口の防御 ─────────────────────
  if (!originAllowed(request)) {
    console.warn(`[${ts}] History share blocked | reason:origin`);
    return reject(403, "forbidden");
  }
  if (rateLimited(request, { key: "share-min", limit: 3, windowMs: 60_000 }) ||
      rateLimited(request, { key: "share-hour", limit: 15, windowMs: 3_600_000 })) {
    console.warn(`[${ts}] History share blocked | reason:rate`);
    return reject(429, "too many requests");
  }

  const parsed = await readJsonLimited(request, SHARE_MAX_BODY_BYTES);
  if (parsed.error === "too_large") return reject(413, "request too large");
  if (parsed.error) {
    console.error(`[${ts}] History share error | message: Invalid JSON body`);
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { item, replyRequest } = (parsed.body && typeof parsed.body === "object") ? parsed.body : {};
  if (!isValidItem(item)) {
    console.error(`[${ts}] History share error | message: invalid item`);
    return Response.json({ error: "invalid item" }, { status: 400 });
  }

  // 未指定・空欄・undefined → 返信希望 として扱う
  const reply = replyRequest === "返信不要" ? "返信不要" : "返信希望";

  console.log(
    `[${ts}] History share started | category: ${item.category} | hasAiResponse: ${Boolean(item.aiResponse)} | reply: ${reply}`
  );

  const consultText = buildConsultText(item, reply);
  const aiText = item.aiResponse
    ? item.aiResponse
    : "この相談は詳細保存前の履歴のため、Dペッパーの返答本文は残っていません。";

  const params = buildFormParams({ consultText, aiText, reply });

  try {
    const res = await fetch(FORM_ACTION, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer:
          "https://docs.google.com/forms/d/e/1FAIpQLSevLDDVaXd3S0eMHNqL7GTomvm3TY8SwUFQO62WeOgRJd8nJQ/viewform",
        Origin: "https://docs.google.com",
      },
      body: params.toString(),
      redirect: "manual",
    });

    const successTs = new Date().toISOString();
    const result = classifyFormResponse(res);
    if (result.ok) {
      console.log(`[${successTs}] History share ok | status: ${res.status}`);
      return Response.json({ ok: true });
    }

    console.error(
      `[${successTs}] History share error | status: ${res.status} | reason: ${result.reason}`
    );
    return Response.json(
      { error: `Form submit failed: ${res.status}` },
      { status: 502 }
    );
  } catch (err) {
    const errTs = new Date().toISOString();
    console.error(
      `[${errTs}] History share error | message: ${err?.message ?? "Network error"}`
    );
    return Response.json({ error: "share failed" }, { status: 500 });
  }
}

export function GET() {
  return Response.json({ ok: true, message: "share-history route alive" });
}
