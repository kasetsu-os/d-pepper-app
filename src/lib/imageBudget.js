// 画像つき相談の送信容量を「実測」で上限内に収める（2026-10 保守点検）
//
// Vercel Functions はリクエスト本文全体が 4.5MB まで。
// 縮小設定（px・品質）は容量の保証にならないため、変換後の実際の文字数を測り、
// 超えていれば段階的に再圧縮し、それでも超える場合は送信しない。

// 上限値はサーバーと共通（src/lib/limits.js）
import { IMAGE_BUDGET_CHARS, MAX_IMAGE_B64_CHARS, REQUEST_LIMIT_BYTES } from "./limits.js";
export { IMAGE_BUDGET_CHARS, MAX_IMAGE_B64_CHARS, REQUEST_LIMIT_BYTES };

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
// 送ってよい条件：「全画像の合計が上限以内」かつ「すべての画像が1枚あたりの上限以内」
export function withinLimits(images, { budget = IMAGE_BUDGET_CHARS, perImage = MAX_IMAGE_B64_CHARS } = {}) {
  return totalChars(images) <= budget && images.every((img) => (img?.data?.length || 0) <= perImage);
}

export async function encodeWithinBudget(imgObjs, encodeFn, { budget = IMAGE_BUDGET_CHARS, perImage = MAX_IMAGE_B64_CHARS, steps = ENCODE_STEPS } = {}) {
  if (!imgObjs.length) return { images: [], step: null, totalChars: 0, tooLarge: false };
  let last = { images: [], totalChars: 0 };
  for (const step of steps) {
    const images = (await Promise.all(imgObjs.map((o) => encodeFn(o, step.max, step.quality)))).filter(Boolean);
    const chars = totalChars(images);
    last = { images, totalChars: chars };
    if (withinLimits(images, { budget, perImage })) return { images, step, totalChars: chars, tooLarge: false };
  }
  return { images: [], step: null, totalChars: last.totalChars, tooLarge: true };
}
