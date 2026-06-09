import {
  commonRules,
  scalpRules,
  careRules,
  designRules,
  colorRetentionRules,
  imageTranslationRules,
  bannedPhrases,
  preferredPhrases,
} from "./dpepperRules.js";

export function buildDpepperPrompt({ text, category, group, summary, guidance, entryTitle, isContinuing = false, hasImages = false }) {
  const categoryRulesParts = [];
  const appliedRuleNames = ["commonRules", "bannedPhrases", "preferredPhrases"];
  console.log("[DPEPPER PROMPT] hasImages:", hasImages, "| group:", group, "| category:", category);
  const isColorConsult = category === "カラー相談" || /色持ち|退色|色落ち|カラー持ち|トリートメント持ち/.test(text);
  if (group.includes("頭皮"))   { categoryRulesParts.push(scalpRules);  appliedRuleNames.push("scalpRules"); }
  if (group.includes("ケア"))   { categoryRulesParts.push(careRules);   appliedRuleNames.push("careRules"); }
  if (group.includes("デザイン") || hasImages) { categoryRulesParts.push(designRules); appliedRuleNames.push("designRules"); }
  if (isColorConsult) { categoryRulesParts.push(colorRetentionRules); appliedRuleNames.push("colorRetentionRules"); }
  if (hasImages || group.includes("デザイン")) { categoryRulesParts.push(imageTranslationRules); appliedRuleNames.push("imageTranslationRules"); }
  console.log("[DPEPPER PROMPT] applied rules:", appliedRuleNames.join(", "));
  const categoryRulesText = categoryRulesParts.join("\n\n");

  return `【前提・役割】
${commonRules}

${categoryRulesText ? `${categoryRulesText}\n\n` : ""}【禁止・推奨】
${bannedPhrases}
${preferredPhrases}

【今回の分類】
入口：${entryTitle} / カテゴリ：${category} / 分類：${group}
整理：${summary}
判断メモ：${guidance}${(hasImages || group.includes("デザイン")) ? `
画像添付：${hasImages ? "あり（画像から見える範囲を参考にしてよい。「この画像は」「貼っていただいた画像を参考にすると」などの表現を使う）" : "なし（「この画像は」「貼っていただいた画像」などの画像言及表現は使わない。言葉のズレ整理と担当美容師メモの観点のみ適用）"}` : ""}

【相談文】
${text}

【出力制約】
- Markdown禁止。「#」「##」「###」「*」「-」「1.」などの記号見出し・箇条書き禁止
- プレーンな日本語の文章だけで返す
- 380〜520文字以内で必ず完結させる。途中で文章を切らない
- 必ず句点「。」で文章全体を終える
- 段落は3つ

【段落ごとの役割】
1段落目：${isContinuing ? "「続きですね。」「先ほどの内容に続けて整理します。」など会話継続前提の自然な一文で始める。初回挨拶「こんにちは、Da-isの髪と頭皮の相談所〜」は繰り返さない。" : "「こんにちは、Da-isの髪と頭皮の相談所『Dペッパー』です。」のあと、"}${hasImages ? "「貼っていただいた画像から見える範囲では、」の前置きを入れて画像で見える要素（長さ・シルエット・色味・明るさ・前髪・顔まわり・毛先の印象など確認できる範囲）を整理してから、" : ""}お客様が書いた悩みをより具体的な言葉で整理する。何が原因として考えられるか・何を見ると整理しやすいかを、断定せず文章で伝える。「来店してください」ではなく「このように考えると整理しやすい」「自分の髪を見る視点が少し変わる」という方向で書く。

2段落目：次の来店まで家で観察しておくと相談しやすいポイントを、文章の流れの中に自然に織り込む（箇条書き・見出し禁止）。カテゴリ「${category}」に合わせた観察視点を2〜3点、文章として提案する。観察例の参考：白髪なら「分け目・顔まわり・こめかみのどこが一番早く気になるか」「根元の白さなのか全体の色落ちなのか」「室内と外での見え方の違い」。ダメージなら「濡れているときに絡まるのか乾いた後か」「毛先だけか中間からか」「トリートメント直後は良いが何日で戻るか」。抜け毛なら「毎回多いのか洗髪間隔が空いた日だけか」「地肌の見え方が変わったか」。カットや似合わせなら「気になるのは長さか重さかシルエットか」「普段のスタイリングで何が一番困るか」。これらは参考例であり、相談内容に合わせて自然な文章に組み替える。

3段落目：必要なら来店時のメモや予約時の備考にも使えるよう、相談内容を自然な一文でまとめる（「○○が気になる。△△を見るとわかりやすい」という形）。来店・予約を促す文は書かない。予約ボタンは別に用意されているため、AI文の中に来店催促・来店誘導を含めない。`;
}
