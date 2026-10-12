// Dペッパーの送信上限（画面側とサーバー側で共通。2026-10 保守点検）
// 画面（src/lib/imageBudget.js, geminiClient.js）とサーバー（api/gemini.js）の両方がこのファイルを読む。
// 値を変えるときはここだけを変える。

// サーバーが受け付ける本文全体の上限（バイト）。Vercel Functions の 4.5MB より手前
export const SERVER_MAX_BODY_BYTES = 4_400_000;
// 画面側が送信を許可する本文全体の上限（バイト）。サーバー上限よりさらに手前
export const REQUEST_LIMIT_BYTES = 4_300_000;

export const MAX_IMAGES = 3;
// 画像は base64（英数字のみ）なので 文字数 = バイト数
export const MAX_IMAGE_B64_CHARS = 2_000_000; // 1枚あたりの上限
export const IMAGE_BUDGET_CHARS = 3_900_000;  // 全画像の合計の上限
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const MAX_URLS = 3;
export const MAX_PROMPT_CHARS = 40_000;

// 履歴共有の本文上限（バイト）
export const SHARE_MAX_BODY_BYTES = 100_000;
