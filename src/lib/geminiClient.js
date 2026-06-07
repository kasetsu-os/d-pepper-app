export async function askGemini(prompt, urls = [], images = []) {
  console.log("Sending images count:", images?.length || 0);
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, urls, images }),
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

  console.log("AI response length:", data.text.length);
  console.log("AI response preview:", data.text);

  return data.text;
}
