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

  const { prompt } = body;
  console.log("Prompt exists:", Boolean(prompt));
  console.log("Prompt length:", prompt?.length || 0);

  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  let geminiRes;
  try {
    geminiRes = await fetch(apiUrl, {
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

  return Response.json({ text });
}

export function GET() {
  return Response.json({ ok: true, message: "gemini api route alive" });
}
