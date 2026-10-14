// 返信先メールアドレスの確認（画面とサーバーで共通。2026-10 履歴共有の返信先）
// 届くかどうかまでは分からないため、明らかな入力ミス・不正な文字だけを弾く。

export const MAX_EMAIL_LENGTH = 254;

export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > MAX_EMAIL_LENGTH) return false;
  // 空白・改行・カンマ・山かっこ・引用符などを含まない「ローカル部@ドメイン.トップ」
  return /^[^\s@<>()[\]\\,;:"']+@[^\s@<>()[\]\\,;:"']+\.[A-Za-z]{2,}$/.test(email) && !email.includes("..");
}
