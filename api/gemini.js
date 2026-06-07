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

async function callGemini(apiUrl, promptText) {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: {
        temperature: 0.4,
        topP: 0.9,
        maxOutputTokens: 10000,
      },
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message = errBody?.error?.message ?? "(no message)";
    const status = errBody?.error?.status ?? res.status;
    throw new Error(`Gemini API error: ${res.status} ${status} – ${message}`);
  }
  return res.json();
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

  /* カテゴリ・グループをプロンプトから抽出（ログ用） */
  const categoryMatch = prompt.match(/カテゴリ：([^\s/]+)/);
  const groupMatch = prompt.match(/分類：([^\n/]+)/);
  const logCategory = categoryMatch?.[1]?.trim() ?? "不明";
  const logGroup = groupMatch?.[1]?.trim() ?? "不明";

  /* URL バリデーション：空・プレースホルダー・不正形式を除外 */
  const validUrls = Array.isArray(urls)
    ? urls.filter(u => {
        if (typeof u !== "string") return false;
        const t = u.trim();
        return t.length > 0
          && t !== "https://..."
          && t !== "https://"
          && t !== "http://"
          && (t.startsWith("https://") || t.startsWith("http://"));
      })
    : [];

  console.log("URL count:", urls?.length);
  console.log("Has valid URLs:", validUrls.length > 0);
  console.log("Consult category:", logCategory);
  console.log("Group:", logGroup);

  /* URL 参照：サーバー側でフェッチしてプロンプトに追加 */
  let urlSection = "";
  if (validUrls.length > 0) {
    try {
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
        `\n\n【URLへの指示】URLの内容は参考情報として扱う。「この商品が合う・合わない」と断定しない。Da-isの判断基準で使用感・蓄積感・乾きにくさ・根元の重さ・数週間使った変化を見るポイントを整理する。内容を確認できなかったURLは相談文の文脈だけで判断する。`;
    } catch (urlErr) {
      console.error("URL section build error:", urlErr?.message);
      /* URL 処理が全体的に失敗しても Gemini 呼び出しは続行 */
    }
  }

  /* 【出力制約】の直前に URL 参照セクションを挿入 */
  const insertMarker = "【出力制約】";
  const insertIdx = prompt.lastIndexOf(insertMarker);
  const fullPrompt = insertIdx !== -1
    ? prompt.slice(0, insertIdx) + urlSection + "\n\n" + prompt.slice(insertIdx)
    : prompt + urlSection;

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  try {
    const data = await callGemini(apiUrl, fullPrompt);
    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason;

    console.log("Gemini finishReason:", finishReason);
    console.log("Gemini safetyRatings:", candidate?.safetyRatings);

    /* Safety block 等で content が取れない場合は URL なしでリトライ */
    if (!candidate?.content) {
      console.log("Gemini blocked or no content. finishReason:", finishReason);
      if (urlSection) {
        console.log("Retrying without URL section");
        try {
          const retryData = await callGemini(apiUrl, prompt);
          const retryText = retryData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (retryText) {
            console.log("Retry succeeded:", retryText.length, "chars");
            return res.status(200).json({ text: retryText });
          }
        } catch (retryErr) {
          console.error("Retry also failed:", retryErr?.message);
        }
      }
      return res.status(500).json({
        error: "Gemini response was blocked or empty",
        finishReason: finishReason ?? "unknown",
      });
    }

    const text = candidate.content.parts?.[0]?.text;
    if (!text) {
      return res.status(500).json({ error: "Gemini response text is empty" });
    }

    console.log("Gemini response length:", text.length);
    console.log("Gemini response preview:", text.slice(0, 120));

    return res.status(200).json({ text });
  } catch (err) {
    console.error("Handler error:", err?.message);
    return res.status(500).json({ error: err.message ?? "Unknown error" });
  }
}
