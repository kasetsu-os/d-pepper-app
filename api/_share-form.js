// 履歴共有：Googleフォームへ送る項目と、送信結果の判定（2026-10 保守点検）
// ※ api/ 配下でも "_" で始まるファイルは Vercel の関数として公開されない

export const FORM_ACTION =
  "https://docs.google.com/forms/d/e/1FAIpQLSevLDDVaXd3S0eMHNqL7GTomvm3TY8SwUFQO62WeOgRJd8nJQ/formResponse";

// 必須の質問「返信を希望しますか？」の項目ID と、選択肢の文字列。
// Googleフォームの「事前入力したURLを取得」で確認した値だけを入れる（推測で入れない）。
// 形式: { entry: "entry.<数字>", choices: { 返信希望: "<選択肢の文字列>", 返信不要: "<選択肢の文字列>" } }
// null にすると、この質問を送らない（フォーム側で必須の場合、Google が 400 を返す）。
// 2026-10-14 店長がフォームで確認した値
export const REPLY_FIELD = {
  entry: "entry.1518046549",
  choices: {
    返信希望: "返信希望",
    返信不要: "返信不要",
  },
};

// 「返信希望の場合のみ入力してください。」（返信先メールアドレス）の項目ID。
// Googleフォームの「事前入力したURLを取得」で確認した値だけを入れる（推測で入れない）。
// 形式: "entry.<数字>"。null にすると、返信希望の履歴共有をサーバーで受け付けない
// （返信先を届けられないまま「返信希望」として送らないため）。
// 2026-10-14 店長がフォームの事前入力URLで確認した値
export const EMAIL_FIELD = "entry.792546235";

export function buildFormParams({ consultText, aiText, reply, replyEmail }, replyField = REPLY_FIELD, emailField = EMAIL_FIELD) {
  const params = new URLSearchParams({
    "entry.1825538084": consultText,
    "entry.948403332": aiText.slice(0, 3500),
    "entry.1738990388": "履歴共有",
  });
  if (replyField) {
    const choice = replyField.choices[reply === "返信不要" ? "返信不要" : "返信希望"];
    if (!choice) throw new Error("reply choice is not configured");
    params.set(replyField.entry, choice);
  }
  // 返信先は「返信希望」のときだけ送る（返信不要のときは混入させない）
  if (reply === "返信希望" && replyEmail) {
    if (!emailField) throw new Error("reply email field is not configured");
    params.set(emailField, replyEmail);
  }
  params.set("fvv", "1");
  params.set("pageHistory", "0");
  params.set("fbzx", Date.now().toString());
  return params;
}

// Google からの応答を判定する。ここでの「成功」は Google が受け付けたという意味で、
// 回答の記録とメール通知が行われたことまでは保証しない（実環境で別途確認する）。
export function classifyFormResponse(res) {
  if (res.status === 200) return { ok: true };
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location") || "";
    let host;
    try { host = new URL(location, FORM_ACTION).hostname; } catch { host = ""; }
    // ログイン画面への転送は、送信が受け付けられていない（フォームがログイン必須など）
    if (host === "accounts.google.com" || /ServiceLogin/i.test(location)) {
      return { ok: false, reason: "login_required" };
    }
    return { ok: true };
  }
  return { ok: false, reason: `status_${res.status}` };
}
