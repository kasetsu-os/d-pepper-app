// 画像つき相談の送信容量を「実測」で上限内に収める（2026-10 保守点検）
//
// Vercel Functions はリクエスト本文全体が 4.5MB まで。
// 縮小設定（px・品質）は容量の保証にならないため、変換後の実際の文字数を測り、
// 超えていれば段階的に再圧縮し、それでも超える場合は送信しない。

// 画像（base64文字列）の合計の上限。指示文・相談文などの余白を残す
export const IMAGE_BUDGET_CHARS = 3_900_000;
// 送信データ全体（JSON本文）の上限。サーバー側 4.4MB・Vercel 4.5MB より手前
export const REQUEST_LIMIT_BYTES = 4_300_000;

export const ENCODE_STEPS = [
  { max: 1280, quality: 0.75 },
  { max: 1024, quality: 0.7 },
  { max: 800, quality: 0.6 },
];

export const PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE";

export function totalChars(images) {
  return images.reduce((sum, img) => sum + (img?.data?.length || 0), 0);
}

export function bodyByteLength(body) {
  return new TextEncoder().encode(typeof body === "string" ? body : JSON.stringify(body)).length;
}

// encodeFn(imgObj, max, quality) → Promise<{ name, mimeType, data } | null>
// 戻り値: { images, step, totalChars, tooLarge }
export async function encodeWithinBudget(imgObjs, encodeFn, { budget = IMAGE_BUDGET_CHARS, steps = ENCODE_STEPS } = {}) {
  if (!imgObjs.length) return { images: [], step: null, totalChars: 0, tooLarge: false };
  let last = { images: [], totalChars: 0 };
  for (const step of steps) {
    const images = (await Promise.all(imgObjs.map((o) => encodeFn(o, step.max, step.quality)))).filter(Boolean);
    const chars = totalChars(images);
    last = { images, totalChars: chars };
    if (chars <= budget) return { images, step, totalChars: chars, tooLarge: false };
  }
  return { images: [], step: null, totalChars: last.totalChars, tooLarge: true };
}
