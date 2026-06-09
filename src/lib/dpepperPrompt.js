import {
  commonRules,
  scalpRules,
  careRules,
  designRules,
  colorRetentionRules,
  bedheadRules,
  humidityDrynessRules,
  nutritionDietRules,
  hairAgeChangeRules,
  imageTranslationRules,
  bannedPhrases,
  preferredPhrases,
} from "./dpepperRules.js";

export function buildDpepperPrompt({ text, category, group, summary, guidance, entryTitle, isContinuing = false, hasImages = false }) {
  const categoryRulesParts = [];
  const appliedRuleNames = ["commonRules", "bannedPhrases", "preferredPhrases"];
  console.log("[DPEPPER PROMPT] hasImages:", hasImages, "| group:", group, "| category:", category);
  const isColorConsult = category === "カラー相談" || /色持ち|退色|色落ち|カラー持ち|トリートメント持ち|色が抜け|色が変わ|すぐ落ち|すぐ明るく|すぐ黄色|すぐ赤く|黄色っぽ|赤みが出|染めた時と違|持ちが悪|トリートメントが取れ|手触りが戻|パサつきが戻|ツヤがなくな/.test(text);
  const isBedheadConsult = /寝癖|寝ぐせ|跳ねる|はねる|朝はね|毛先がはね|根元がつぶれ|ボリュームがつぶれ|朝まとまらない|寝ると変|うねる|朝のセット|髪が広がる|湿気でまとまらない|寝汗/.test(text);
  const isHumidityDrynessConsult = /湿気|湿度|梅雨|汗|頭皮が蒸れ|蒸れ|アイロンが取れ|セットが取れ|セットが持たない|前髪が崩れ|前髪が割れ|前髪がうねる|表面がもわ|表面がパヤ|広がる|うねる|トップがつぶれ|ボリュームがつぶれ|乾燥|パサつく|静電気|帯電|絡まる|毛先が乾く|ツヤがない|冬に広がる|雨の日|湿気でうねる|湿気で広がる|汗で前髪|アイロンしても戻る|巻きが取れ|カールが取れ|チリチリ|アホ毛|もわもわ|冬にパサつく|服で静電気|マフラーで絡まる|乾燥で広がる/.test(text);
  if (group.includes("頭皮"))   { categoryRulesParts.push(scalpRules);  appliedRuleNames.push("scalpRules"); }
  if (group.includes("ケア"))   { categoryRulesParts.push(careRules);   appliedRuleNames.push("careRules"); }
  if (group.includes("デザイン") || hasImages) { categoryRulesParts.push(designRules); appliedRuleNames.push("designRules"); }
  if (isColorConsult) { categoryRulesParts.push(colorRetentionRules); appliedRuleNames.push("colorRetentionRules"); }
  if (isBedheadConsult) { categoryRulesParts.push(bedheadRules); appliedRuleNames.push("bedheadRules"); }
  if (isHumidityDrynessConsult) { categoryRulesParts.push(humidityDrynessRules); appliedRuleNames.push("humidityDrynessRules"); }
  const isNutritionDietConsult = /食べ物|栄養|何を食べたら|髪が生える|毛が生える|髪が伸びる|伸びやすい|早く伸ばしたい|サプリ|ビオチン|亜鉛|鉄分|タンパク質|プロテイン|ダイエット|食事制限|急に痩せた|抜け毛が増えた|髪が細くなった|ハリコシがなくなった|頭皮の栄養|栄養不足|数珠毛|ちぢれ毛/.test(text);
  if (isNutritionDietConsult) { categoryRulesParts.push(nutritionDietRules); appliedRuleNames.push("nutritionDietRules"); }
  const isHairAgeChangeConsult = /子どもの頃|子供の頃|昔は直毛|昔は髪が多かった|髪質が変わった|大人になって変わった|年齢で変わった|髪が細くなった|ハリコシがない|うねりが出た|白髪が増えて髪質が変わった|産毛|うぶ毛|顔まわりの毛|生え際の毛|襟足の毛|赤ちゃんの頃から|赤ちゃんの時から|細い毛|切れ毛|新しく生えた毛/.test(text);
  if (isHairAgeChangeConsult) { categoryRulesParts.push(hairAgeChangeRules); appliedRuleNames.push("hairAgeChangeRules"); }
  if (hasImages) { categoryRulesParts.push(imageTranslationRules); appliedRuleNames.push("imageTranslationRules"); }
  console.log("[DPEPPER PROMPT] hasImages:", hasImages, "| imageTranslationRules applied:", hasImages);
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
- 段落は3つ${!hasImages ? `
- 画像は添付されていない。「画像から見える範囲では」「貼っていただいた画像」「この画像は」「画像を参考にすると」など、画像を参照する表現を絶対に使わない` : ""}

【段落ごとの役割】
1段落目：${isContinuing ? "「続きですね。」「先ほどの内容に続けて整理します。」など会話継続前提の自然な一文で始める。初回挨拶「こんにちは、Da-isの髪と頭皮の相談所〜」は繰り返さない。" : "「こんにちは、Da-isの髪と頭皮の相談所『Dペッパー』です。」のあと、"}${hasImages ? "「貼っていただいた画像から見える範囲では、」の前置きを入れて画像で見える要素（長さ・シルエット・色味・明るさ・前髪・顔まわり・毛先の印象など確認できる範囲）を整理してから、" : ""}お客様が書いた悩みをより具体的な言葉で整理する。何が原因として考えられるか・何を見ると整理しやすいかを、断定せず文章で伝える。「来店してください」ではなく「このように考えると整理しやすい」「自分の髪を見る視点が少し変わる」という方向で書く。

2段落目：次の来店まで家で観察しておくと相談しやすいポイントを、文章の流れの中に自然に織り込む（箇条書き・見出し禁止）。カテゴリ「${category}」に合わせた観察視点を2〜3点、文章として提案する。観察例の参考：白髪なら「分け目・顔まわり・こめかみのどこが一番早く気になるか」「根元の白さなのか全体の色落ちなのか」「室内と外での見え方の違い」。ダメージなら「濡れているときに絡まるのか乾いた後か」「毛先だけか中間からか」「トリートメント直後は良いが何日で戻るか」。抜け毛なら「毎回多いのか洗髪間隔が空いた日だけか」「地肌の見え方が変わったか」。カットや似合わせなら「気になるのは長さか重さかシルエットか」「普段のスタイリングで何が一番困るか」。これらは参考例であり、相談内容に合わせて自然な文章に組み替える。

3段落目：必要なら来店時のメモや予約時の備考にも使えるよう、相談内容を自然な一文でまとめる（「○○が気になる。△△を見るとわかりやすい」という形）。来店・予約を促す文は書かない。予約ボタンは別に用意されているため、AI文の中に来店催促・来店誘導を含めない。`;
}
