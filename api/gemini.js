function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const removeParams = ["srsltid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "msclkid", "ref", "source"];
    for (const key of removeParams) u.searchParams.delete(key);
    return u.toString();
  } catch {
    return rawUrl;
  }
}

async function fetchUrlContent(rawUrl) {
  const normalizedUrl = normalizeUrl(rawUrl);
  console.log("Fetching URL host:", new URL(normalizedUrl).hostname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(normalizedUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.9",
      },
    });
    clearTimeout(timer);
    console.log("Fetch status:", res.status, "| ok:", res.ok);
    if (!res.ok) return { originalUrl: rawUrl, normalizedUrl, ok: false, error: `HTTP ${res.status}` };
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1500);
    if (!text) return { originalUrl: rawUrl, normalizedUrl, ok: false, error: "empty content" };
    return { originalUrl: rawUrl, normalizedUrl, ok: true, text };
  } catch (error) {
    clearTimeout(timer);
    console.error("URL fetch failed:", error.message);
    return { originalUrl: rawUrl, normalizedUrl, ok: false, error: error.message };
  }
}

export async function POST(request) {
  console.log("Gemini request received");
  console.log("Has API key:", Boolean(process.env.GEMINI_API_KEY));

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing");
    return Response.json({ error: "GEMINI_API_KEY is not set" }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.error("Failed to parse request body:", err?.message);
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { prompt, urls = [], images = [] } = body;
  console.log("Prompt exists:", Boolean(prompt));
  console.log("Prompt length:", prompt?.length || 0);
  console.log("Received images count:", images?.length || 0);

  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  // ── URL処理 ──────────────────────────────────────────
  const validUrls = Array.isArray(urls) ? urls.filter((u) => typeof u === "string" && u.startsWith("http")) : [];
  console.log("URL count:", validUrls.length);

  let urlStatus = "not_provided";
  let urlSection = "";

  if (validUrls.length > 0) {
    const urlResults = await Promise.all(validUrls.map((u) => fetchUrlContent(u)));
    const readableResults = urlResults.filter((r) => r.ok && r.text);
    const unreadableResults = urlResults.filter((r) => !r.ok || !r.text);

    console.log("URL readable count:", readableResults.length);
    console.log("URL unreadable count:", unreadableResults.length);

    if (readableResults.length === 0) {
      urlStatus = "unreadable";
    } else if (unreadableResults.length === 0) {
      urlStatus = "readable";
    } else {
      urlStatus = "partial";
    }
    console.log("URL read status:", urlStatus);

    if (urlStatus === "readable") {
      const combined = readableResults.map((r) => r.text).join("\n\n---\n\n").slice(0, 2000);
      urlSection = `\n【URL参照内容】\nurlStatus: readable\n応答の自然な流れの中で、必ず「貼っていただいたURLの内容を参考にすると、」と明示すること。断定（合う・合わない・買った方がいい等）はしない。商品の種類・気になる特徴・使用感確認点・数週間での変化の見方を整理する。Da-is視点：成分名だけでなく、使用感・蓄積感・乾きにくさ・重さ・数週間使った変化を見ることが大切と伝える。\n\n${combined}\n`;
    } else if (urlStatus === "partial") {
      const combined = readableResults.map((r) => r.text).join("\n\n---\n\n").slice(0, 2000);
      urlSection = `\n【URL参照内容】\nurlStatus: partial（一部のURLは内容を確認できました。確認できなかったURLもあります）\n応答の自然な流れの中で、必ず「貼っていただいたURLのうち、一部の内容を参考にすると、」と明示すること。断定（合う・合わない・買った方がいい等）はしない。読めた内容と相談文をもとに、商品の種類・気になる特徴・使用感確認点・数週間での変化の見方を整理する。Da-is視点：成分名だけでなく、使用感・蓄積感・乾きにくさ・重さ・数週間使った変化を見ることが大切と伝える。\n\n${combined}\n`;
    } else {
      urlSection = `\n【URL参照内容】\nurlStatus: unreadable（全てのURLの内容を確認できませんでした）\n応答の中で必ず「URLの内容までは確認できませんでしたが、相談文をもとに見るポイントを整理します。」と明示すること。\n`;
    }
  } else {
    console.log("URL read status: not_provided");
  }

  // ── 画像処理 ──────────────────────────────────────────
  // base64接頭辞 (data:image/jpeg;base64,) が付いている場合は除去
  const cleanedImages = Array.isArray(images)
    ? images.map((img) => {
        if (!img) return null;
        const data = typeof img.data === "string"
          ? img.data.replace(/^data:image\/[a-zA-Z+]+;base64,/, "")
          : "";
        return { ...img, data };
      }).filter(Boolean)
    : [];

  const validImages = cleanedImages.filter(
    (img) => img.data.length > 0 && img.mimeType
  );

  console.log("Image count:", Array.isArray(images) ? images.length : 0);
  console.log("Valid images count:", validImages.length);
  console.log("Image mimeTypes:", validImages.map((img) => img.mimeType));

  let imageStatus = "not_provided";
  let imageSection = "";

  if (Array.isArray(images) && images.length > 0) {
    const failCount = images.length - validImages.length;
    if (validImages.length === 0) {
      imageStatus = "unreadable";
    } else if (failCount === 0) {
      imageStatus = "readable";
    } else {
      imageStatus = "partial";
    }
    console.log("Image read status:", imageStatus);

    if (imageStatus === "readable") {
      imageSection = `\n【画像参照】\nimageStatus: readable\n応答の自然な流れの中で、必ず「貼っていただいた画像から見える範囲では、」と明示すること。画像は相談整理の参考として使う。診断・断定はしない。確認できる範囲：髪の長さ・明るさ・色味の印象・広がり・まとまり・毛先のパサつき印象・スタイルの方向性・白髪や根元の見え方の参考。禁止：医療判断・頭皮疾患断定・薄毛診断・炎症確定・ダメージレベル確定・薬剤選定断定・商品の合う合わない断定。光の当たり方・画質・角度で見え方が変わることを前提にする。\n`;
    } else if (imageStatus === "partial") {
      imageSection = `\n【画像参照】\nimageStatus: partial（一部の画像のみ確認できました）\n応答の自然な流れの中で、必ず「貼っていただいた画像のうち、見える範囲を参考にすると、」と明示すること。同じく診断・断定はしない。\n`;
    } else {
      imageSection = `\n【画像参照】\nimageStatus: unreadable\n応答の中で必ず「画像の内容は十分に確認できませんでしたが、相談文をもとに整理します。」と明示すること。\n`;
    }
  } else {
    console.log("Image read status: not_provided");
  }

  // ── プロンプト組み立て ──────────────────────────────────
  const injected = [urlSection, imageSection].filter(Boolean).join("\n");
  const finalPrompt = injected
    ? prompt.replace("【出力制約】", `${injected}\n【出力制約】`)
    : prompt;

  // ── Gemini マルチモーダルリクエスト ────────────────────
  const parts = [{ text: finalPrompt }];
  for (const img of validImages) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  let geminiRes;
  try {
    geminiRes = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: 10000,
        },
      }),
    });
  } catch (err) {
    console.error("Fetch to Gemini failed:", err?.message);
    return Response.json({ error: err.message ?? "Fetch to Gemini failed" }, { status: 500 });
  }

  if (!geminiRes.ok) {
    const errBody = await geminiRes.json().catch(() => ({}));
    console.error("Gemini API status:", geminiRes.status);
    console.error("Gemini API error:", JSON.stringify(errBody));
    const message = errBody?.error?.message ?? "(no message)";
    const status = errBody?.error?.status ?? geminiRes.status;
    return Response.json(
      { error: `Gemini API error: ${geminiRes.status} ${status} – ${message}` },
      { status: geminiRes.status }
    );
  }

  const data = await geminiRes.json();

  if (!data.candidates || data.candidates.length === 0) {
    console.error("Gemini: no candidates in response");
    return Response.json({ error: "Gemini response has no candidates" }, { status: 500 });
  }

  const candidate = data.candidates[0];
  console.log("Gemini finishReason:", candidate?.finishReason);

  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    console.error("Gemini: text is empty. finishReason:", candidate?.finishReason);
    return Response.json({ error: "Gemini response text is empty" }, { status: 500 });
  }

  console.log("Gemini response length:", text.length);

  return Response.json({ text, urlStatus, imageStatus });
}

export function GET() {
  return Response.json({ ok: true, message: "gemini api route alive" });
}
