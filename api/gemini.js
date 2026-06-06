export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not set" });
  }

  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  const MODEL = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  try {
    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
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
