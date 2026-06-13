// POST to Google Forms formResponse endpoint (server-side)
// Reuses the same form that powers the existing Da-is share flow
const FORM_ACTION =
  "https://docs.google.com/forms/d/e/1FAIpQLSevLDDVaXd3S0eMHNqL7GTomvm3TY8SwUFQO62WeOgRJd8nJQ/formResponse";

function buildConsultText(item) {
  const dateStr = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(item.createdAt));

  const catDisplay =
    item.category === "__complaint__"
      ? "内容を確認しました"
      : (item.category ?? "");
  const isFav = item.favorite ?? false;

  return [
    "【Dペッパー履歴共有】",
    `相談日時：${dateStr}`,
    `カテゴリ：${catDisplay}`,
    `分類：${item.group ?? ""}`,
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

  let body;
  try {
    body = await request.json();
  } catch {
    console.error(`[${ts}] History share error | message: Invalid JSON body`);
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { item } = body;
  if (!item) {
    console.error(`[${ts}] History share error | message: item is required`);
    return Response.json({ error: "item is required" }, { status: 400 });
  }

  console.log(
    `[${ts}] History share started | category: ${item.category} | hasAiResponse: ${Boolean(item.aiResponse)}`
  );

  const consultText = buildConsultText(item);
  const aiText = item.aiResponse
    ? item.aiResponse
    : "この相談は詳細保存前の履歴のため、Dペッパーの返答本文は残っていません。";

  const params = new URLSearchParams({
    "entry.1825538084": consultText,
    "entry.948403332": aiText.slice(0, 3500),
    "entry.1738990388": "履歴共有",
    fvv: "1",
    pageHistory: "0",
    fbzx: Date.now().toString(),
  });

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
    // Google Forms returns 302 redirect to confirmation page on success
    if (res.status === 302 || res.status === 200 || res.ok) {
      console.log(`[${successTs}] History share ok`);
      return Response.json({ ok: true });
    }

    const errBody = await res.text().catch(() => "");
    console.error(
      `[${successTs}] History share error | status: ${res.status} | body: ${errBody.slice(0, 200)}`
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
    return Response.json(
      { error: err?.message ?? "Network error" },
      { status: 500 }
    );
  }
}

export function GET() {
  return Response.json({ ok: true, message: "share-history route alive" });
}
