export const config = {
  maxDuration: 30,
};

async function fetchUrlContent(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en;q=0.9",
      },
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text")) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1500);
    return text || null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not set" });
  }

  const { prompt, urls = [] } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  /* URL参照：サーバー側でフェッチしてプロンプトに追加 */
  let urlSection = "";
  const validUrls = Array.isArray(urls) ? urls.filter(u => typeof u === "string" && u.trim()) : [];
  if (validUrls.length > 0) {
    console.log("Fetching URLs:", validUrls);
    const results = await Promise.all(
      validUrls.map(async (u) => {
        const content = await fetchUrlContent(u);
        if (content) {
          console.log(`URL fetch success: ${u} (${content.length}chars)`);
          return `URL: ${u}\n参照内容：${content}`;
        } else {
          console.log(`URL fetch failed: ${u}`);
          return `URL: ${u}\n参照内容：このURLの内容は確認できませんでした（Amazon・楽天・Instagram・Pinterestなどは取得できない場合があります）`;
        }
      })
    );
    urlSection =
      `\n\n【参考URL内容】\n${results.join("\n\n")}` +
      `\n\n【URLへの指示】URLの内容は参考情報として扱う。「この商品が合う・合わない」と断定しない。Da-isの判断基準で見るポイントを整理する。「使い続けた変化を見る」「蓄積の可能性」の視点を加える。内容を確認できなかったURLは相談文の文脈だけで判断する。`;
  }

  /* 【出力制約】の直前にURL参照セクションを挿入 */
  const insertMarker = "【出力制約】";
  const insertIdx = prompt.lastIndexOf(insertMarker);
  const fullPrompt = insertIdx !== -1
    ? prompt.slice(0, insertIdx) + urlSection + "\n\n" + prompt.slice(insertIdx)
    : prompt + urlSection;

  const MODEL = "gemini-2.5-flash";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  try {
    const geminiRes = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: 10000,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({}));
      const message = errBody?.error?.message ?? "(no message)";
      const status = errBody?.error?.status ?? geminiRes.status;
      return res.status(geminiRes.status).json({
        error: `Gemini API error: ${geminiRes.status} ${status} – ${message}`,
      });
    }

    const data = await geminiRes.json();

    if (!data.candidates || data.candidates.length === 0) {
      return res.status(500).json({ error: "Gemini response has no candidates" });
    }

    const parts = data.candidates[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      return res.status(500).json({ error: "Gemini response has no content parts" });
    }

    const text = parts[0]?.text;
    if (!text) {
      return res.status(500).json({ error: "Gemini response text is empty" });
    }

    console.log("Gemini finishReason:", data.candidates?.[0]?.finishReason);
    console.log("Gemini safetyRatings:", data.candidates?.[0]?.safetyRatings);
    console.log("Gemini response length:", text.length);
    console.log("Gemini response preview:", text);

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message ?? "Unknown error" });
  }
}
