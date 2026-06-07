export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "GEMINI_API_KEY is not set" }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { prompt } = body;
  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  console.log("Gemini request received");

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
    return Response.json({ error: err.message ?? "Fetch to Gemini failed" }, { status: 500 });
  }

  if (!geminiRes.ok) {
    const errBody = await geminiRes.json().catch(() => ({}));
    const message = errBody?.error?.message ?? "(no message)";
    const status = errBody?.error?.status ?? geminiRes.status;
    return Response.json(
      { error: `Gemini API error: ${geminiRes.status} ${status} – ${message}` },
      { status: geminiRes.status }
    );
  }

  const data = await geminiRes.json();

  if (!data.candidates || data.candidates.length === 0) {
    return Response.json({ error: "Gemini response has no candidates" }, { status: 500 });
  }

  const candidate = data.candidates[0];
  console.log("Gemini finishReason:", candidate?.finishReason);

  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    return Response.json({ error: "Gemini response text is empty" }, { status: 500 });
  }

  console.log("Gemini response length:", text.length);

  return Response.json({ text });
}

export function GET() {
  return Response.json({ ok: true, message: "gemini api route alive" });
}
