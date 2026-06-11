const NO_RETRY_STATUSES = new Set([400, 401, 403]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchGemini(apiUrl, requestBody, hasImages) {
  const timeoutMs = hasImages ? 35000 : 25000;
  const retryDelays = [1500];
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) return { ok: true, res };

      const errBody = await res.json().catch(() => ({}));
      const message = errBody?.error?.message ?? "(no message)";
      const status = errBody?.error?.status ?? res.status;
      console.error(`Gemini API error | attempt ${attempt}/${maxAttempts} | HTTP ${res.status} | ${status} – ${message}`);

      if (NO_RETRY_STATUSES.has(res.status)) {
        return { ok: false, error: `Gemini API error: ${res.status} ${status} – ${message}`, httpStatus: res.status };
      }
      if (attempt < maxAttempts) {
        await sleep(retryDelays[attempt - 1]);
        continue;
      }
      return { ok: false, error: `Gemini API error: ${res.status} ${status} – ${message}`, httpStatus: res.status };
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err.name === "AbortError";
      console.error(`Gemini fetch failed | attempt ${attempt}/${maxAttempts} | hasImages:${hasImages} | ${isTimeout ? "timeout" : err.message}`);

      if (attempt < maxAttempts) {
        await sleep(retryDelays[attempt - 1]);
        continue;
      }
      return {
        ok: false,
        error: isTimeout ? "Gemini request timed out" : (err.message ?? "Fetch to Gemini failed"),
        httpStatus: 500,
      };
    }
  }
}

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

  const { prompt, urls = [], images = [], mode = "customer" } = body;
  const ts = new Date().toISOString();
  console.log(`[${ts}] Gemini request | mode:${mode} | images:${Array.isArray(images) ? images.length : 0} | urls:${Array.isArray(urls) ? urls.length : 0}`);
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
    unreadableResults.forEach((r) => console.log(`URL unreadable | host: ${(() => { try { return new URL(r.normalizedUrl || r.originalUrl).hostname; } catch { return r.originalUrl; } })()} | error: ${r.error}`));

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
      urlSection = `\n【URL参照内容】\nurlStatus: readable\n応答の自然な流れの中で、必ず「貼っていただいたURLの内容を参考にすると、」と明示すること。断定（合う・合わない・買った方がいい等）はしない。URLの内容と相談文をもとに、相談の主題（ヘアスタイル・カラー・ケア・頭皮など）に沿った視点で整理する。プロンプトの判断基準ルールに従うこと。\n\n${combined}\n`;
    } else if (urlStatus === "partial") {
      const combined = readableResults.map((r) => r.text).join("\n\n---\n\n").slice(0, 2000);
      urlSection = `\n【URL参照内容】\nurlStatus: partial（一部のURLは内容を確認できました。確認できなかったURLもあります）\n応答の自然な流れの中で、必ず「貼っていただいたURLのうち、一部の内容を参考にすると、」と明示すること。断定（合う・合わない・買った方がいい等）はしない。読めた内容と相談文をもとに、相談の主題（ヘアスタイル・カラー・ケア・頭皮など）に沿った視点で整理する。プロンプトの判断基準ルールに従うこと。\n\n${combined}\n`;
    } else {
      urlSection = `\n【URL参照内容】\nurlStatus: unreadable（全てのURLの内容を確認できませんでした）\n応答の中で必ず「URLの内容までは確認できませんでしたが、相談文をもとに見るポイントを整理します。」と明示すること。相談の主題がヘアスタイル・カラーの場合はそちらの観点で整理すること。\n`;
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

  console.log("[DPEPPER API] images.length received:", Array.isArray(images) ? images.length : 0);
  console.log("[DPEPPER API] validImages:", validImages.length);
  console.log("[DPEPPER API] image mimeTypes:", validImages.map((img) => img.mimeType));
  if (validImages.length > 0) {
    console.log("[DPEPPER API] first image mimeType:", validImages[0].mimeType);
    console.log("[DPEPPER API] first image data length:", validImages[0].data.length);
  }

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
      imageSection = `\n【画像参照】\nimageStatus: readable\n画像が添付されています。画像は診断ではなく相談整理の参考として扱ってください。応答の自然な流れの中で、必ず「貼っていただいた画像から見える範囲では、」と明示すること。確認できる範囲：髪の長さ・明るさ・色味の印象・広がり・まとまり・毛先のパサつき印象・スタイルの方向性・白髪や根元の見え方の参考。禁止：薄毛・炎症・病気・ダメージレベル確定・薬剤選定断定・商品の合う合わない断定。光の当たり方・画質・角度で見え方が変わることを前提にする。\n`;
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
    // data に接頭辞が残っていないか最終確認
    const cleanData = img.data.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
    parts.push({ inlineData: { mimeType: img.mimeType, data: cleanData } });
  }

  console.log("[DPEPPER API] parts count:", parts.length);
  console.log("[DPEPPER API] inlineData parts:", parts.filter((p) => p.inlineData).length);
  console.log("[DPEPPER API] hasImages:", validImages.length > 0, "| hasUrls:", validUrls.length > 0);
  if (validImages.length > 0) {
    console.log("[DPEPPER API] first image mimeType in parts:", validImages[0].mimeType);
    console.log("[DPEPPER API] first image data prefix:", validImages[0].data.slice(0, 20));
  }

  const requestBody = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.4,
      topP: 0.9,
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  console.log("Calling Gemini | parts:", parts.length, "| hasImages:", validImages.length > 0);
  const geminiResult = await fetchGemini(apiUrl, requestBody, validImages.length > 0);
  if (!geminiResult.ok) {
    console.error(`[${new Date().toISOString()}] Gemini error | mode:${mode} | ${geminiResult.error}`);
    return Response.json({ error: geminiResult.error }, { status: geminiResult.httpStatus });
  }

  const data = await geminiResult.res.json();

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

  console.log(`[${new Date().toISOString()}] Gemini ok | mode:${mode} | length:${text.length} | urlStatus:${urlStatus} | imageStatus:${imageStatus}`);

  return Response.json({ text, urlStatus, imageStatus });
}

export function GET() {
  return Response.json({ ok: true, message: "gemini api route alive" });
}
