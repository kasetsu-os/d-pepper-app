export async function askGemini(prompt) {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message = errBody?.error ?? "(no message)";
    throw new Error(`Gemini API error: ${res.status} – ${message}`);
  }

  const data = await res.json();

  if (!data.text) {
    throw new Error("Gemini response has no text");
  }

  return data.text;
}
