import {
  commonRules,
  scalpRules,
  careRules,
  designRules,
  bannedPhrases,
  preferredPhrases,
} from "./dpepperRules.js";

export function buildDpepperPrompt({ text, category, group, summary, guidance, entryTitle }) {
  const categoryRulesParts = [];
  if (group.includes("頭皮")) categoryRulesParts.push(scalpRules);
  if (group.includes("ケア")) categoryRulesParts.push(careRules);
  if (group.includes("デザイン")) categoryRulesParts.push(designRules);
  const categoryRulesText = categoryRulesParts.join("\n\n");

  return `【前提・役割】
${commonRules}

${categoryRulesText ? `${categoryRulesText}\n\n` : ""}【禁止・推奨】
${bannedPhrases}
${preferredPhrases}

【今回の分類】
入口：${entryTitle} / カテゴリ：${category} / 分類：${group}
整理：${summary}
判断メモ：${guidance}

【相談文】
${text}

【出力制約】
- Markdown禁止。「#」「##」「###」「*」「-」「1.」などの記号見出し・箇条書き禁止
- プレーンな日本語の文章だけで返す
- 挨拶込み220〜320文字以内で必ず完結させる
- 段落は2つ。1段落目：「こんにちは、Da-isの来店前相談AI『Dペッパー』です。」のあと悩みを受け止める一文。2段落目：要因整理＋来店で一緒に確認できる旨を伝えて完結
- 必ず句点「。」で文章全体を終える
- 途中で文章を切らない。最後まで書いてから終える`;
}
