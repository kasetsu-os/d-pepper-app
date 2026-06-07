function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    // 検索・広告・トラッキング系パラメータを削除
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
  console.log("Normalized URL:", normalizedUrl);

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
    console.log("Fetch status:", res.status);
    console.log("Fetch content-type:", res.headers.get("content-type"));
    console.log("Fetch ok:", res.ok);
    if (!res.ok) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1500);
    return text || null;
  } catch (error) {
    clearTimeout(timer);
    console.error("URL fetch failed:", error.message);
    return null;
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

  let { prompt, urls = [] } = body;
  console.log("Prompt exists:", Boolean(prompt));
  console.log("Prompt length:", prompt?.length || 0);

  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  // URL処理
  const validUrls = Array.isArray(urls) ? urls.filter((u) => typeof u === "string" && u.startsWith("http")) : [];
  console.log("URL count:", validUrls.length);

  let urlStatus = "not_provided";
  let urlSection = "";

  if (validUrls.length > 0) {
    const results = await Promise.all(validUrls.map((u) => fetchUrlContent(u)));
    const successfulContents = results.filter(Boolean);
    console.log("URL read status:", successfulContents.length > 0 ? "readable" : "unreadable");

    if (successfulContents.length > 0) {
      urlStatus = "readable";
      const combined = successfulContents.join("\n\n---\n\n").slice(0, 2000);
      urlSection = `\n【URL参照内容】\nurlStatus: readable（URLの内容を参照できました）\n応答の1段落目か2段落目の自然な流れの中で、必ず「貼っていただいたURLの内容を参考にすると、」または「URLで確認できた内容をもとにすると、」など短く明示すること。断定（合う・合わない・買った方がいい・これにしてください等）はしない。商品の種類・気になる特徴・使用感確認点・数週間での変化の見方を整理する形で伝える。Da-is視点：成分名だけでなく、使用感・蓄積感・乾きにくさ・重さ・数週間使った変化を見ることが大切と伝える。\n\n${combined}\n`;
    } else {
      urlStatus = "unreadable";
      urlSection = `\n【URL参照内容】\nurlStatus: unreadable（URLの内容を確認できませんでした）\n応答の中で必ず「URLの内容までは確認できませんでしたが、」と一言添えて、相談文をもとに見るポイントを整理する。\n`;
    }
  } else {
    console.log("URL read status: not_provided");
  }

  console.log("URL context used:", urlStatus);

  // プロンプトにURL情報を注入（【出力制約】の前）
  const finalPrompt = urlSection
    ? prompt.replace("【出力制約】", `${urlSection}\n【出力制約】`)
    : prompt;

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  let geminiRes;
  try {
    geminiRes = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: finalPrompt }] }],
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

  return Response.json({ text, urlStatus });
}

export function GET() {
  return Response.json({ ok: true, message: "gemini api route alive" });
}
