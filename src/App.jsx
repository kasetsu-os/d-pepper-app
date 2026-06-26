import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { buildDpepperPrompt } from "./lib/dpepperPrompt";
import { buildRecruitPrompt, classifyRecruit } from "./lib/recruitEngine";
import { askGemini } from "./lib/geminiClient";

function withDaIs(text) {
  if (!text || !text.includes("Da-is")) return text;
  return text.split("Da-is").flatMap((part, i, arr) =>
    i < arr.length - 1
      ? [part, <ruby key={i}>Da-is<rt>デイズ</rt></ruby>]
      : [part]
  );
}

const STORAGE_KEY = "d-pepper-consultations";
const FONT_SIZE_KEY = "d-pepper-font-size";
const FEEDBACK_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSdxr97reDcABJk6Xfom8MUAYUV09GGhd_i1X7yke3B7SogWoA/viewform?usp=publish-editor";
const SHARE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSevLDDVaXd3S0eMHNqL7GTomvm3TY8SwUFQO62WeOgRJd8nJQ/viewform?usp=publish-editor";

const ENTRIES = [
  {
    id: "regular",
    title: "いつも来ている方",
    subtitle: "またお会いできて嬉しいです",
    badge: "いつも来ている方",
    label: "今日のご相談内容",
    sub: "いつものことでも、少し気になったことでも大丈夫です。",
    icon: "heart",
  },
  {
    id: "first",
    title: "はじめての方",
    subtitle: "Da-isへようこそ",
    badge: "はじめての方",
    label: "はじめましてのご相談",
    sub: "気になることを、まとまっていないままでも大丈夫です。",
    icon: "leaf",
  },
  {
    id: "stylist",
    title: "美容師・見学希望の方",
    subtitle: "ご興味をお持ちいただきありがとうございます",
    badge: "美容師・見学希望",
    label: "ご興味の内容をお聞かせください",
    sub: "見学や働き方について、気になることをご記入ください。詳しい確認が必要な場合は、お電話にてお問い合わせください。",
    icon: "scissors",
  },
];

/* 出口ボタン定義（URL は仮置き・フェーズ2で本接続） */
const EXIT_BUTTONS = {
  "髪の悩み": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約メニューを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/coupon/" },
    { label: "店舗に電話する",               url: "tel:0888023370" },
  ],
  "頭皮の悩み": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約メニューを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/coupon/" },
    { label: "店舗に電話する",               url: "tel:0888023370" },
  ],
  "ダメージ・手触り相談": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約メニューを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/coupon/" },
    { label: "店舗に電話する",               url: "tel:0888023370" },
  ],
  "疲れ・気分・リラックス": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約メニューを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/coupon/" },
    { label: "noteを見る",                   url: "https://note.com/da_is1119" },
  ],
  "美容室選びの不安": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約メニューを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/coupon/" },
    { label: "店舗に電話する",               url: "tel:0888023370" },
  ],
  "メニュー・予約前の迷い": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約メニューを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/coupon/" },
    { label: "店舗に電話する",               url: "tel:0888023370" },
  ],
  "商品相談": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約メニューを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/coupon/" },
    { label: "店舗に電話する",               url: "tel:0888023370" },
  ],
  "美容師・見学希望": [
    { label: "Instagramを見る",              url: "https://www.instagram.com/dais.kochi/" },
    { label: "noteを見る",                   url: "https://note.com/da_is1119" },
    { label: "店舗に問い合わせる",           url: "tel:0888023370" },
  ],
  "円形脱毛症の相談": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約メニューを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/coupon/" },
    { label: "店舗に電話する",               url: "tel:0888023370" },
  ],
  "薄毛・抜け毛の相談": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約メニューを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/coupon/" },
    { label: "店舗に電話する",               url: "tel:0888023370" },
  ],
};

function classifyConsult(text) {
  const v = text.toLowerCase();

  /* 不満・クレーム系：内部検知のみ、画面にカテゴリ名は表示しない */
  const COMPLAINT_KW = ["不満", "クレーム", "返金", "やり直し", "やりなおし", "苦情", "文句", "怒って", "怒りました", "謝罪", "賠償", "やりなおして", "やりなおしてほしい"];
  if (COMPLAINT_KW.some((kw) => v.includes(kw)))
    return { category: "__complaint__", group: "内部確認", summary: "", guidance: "", nextAction: "" };

  /* ─── 頭皮 ─── */
  if (v.includes("円形") || v.includes("ハゲ") || v.includes("はげ") || v.includes("丸く抜け") || v.includes("脱毛斑"))
    return {
      category: "円形脱毛症の相談", group: "頭皮",
      summary: "一部の抜け毛や頭皮状態についての相談として記録しました。",
      guidance: "円形脱毛症や部分的な脱毛は、美容室でできることと専門家に委ねるべきことがあります。気になる症状が続く・広がる場合は皮膚科への相談をおすすめします。美容室では髪型・分け目の工夫や頭皮に配慮した施術でサポートできます。",
      nextAction: "気になる状態が続く場合は、皮膚科へのご相談もご検討ください。以下からご希望の案内先をお選びください。",
    };
  if (v.includes("薄毛") || v.includes("抜け毛") || v.includes("抜毛") || v.includes("分け目") || v.includes("地肌") || v.includes("生え際") || v.includes("抜けすぎ"))
    return {
      category: "薄毛・抜け毛の相談", group: "頭皮",
      summary: "薄毛・抜け毛・分け目や地肌の見え方についてのご相談として記録しました。",
      guidance: "抜け毛は、季節の変わり目・体調・洗髪頻度・髪の長さなどで多く感じることがあります。特に髪が長い方は、排水口で絡まって同じ本数でも多く見えやすいです。数だけで不安になりすぎず、いつから増えたか、毎回続くか、地肌が目立つか、かゆみや炎症があるかを分けて見ると整理しやすくなります。急激な変化・部分的な抜け・症状が続く場合は、専門家への相談も安心です。",
      nextAction: "頭皮や髪の状態を見ながら、分け目・髪型・スカルプケアの相談ができます。気になる変化が強い場合は、専門家への相談も合わせてご検討ください。",
    };
  if (v.includes("頭皮") || v.includes("かゆ") || v.includes("フケ") || v.includes("赤み") || v.includes("しみる") || v.includes("においが") || v.includes("べたつ"))
    return {
      category: "頭皮の悩み", group: "頭皮",
      summary: "頭皮の状態や違和感に関する相談として記録しました。",
      guidance: "頭皮のかゆみ・フケ・赤みは、皮脂バランスの乱れ・乾燥・刺激・季節変化など複数の原因が考えられます。強い炎症・痛み・長引く湿疹は皮膚科に相談するのが安心です。美容室ではスカルプケアメニューとオージュアでの頭皮環境の整えをご提案できます。",
      nextAction: "以下からご希望の案内先をお選びください。",
    };

  /* ─── デザイン（ケア・商品より先に判定） ─── */
  // 「カラーしていない」「カラーもパーマもしていません」のような否定文脈ではカラー相談に入れない
  const isColorNegation =
    v.includes("カラーしていない") || v.includes("カラーしていません") || v.includes("カラーしてない") ||
    v.includes("カラーもパーマもしていない") || v.includes("カラーもパーマもしていません") || v.includes("カラーもパーマもしてない") ||
    v.includes("カラーなし") ||
    v.includes("カラーをしていない") || v.includes("カラーをしていません") ||
    v.includes("カラーはしていない") || v.includes("カラーはしていません") ||
    v.includes("カラーやパーマをしていない") || v.includes("カラーやパーマをしていません");
  if (!isColorNegation && (v.includes("カラー") || v.includes("染め") || v.includes("ハイライト") || v.includes("バレイヤージュ") || v.includes("インナーカラー") || v.includes("グラデーション") || v.includes("ブリーチ") || v.includes("アッシュ") || v.includes("ベージュ") || v.includes("明るく") || v.includes("暗く") || v.includes("色味") || v.includes("透明感") || v.includes("韓国") || v.includes("外国人風") || v.includes("ヘアカラー") || v.includes("色落ち") || v.includes("暖色") || v.includes("寒色") || v.includes("ピンク") || v.includes("ラベンダー") || v.includes("ブルー") || v.includes("グリーン") || v.includes("オレンジ") || v.includes("ヴァイオレット")))
    return {
      category: "カラー相談", group: "デザイン",
      summary: "ヘアカラーに関する相談として記録しました。",
      guidance: "カラーの仕上がりはもとの髪の明るさ・色・ダメージ状態によって変わります。理想のイメージを写真や言葉でお聞かせいただき、実際の髪の状態と照らし合わせてご提案します。",
      nextAction: "この内容は、来店時のメモや予約時の備考にも使えます。直接相談したい場合は、予約ページやお電話もご利用ください。",
    };
  /* ─── ホームケア優先（「ショート」等があっても主題がケアなら商品相談へ） ─── */
  const isHomeCareOverride =
    v.includes("トリートメントが面倒") || v.includes("コンディショナーが面倒") ||
    v.includes("オイルだけ") || v.includes("シャンプー後にオイル") ||
    v.includes("時間を置く") || v.includes("流すのが面倒") ||
    v.includes("顔がぬるぬる") || v.includes("市販トリートメント") ||
    v.includes("市販コンディショナー") || v.includes("美容室で買ったトリートメント");
  if (!isHomeCareOverride && (v.includes("カット") || v.includes("似合う") || v.includes("似合わせ") || v.includes("顔型") || v.includes("ショート") || v.includes("ボブ") || v.includes("前髪") || v.includes("ストレート") || v.includes("長さ") || v.includes("ヘアスタイル") || v.includes("髪型") || v.includes("なりたい") || v.includes("にしたい") || v.includes("スタイル")))
    return {
      category: "カット・似合わせ相談", group: "デザイン",
      summary: "カットやヘアスタイルの似合わせに関する相談として記録しました。",
      guidance: "「似合う長さ」は存在しませんが、「似合うバランス」は存在します。顔型診断だけで断定せず、顔まわりの余白・肌面積・シルエット・重心・眉・目元・メイク・服装・なりたいイメージとのバランスで考えます。",
      nextAction: "この内容は、来店時のメモや予約時の備考にも使えます。直接相談したい場合は、予約ページやお電話もご利用ください。",
    };
  /* ─── カット後のゾーン問題（カット・前髪ブロックの後に配置） ─── */
  const isPostCutZone =
    v.includes("切ってから") || v.includes("カットしてから") || v.includes("切ったら") || v.includes("カットしたら") ||
    v.includes("短くしてから") || v.includes("短くしたら") ||
    v.includes("耳の後ろ") || v.includes("耳後ろ") ||
    v.includes("もみあげが浮") || v.includes("顔まわりがはね") ||
    v.includes("片側だけはね") || v.includes("襟足が浮") ||
    v.includes("内側だけ広がる") || v.includes("表面だけ広がる");
  if (isPostCutZone)
    return {
      category: "カット後の扱い相談", group: "デザイン",
      summary: "カット後の変化やゾーンの扱いに関する相談として記録しました。",
      guidance: "カット後に跳ねや浮きが気になる場合、どの場所で気になるかを確認すると整理しやすくなります。耳後ろ・もみあげ・顔まわり・襟足など場所ごとに原因や対処が変わります。乾かし方・乾き残り・根元からの濡らし方が影響することが多いです。",
      nextAction: "この内容は、来店時のメモや予約時の備考にも使えます。直接相談したい場合は、予約ページやお電話もご利用ください。",
    };

  /* ─── ケア・デザイン ─── */
  if (v.includes("白髪") || v.includes("グレイ") || v.includes("ぼかし"))
    return {
      category: "白髪・白髪ぼかし相談", group: "ケア・デザイン",
      summary: "白髪や白髪ぼかしに関する相談として記録しました。",
      guidance: "白髪ぼかしは白髪を消す技術ではなく、見え方を設計する技術です。白髪の量・場所・髪の長さ・既染部の明るさ・褪色後の見え方によって向き不向きが変わります。ボブ以上の長さでのハイライト白髪ぼかしは白髪へのブリーチでパサつきが出やすいため慎重に扱います。",
      nextAction: "この内容は、来店時のメモや予約時の備考にも使えます。直接相談したい場合は、予約ページやお電話もご利用ください。",
    };
  if (v.includes("うねり") || v.includes("くせ毛") || v.includes("縮毛") || v.includes("パーマ") || v.includes("うねる"))
    return {
      category: "ストレート・うねり相談", group: "ケア・デザイン",
      summary: "うねり・くせ毛・ストレートに関する相談として記録しました。",
      guidance: "うねり・くせ毛には縮毛矯正・パーマ・ヘアケアなど複数のアプローチがあります。適切な方法は髪質・ダメージ状態・望む仕上がり・生活スタイルによって変わります。まず髪の状態を確認したうえでご提案します。",
      nextAction: "この内容は、来店時のメモや予約時の備考にも使えます。直接相談したい場合は、予約ページやお電話もご利用ください。",
    };

  /* ─── ケア ─── */
  if (v.includes("シャンプー") || v.includes("トリートメント") || v.includes("コンディショナー") || v.includes("ミルボン") || v.includes("オージュア") || v.includes("オイル") || v.includes("商品") || v.includes("アウトバス") || v.includes("ホームケア") || v.includes("市販") || v.includes("ぬるぬる") || v.includes("ぬるつき") || v.includes("時間を置く") || v.includes("サロン専売") || v.includes("洗い流さない"))
    return {
      category: "商品相談", group: "ケア",
      summary: "ホームケア商品や使い方に関する相談として記録しました。",
      guidance: "シャンプーやトリートメントは成分名だけでなく、使用感・蓄積感・乾きにくさ・重さ・数週間使った変化で選ぶことが大切です。オージュアを基本軸にしつつ、市販品についても一般的な観点でご相談を受けられます。",
      nextAction: "以下からご希望の案内先をお選びください。",
    };
  if (v.includes("ダメージ") || v.includes("傷んだ") || v.includes("傷んで") || v.includes("傷み") || v.includes("痛んだ") || v.includes("枝毛") || v.includes("切れ毛") || v.includes("パサパサ") || v.includes("パサつ") || v.includes("ゴワつ") || v.includes("ゴワゴワ") || v.includes("絡まる") || v.includes("絡まり") || v.includes("引っかかる") || v.includes("手触り") || v.includes("まとまらない") || v.includes("広がり") || v.includes("ツヤ") || v.includes("ハリ") || v.includes("コシ"))
    return {
      category: "ダメージ・手触り相談", group: "ケア",
      summary: "髪のダメージやケアに関する相談として記録しました。",
      guidance: "ダメージはキューティクルから深部へ進行します。ケアは深部から表面へ整える方向です。「補修」は不足分を補い扱いやすく整えること、「予防」は摩擦・熱・洗髪による今後の流出を抑えることです。成分名より使用感と蓄積の変化で判断することをおすすめします。",
      nextAction: "この内容は、来店時のメモや予約時の備考にも使えます。直接相談したい場合は、予約ページやお電話もご利用ください。",
    };

  /* ─── 食事・栄養 ─── */
  if (v.includes("食べ物") || v.includes("食事") || v.includes("栄養") || v.includes("タンパク質") || v.includes("たんぱく質") || v.includes("亜鉛") || v.includes("鉄分") || v.includes("ビオチン") || v.includes("ビタミン") || v.includes("サプリ") || v.includes("ダイエット") || v.includes("食事制限") || v.includes("プロテイン") || v.includes("何を食べ") || v.includes("髪に良い") || v.includes("髪にいい") || v.includes("髪が生える") || v.includes("数珠毛") || v.includes("ちぢれ毛"))
    return {
      category: "食事・栄養相談", group: "食事・栄養",
      summary: "食事・栄養と髪の状態に関する相談として記録しました。",
      guidance: "髪を作る体の土台を崩していないかを整理する方向でご案内します。タンパク質・鉄・亜鉛・ビタミンなどは髪や頭皮の土台に関係しますが、特定の食べ物で髪が生えるとは断定しません。急な抜け毛や体調不良がある場合は、専門機関への相談も選択肢として案内します。",
      nextAction: "この内容は、来店時のメモや予約時の備考にも使えます。気になる変化が続く場合は、専門機関へのご相談もご検討ください。",
    };

  /* ─── その他 ─── */
  if (v.includes("疲れ") || v.includes("リラックス") || v.includes("癒") || v.includes("眠") || v.includes("気分") || v.includes("しんどい") || v.includes("ストレス"))
    return {
      category: "疲れ・気分・リラックス", group: "その他",
      summary: "疲れや気分、リラックスに関する相談として記録しました。",
      guidance: "ヘッドスパや頭皮ケアは、リフレッシュと頭皮の状態を整えることを同時にできるメニューです。Da-isエステシャンプーは、ケアしながら心地よさを大切にしています。",
      nextAction: "以下からご希望の案内先をお選びください。",
    };
  if (v.includes("初めて") || v.includes("はじめて") || v.includes("不安") || v.includes("怖い") || v.includes("美容室"))
    return {
      category: "美容室選びの不安", group: "その他",
      summary: "美容室選びや不安に関する相談として記録しました。",
      guidance: "はじめてのご来店は不安もあると思います。Da-isは一人ひとりの髪の状態と希望を丁寧に聞くことを大切にしています。まずはお気軽にご相談ください。",
      nextAction: "以下からご希望の案内先をお選びください。",
    };
  if (v.includes("予約") || v.includes("メニュー") || v.includes("迷い") || v.includes("迷って") || v.includes("何がいい") || v.includes("どうすれば") || v.includes("どうしたら"))
    return {
      category: "メニュー・予約前の迷い", group: "その他",
      summary: "メニュー選びや予約前の迷いに関する相談として記録しました。",
      guidance: "メニュー選びに迷う場合は、気になることを整理しておくと相談しやすくなります。必要であれば、予約時の備考やお電話でもお伝えいただけます。",
      nextAction: "この内容は、来店時のメモや予約時の備考にも使えます。直接相談したい場合は、予約ページやお電話もご利用ください。",
    };

  /* ─── 未分類フォールバック ─── */
  return {
    category: "髪の悩み", group: "未分類",
    summary: "髪や美容に関する相談として記録しました。",
    guidance: "髪や美容についての相談として受け取りました。気になる状態や変化を整理しておくと、相談しやすくなります。",
    nextAction: "この内容は、来店時のメモや予約時の備考にも使えます。直接相談したい場合は、予約ページやお電話もご利用ください。",
  };
}

function extractUrls(text) {
  const matches = text.match(/https?:\/\/[^\s　、。！？「」（）［］]+/g) || [];
  return matches
    .map((u) => u.replace(/[.,、。！？!?)）\]］>]+$/g, ""))
    .filter((u) => {
      try { new URL(u); return true; } catch { return false; }
    });
}

const SHARE_FORM_BASE = "https://docs.google.com/forms/d/e/1FAIpQLSevLDDVaXd3S0eMHNqL7GTomvm3TY8SwUFQO62WeOgRJd8nJQ/viewform";

function buildShareUrl(result, aiResponse) {
  try {
    const lines = [
      `【相談カテゴリ】${result.category}`,
      `【分類】${result.group}`,
      "",
      result.text ?? "",
      "",
      `送信日時：${new Date().toLocaleString("ja-JP")}`,
    ];
    const consultText = lines.join("\n").slice(0, 3500);

    const urlParts = [];
    if (result.imageCount > 0) urlParts.push(`画像 ${result.imageCount}枚`);
    if (result.attachedUrls?.length > 0) urlParts.push(`URL ${result.attachedUrls.length}件`);
    const attachInfo = urlParts.length > 0 ? urlParts.join("、") + " 添付あり" : "";

    const q = [
      `usp=pp_url`,
      `entry.1825538084=${encodeURIComponent(consultText)}`,
      aiResponse ? `entry.948403332=${encodeURIComponent(aiResponse.slice(0, 3500))}` : "",
      attachInfo ? `entry.1738990388=${encodeURIComponent(attachInfo)}` : "",
    ].filter(Boolean).join("&");

    return `${SHARE_FORM_BASE}?${q}`;
  } catch {
    return SHARE_FORM_URL;
  }
}

function resizeAndEncodeImage(imgObj) {
  return new Promise((resolve) => {
    const { file } = imgObj;
    if (!file) { resolve(null); return; }
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1600;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width >= height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(
        (blob) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name, mimeType: "image/jpeg", data: reader.result.split(",")[1] });
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        0.8
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
    img.src = objectUrl;
  });
}

function Icon({ type }) {
  if (type === "heart") return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="7.5" r="3.4" />
      <path d="M5.2 20.2c.5-4.2 3.2-6.8 6.8-6.8 1.5 0 2.9.45 4 1.25" />
      <path d="M17.35 15.2c.9-.9 2.35-.78 3.05.2.67.94.43 2.23-.45 3.08L17.35 21l-2.6-2.52c-.88-.85-1.12-2.14-.45-3.08.7-.98 2.15-1.1 3.05-.2Z" />
    </svg>
  );
  if (type === "scissors") return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6.4" cy="17.6" r="2.2" />
      <circle cx="16.8" cy="17.6" r="2.2" />
      <path d="M8.1 16.2 18.8 4.4" />
      <path d="M14.9 14.9 5.1 4.4" />
    </svg>
  );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20V9.8" />
      <path d="M12 13.2C9.2 8.2 5.5 7 3.5 7c.2 3.4 2.1 6.3 5.9 7.1" />
      <path d="M12 11.4c2.2-4.3 5.4-5.8 8.3-5.8-.3 3.9-2.6 6.4-6.4 7.1" />
      <path d="M7.5 18.8h9" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13" /><path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function SocialIcon({ type }) {
  if (type === "instagram") return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.2 6.8h.01" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
  if (type === "note") return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="1.8" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
  if (type === "map") return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2C8.7 2 6 4.7 6 8c0 5.2 6 13 6 13s6-7.8 6-13c0-3.3-2.7-6-6-6z" />
      <circle cx="12" cy="8" r="2.4" />
    </svg>
  );
  if (type === "globe") return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3c-3 4-3 14 0 18M12 3c3 4 3 14 0 18" />
      <path d="M3 12h18M4.2 7.5h15.6M4.2 16.5h15.6" />
    </svg>
  );
  if (type === "phone") return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.58.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C9.6 21 3 14.4 3 6.5c0-.55.45-1 1-1H7.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.23 1.01L6.6 10.8z" />
    </svg>
  );
  return null;
}

const SOCIAL_LINKS = [
  { href: "https://www.instagram.com/dais.kochi/",                   label: "Instagram", icon: "instagram" },
  { href: "https://note.com/da_is1119",                             label: "note",      icon: "note"      },
  { href: "https://maps.app.goo.gl/tGN2uWxBTaUXydMx8?g_st=ic",    label: "Google",    icon: "map"       },
  { href: "#homepage",                                               label: "HP",        icon: "globe"     },
  { href: "tel:0888023370",                                         label: "TEL",       icon: "phone"     },
];

const CONSULT_CHIPS = [
  {
    title: "髪や頭皮の悩み",
    detail: "かゆみ・抜け毛・広がり・湿気でまとまらない など",
    helperText: "髪や頭皮で気になることを入力してください。",
    placeholder: "例：かゆみ、抜け毛、広がり、寝癖、湿気でまとまらない など",
  },
  {
    title: "お使いの商品",
    detail: "シャンプー・トリートメント・オイル・成分表 など",
    helperText: "今お使いの商品について気になることを入力してください。",
    placeholder: "例：シャンプー、トリートメント、オイル、成分表、使った後の重さ など",
  },
  {
    title: "スタイル・カラー",
    detail: "参考画像・URL・色味・白髪ぼかし・カラー持ち など",
    helperText: "なりたい髪型や色味、参考画像・URLについて入力してください。",
    placeholder: "例：この画像の髪型にしたい、透明感のある色にしたい、白髪ぼかしを相談したい など",
  },
];

function App() {
  const USER_TYPE_KEY = "dpepper_user_type";
  const [selectedEntry, setSelectedEntry] = useState(() => {
    const saved = localStorage.getItem("dpepper_user_type");
    const validIds = ["first", "regular", "stylist"];
    return validIds.includes(saved) ? saved : null;
  });
  const [input, setInput] = useState("");
  const [consultations, setConsultations] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch { return []; }
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [attachedImages, setAttachedImages] = useState([]);
  const [attachedUrls, setAttachedUrls] = useState([""]);
  const [isContinuing, setIsContinuing] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [loadingWithImages, setLoadingWithImages] = useState(false);
  const [fontSize, setFontSize] = useState(() => localStorage.getItem(FONT_SIZE_KEY) || "medium");
  const [showShareConfirm, setShowShareConfirm] = useState(false);
  const [chipHint, setChipHint] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyDetailId, setHistoryDetailId] = useState(null);
  const [historySelectMode, setHistorySelectMode] = useState(false);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState(new Set());
  const [historyConfirmType, setHistoryConfirmType] = useState(null); // null | "selected" | "unfavorited" | "all-with-favorites"
  const [historyShareConfirm, setHistoryShareConfirm] = useState(false);
  const [historyShareStatus, setHistoryShareStatus] = useState(null); // null | "sending" | "sent" | "error"
  const [historyShareReply, setHistoryShareReply] = useState("返信希望"); // "返信希望" | "返信不要"
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const resultCardRef = useRef(null);
  const aiAreaRef = useRef(null);
  const aiRequestIdRef = useRef(0);
  const lastEncodedImagesRef = useRef([]);
  const lastConsultationIdRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consultations));
  }, [consultations]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    if (input) el.style.height = el.scrollHeight + "px";
  }, [input]);

  useEffect(() => {
    if (lastResult && resultCardRef.current) {
      setTimeout(() => {
        resultCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    }
  }, [lastResult]);

  useEffect(() => {
    if (!aiLoading) return;
    const timer = setTimeout(() => {
      aiAreaRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 150);
    return () => clearTimeout(timer);
  }, [aiLoading]);

  useEffect(() => {
    if (!aiResponse) return;
    const timer = setTimeout(() => {
      aiAreaRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
    return () => clearTimeout(timer);
  }, [aiResponse]);

  useEffect(() => {
    localStorage.setItem(FONT_SIZE_KEY, fontSize);
  }, [fontSize]);

  useEffect(() => {
    if (!chipHint) return;
    const timer = setTimeout(() => {
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      textareaRef.current?.focus();
    }, 120);
    return () => clearTimeout(timer);
  }, [chipHint]);

  const currentEntry = useMemo(
    () => ENTRIES.find((e) => e.id === selectedEntry),
    [selectedEntry]
  );

  function openEntry(id) {
    localStorage.setItem("dpepper_user_type", id);
    setSelectedEntry(id);
    setInput("");
    setLastResult(null);
    setAttachedImages([]);
    setAttachedUrls([""]);
    setIsContinuing(false);
    setAiResponse(null);
    setAiLoading(false);
    setAiError(null);
    setChipHint(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goHome() {
    attachedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setSelectedEntry(null);
    setInput("");
    setLastResult(null);
    setAttachedImages([]);
    setAttachedUrls([""]);
    setIsContinuing(false);
    setAiResponse(null);
    setAiLoading(false);
    setAiError(null);
    setChipHint(null);
  }

  function openEntryFromChip(chip) {
    const saved = localStorage.getItem("dpepper_user_type");
    const validIds = ["first", "regular"];
    const entryId = validIds.includes(saved) ? saved : "first";
    localStorage.setItem("dpepper_user_type", entryId);
    setSelectedEntry(entryId);
    setInput("");
    setLastResult(null);
    setAttachedImages([]);
    setAttachedUrls([""]);
    setIsContinuing(false);
    setAiResponse(null);
    setAiLoading(false);
    setAiError(null);
    setChipHint(chip);
  }

  function addUrlField() {
    setAttachedUrls((prev) => [...prev, ""]);
  }

  function removeUrlField(index) {
    setAttachedUrls((prev) => prev.filter((_, i) => i !== index));
  }

  function updateUrl(index, value) {
    setAttachedUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }

  function handleImageChange(e) {
    const files = Array.from(e.target.files);
    const remaining = 3 - attachedImages.length;
    const toAdd = files.slice(0, remaining);
    const newImages = toAdd.map((file) => ({
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      file,
    }));
    setAttachedImages((prev) => [...prev, ...newImages]);
    e.target.value = "";
  }

  function removeImage(index) {
    setAttachedImages((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !currentEntry || isSubmitting) return;
    setIsSubmitting(true);
    const wasContinuing = isContinuing;
    const isRecruit = currentEntry.id === "stylist";
    const result = isRecruit ? classifyRecruit(text) : classifyConsult(text);
    const fieldUrls = attachedUrls.filter((u) => u.trim() !== "");
    const textUrls = extractUrls(text);
    const savedUrls = [...new Set([...fieldUrls, ...textUrls])];

    // 画像エンコードを状態クリア前にスナップショットして非同期開始
    const imagesToEncode = [...attachedImages];
    const encodedImagesPromise = Promise.all(imagesToEncode.map((img) => resizeAndEncodeImage(img)));

    const newConsultId = Date.now();
    lastConsultationIdRef.current = newConsultId;
    setConsultations((prev) => [
      {
        id: newConsultId,
        entryId: currentEntry.id,
        entryTitle: currentEntry.title,
        text,
        category: result.category,
        group: result.group,
        summary: result.summary,
        guidance: result.guidance,
        nextAction: result.nextAction,
        imageCount: attachedImages.length,
        imageNames: attachedImages.map((img) => img.name),
        attachedUrls: savedUrls,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    attachedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setLastResult({ ...result, imageCount: attachedImages.length, attachedUrls: savedUrls, text });
    setAttachedImages([]);
    setAttachedUrls([""]);
    setIsContinuing(false);
    setShowShareConfirm(false);

    /* Gemini AI 応答 */
    setAiResponse(null);
    setAiError(null);
    if (result.category !== "__complaint__") {
      setAiLoading(true);
      setLoadingWithImages(imagesToEncode.length > 0);
      const requestId = ++aiRequestIdRef.current;
      const encodedImages = (await encodedImagesPromise).filter(Boolean);
      lastEncodedImagesRef.current = encodedImages;
      console.log("[DPEPPER FRONT] uploadedImages.length:", imagesToEncode.length);
      console.log("[DPEPPER FRONT] encodedImages.length:", encodedImages.length);
      console.log("[DPEPPER FRONT] hasImages:", encodedImages.length > 0);
      console.log("[DPEPPER REF] lastEncodedImagesRef.length:", lastEncodedImagesRef.current.length);
      console.log("[DPEPPER FRONT] savedUrls.length:", savedUrls.length);
      console.log("[DPEPPER FRONT] category:", result.category);
      console.log("[DPEPPER FRONT] group:", result.group);
      console.log("[DPEPPER FRONT] text(50):", text.slice(0, 50));
      try {
        const prompt = isRecruit
          ? buildRecruitPrompt({
              text,
              category: result.category,
              summary: result.summary,
              guidance: result.guidance,
              isContinuing: wasContinuing,
            })
          : buildDpepperPrompt({
              text,
              category: result.category,
              group: result.group,
              summary: result.summary,
              guidance: result.guidance,
              entryTitle: currentEntry.title,
              isContinuing: wasContinuing,
              hasImages: encodedImages.length > 0,
            });
        const aiText = await askGemini(prompt, savedUrls, encodedImages, isRecruit ? "recruit" : "customer");
        if (requestId === aiRequestIdRef.current) {
          const fallbackText = wasContinuing
            ? isRecruit
              ? "続きですね。書いていただいた内容をもとに整理します。見学前に気になることがあれば、続けて書いてみてください。"
              : "続きですね。書いていただいた内容をもとに、もう少し整理してみます。気になる点や状態の変化があれば、続けて書いてみてください。"
            : isRecruit
              ? "見学前に確認したいこととして整理します。書いていただいた内容をもとに、見学や面談で確認しておくと安心なポイントをお伝えします。"
              : currentEntry.id === "regular"
                ? "こんにちは。ご相談の内容を拝見しました。気になっている状態や変化を、もう少し詳しく書いていただくと、整理しやすくなります。"
                : "こんにちは、Da-isの髪と頭皮の相談所『Dペッパー』です。ご相談の内容を拝見しました。気になっている状態を、もう少し具体的に書いていただくと、整理しやすくなります。";
          let cleaned = aiText
            .replace(/^\s*#{1,6}\s*/gm, "")
            .trim();
          const hasMarkdown = /^\s*#{1,6}/m.test(cleaned);
          const isComplete = cleaned.endsWith("。") || cleaned.endsWith("！") || cleaned.endsWith("？");
          if (hasMarkdown || !isComplete) {
            console.log("AI response fallback — hasMarkdown:", hasMarkdown, "isComplete:", isComplete);
            cleaned = fallbackText;
          }
          console.log("Final AI response length:", cleaned.length);
          console.log("Final AI response:", cleaned);
          setAiResponse(cleaned);
          setConsultations(prev => prev.map(c => c.id === newConsultId ? { ...c, aiResponse: cleaned } : c));
        }
      } catch (err) {
        if (requestId === aiRequestIdRef.current) {
          console.error("Gemini error:", err);
          if (isRecruit) {
            setAiError(err.message ?? "応答を取得できませんでした。");
          } else if (savedUrls.length > 0 || encodedImages.length > 0) {
            const hasUrl = savedUrls.length > 0;
            const hasImg = encodedImages.length > 0;
            const what = hasUrl && hasImg ? "URLや画像の内容まで" : hasImg ? "画像の内容は十分に" : "URLの内容まで";
            let fallbackType;
            let fallback;
            if (wasContinuing) {
              fallbackType = "continuing";
              fallback = `続きですね。${what}は確認できませんでしたが、書いていただいた内容をもとに整理します。気になる変化があれば、続けて書いてみてください。`;
            } else if (hasImg || result.group === "デザイン" || result.group === "ケア・デザイン") {
              fallbackType = "design/image";
              fallback = `こんにちは、Da-isの髪と頭皮の相談所『Dペッパー』です。${what}は確認できませんでしたが、ヘアスタイルや色味の相談として整理できます。担当美容師には、画像のどこを再現したいか、色味・明るさ・雰囲気・長さ・顔まわりの印象を分けて伝えると相談しやすいです。`;
            } else if (result.group === "ケア") {
              fallbackType = "care";
              fallback = `こんにちは、Da-isの髪と頭皮の相談所『Dペッパー』です。${what}は確認できませんでしたが、シャンプーやトリートメントは成分名だけでなく、使った後の重さ・乾きにくさ・ベタつき・数週間使った変化を見ることが大切です。商品だけで合う合わないを決めず、今の髪や頭皮の状態と合わせて整理できます。`;
            } else {
              fallbackType = "generic";
              fallback = `こんにちは、Da-isの髪と頭皮の相談所『Dペッパー』です。${what}は確認できませんでしたが、相談文をもとに整理します。気になる状態をもう少し具体的に書いていただくと、整理しやすくなります。`;
            }
            console.log("[DPEPPER FALLBACK] type:", fallbackType, "| hasImg:", hasImg, "| group:", result.group);
            setAiResponse(fallback);
          } else {
            setAiError(err.message ?? "応答を取得できませんでした。");
          }
        }
      } finally {
        if (requestId === aiRequestIdRef.current) setAiLoading(false);
      }
    }
    setIsSubmitting(false);
  }

  async function handleRetryAI() {
    if (!lastResult || aiLoading) return;
    const retryImages = lastEncodedImagesRef.current;
    const retryUrls = lastResult.attachedUrls ?? [];
    console.log("[DPEPPER REF] handleRetryAI lastEncodedImagesRef.length:", retryImages.length);
    console.log("[DPEPPER FRONT] hasImages (retry):", retryImages.length > 0);
    setAiError(null);
    setAiLoading(true);
    setLoadingWithImages(retryImages.length > 0);
    const requestId = ++aiRequestIdRef.current;
    const isRecruit = currentEntry?.id === "stylist";
    try {
      const prompt = isRecruit
        ? buildRecruitPrompt({
            text: lastResult.text,
            category: lastResult.category,
            summary: lastResult.summary,
            guidance: lastResult.guidance,
            isContinuing: false,
          })
        : buildDpepperPrompt({
            text: lastResult.text,
            category: lastResult.category,
            group: lastResult.group,
            summary: lastResult.summary,
            guidance: lastResult.guidance,
            entryTitle: currentEntry?.title ?? "",
            isContinuing: false,
            hasImages: retryImages.length > 0,
          });
      const aiText = await askGemini(prompt, retryUrls, retryImages, isRecruit ? "recruit" : "customer");
      if (requestId === aiRequestIdRef.current) {
        let cleaned = aiText.replace(/^\s*#{1,6}\s*/gm, "").trim();
        const hasMarkdown = /^\s*#{1,6}/m.test(cleaned);
        const isComplete = cleaned.endsWith("。") || cleaned.endsWith("！") || cleaned.endsWith("？");
        if (hasMarkdown || !isComplete) {
          cleaned = isRecruit
            ? "見学前に確認したいこととして整理します。書いていただいた内容をもとに、見学や面談で確認しておくと安心なポイントをお伝えします。"
            : "こんにちは、Da-isの髪と頭皮の相談所『Dペッパー』です。ご相談の内容を拝見しました。気になっている状態を、もう少し具体的に書いていただくと、整理しやすくなります。";
        }
        setAiResponse(cleaned);
        setConsultations(prev => prev.map(c => c.id === lastConsultationIdRef.current ? { ...c, aiResponse: cleaned } : c));
      }
    } catch (err) {
      if (requestId === aiRequestIdRef.current) {
        console.error("Gemini retry error:", err);
        setAiError(err.message ?? "応答を取得できませんでした。");
      }
    } finally {
      if (requestId === aiRequestIdRef.current) setAiLoading(false);
    }
  }

  const historyDetailItem = consultations.find(c => c.id === historyDetailId) ?? null;

  function toggleFavorite(id, e) {
    e?.stopPropagation();
    setConsultations(prev => prev.map(c => c.id === id ? { ...c, favorite: !(c.favorite ?? false) } : c));
  }

  function formatDate(iso) {
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      }).format(new Date(iso));
    } catch { return ""; }
  }

  function closeHistoryDetail() {
    setHistoryDetailId(null);
    setHistoryShareConfirm(false);
    setHistoryShareStatus(null);
    setHistoryShareReply("返信希望");
  }

  async function handleHistoryShare(item, replyRequest) {
    const reply = replyRequest === "返信不要" ? "返信不要" : "返信希望";
    setHistoryShareStatus("sending");
    setHistoryShareConfirm(false);
    try {
      const res = await fetch("/api/share-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, replyRequest: reply }),
      });
      if (res.ok) {
        setHistoryShareStatus("sent");
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("[History share] server error:", err);
        setHistoryShareStatus("error");
      }
    } catch (err) {
      console.error("[History share] fetch error:", err);
      setHistoryShareStatus("error");
    }
  }

  return (
    <div className={`画面 fs-${fontSize}`}>
      {/* 背景画像レイヤー：画面::before で表示（dais-consult-bg.png） */}

      {/* 右側装飾レイヤー：円弧・ドット（独立管理） */}
      <div className="右側装飾" aria-hidden="true">
        <div className="背景_円弧"><span /></div>
        <div className="背景_ドット" />
      </div>

      {/* 中身 */}
      <div className="中身">
      {/* ヘッダー */}
      <header className="app-header">
        <div className="brand">
          <span className="brand-main"><ruby>Da-is<rt>デイズ</rt></ruby></span>
          <span className="brand-sub">相談窓口</span>
        </div>
        <div className="header-right">
          <div className="font-size-toggle" aria-label="文字サイズ">
            {[["small", "小"], ["medium", "中"], ["large", "大"]].map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={`font-size-btn${fontSize === val ? " active" : ""}`}
                onClick={() => setFontSize(val)}
                aria-pressed={fontSize === val}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="history-button"
            onClick={() => setHistoryOpen(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5V12l3.2 1.8" />
            </svg>
            <span>履歴</span>
            {consultations.length > 0 && (
              <span className="history-count">{consultations.length}</span>
            )}
          </button>
        </div>
      </header>

      <main className="main-area">
        {/* ホームビュー */}
        {!selectedEntry && (
          <section className="home-view">
            {/* サービス紹介ブロック */}
            <div className="intro-block">
              <span className="intro-badge"><ruby>Da-is<rt>デイズ</rt></ruby>公式</span>
              <h1 className="intro-heading">
                髪と頭皮のWEB相談所<br />
                <span className="intro-heading-name">Dペッパー</span>
              </h1>
              <p className="intro-desc">
                髪や頭皮の悩み、ヘアスタイルやカラー、今お使いの商品について、来店前に少し整理できる相談所です。
                相談内容は、来店時にスタッフへそのまま見せていただけます。
              </p>
              <p className="intro-note">Dペッパーは、<ruby>Da-is<rt>デイズ</rt></ruby>がお客様と一緒に育んでいくWEB相談所です。</p>
              <p className="intro-ai-note">AIの力も借りながら、<ruby>Da-is<rt>デイズ</rt></ruby>の現場で大切にしている考え方をもとに相談内容を整理します。</p>
            </div>

            {/* 相談例チップ */}
            <div className="consult-examples">
              <p className="consult-examples-label">こんな相談ができます</p>
              <div className="consult-chips">
                {CONSULT_CHIPS.map((chip) => (
                  <button
                    key={chip.title}
                    type="button"
                    className="consult-chip"
                    onClick={() => openEntryFromChip(chip)}
                    aria-label={`${chip.title}について相談する`}
                  >
                    <p className="consult-chip-title">{chip.title}</p>
                    <p className="consult-chip-detail">{chip.detail}</p>
                    <span className="consult-chip-arrow">›</span>
                  </button>
                ))}
              </div>
              <p className="consult-caution">返答は来店前に悩みを整理するための参考です。髪や頭皮の状態は、来店時にスタッフが直接確認します。</p>
            </div>

            <div className="deco-line">
              <span className="deco-diamond" />
            </div>
            <div className="entry-list">
              {ENTRIES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`entry-card ${entry.id}`}
                  onClick={() => openEntry(entry.id)}
                >
                  <span className="entry-icon"><Icon type={entry.icon} /></span>
                  <span className="entry-text">
                    <span className="entry-title">{entry.title}</span>
                    <span className="entry-subtitle">{withDaIs(entry.subtitle)}</span>
                  </span>
                  <span className="entry-arrow"><ArrowIcon /></span>
                </button>
              ))}
            </div>

            {/* 外部導線 */}
            <div className="social-section">
              <p className="social-label"><ruby>Da-is<rt>デイズ</rt></ruby>をもっと見る</p>
              <div className="social-list">
                {SOCIAL_LINKS.map(({ href, label, icon }) => (
                  <a
                    key={icon}
                    href={href}
                    className="social-link"
                    target={href.startsWith("tel:") ? "_self" : "_blank"}
                    rel={href.startsWith("tel:") ? undefined : "noopener noreferrer"}
                    aria-label={label}
                  >
                    <span className="social-link-icon">
                      <SocialIcon type={icon} />
                    </span>
                    <span className="social-link-label">{label}</span>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 相談ビュー */}
        {selectedEntry && currentEntry && (
          <section className="consult-view">
            <div className="consult-nav">
              <button type="button" className="back-button" onClick={goHome}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19 12H5" /><path d="m11 6-6 6 6 6" />
                </svg>
                <span>戻る</span>
              </button>
              <button
                type="button"
                className="change-entry-btn"
                onClick={() => {
                  localStorage.removeItem(USER_TYPE_KEY);
                  goHome();
                }}
              >
                相談入口を変更する
              </button>
            </div>
            <div className="consult-card">
              <div className="consult-badge">— {currentEntry.badge}</div>
              <h2>{currentEntry.label}</h2>
              <p className="consult-sub">{currentEntry.sub}</p>
              <form onSubmit={handleSubmit}>
                <p className="textarea-helper">
                  {isContinuing
                    ? "続きを書いてください。うまくまとまっていなくても大丈夫です。"
                    : chipHint
                      ? chipHint.helperText
                      : currentEntry.id === "stylist"
                        ? "Da-isに興味を持ってくださった美容師さん・見学希望の方向けの相談入口です。お店の雰囲気、働き方、技術や教育のこと、見学前に聞いておきたいことなどを自由に入力してください。"
                        : currentEntry.id === "regular"
                          ? "いつものこと、前回からの変化、気になっていること。何でも書いてください。"
                          : "気になっていることをそのまま書いてください。うまくまとまっていなくても大丈夫です。"}
                </p>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isContinuing
                    ? "続きを書いてください。\n例：もう少し詳しくいうと、前髪の扱いに迷っています。"
                    : chipHint
                      ? chipHint.placeholder
                      : currentEntry.id === "regular"
                        ? "例：前回のカラーから気になっていることがあります"
                        : currentEntry.id === "first"
                          ? "例：髪のダメージが気になっています"
                          : "例：デイズの働き方について知りたいです"
                  }
                  rows={8}
                />

                <p className="send-note">この相談内容や写真は、現在、店舗スタッフへ自動送信されません。</p>
                <button type="submit" className="submit-button" disabled={isSubmitting}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4 20-7Z" />
                  </svg>
                  <span>{isSubmitting ? "整理しています…" : "相談・記録する"}</span>
                </button>

                {/* 参考画像・URLセクション（リクルート入口では非表示） */}
                {currentEntry.id !== "stylist" && <div className="ref-section">
                  <div className="ref-section-header">参考画像・URL<span className="ref-section-opt">（任意）</span></div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="image-input-hidden"
                    onChange={handleImageChange}
                  />
                  {attachedImages.length > 0 && (
                    <div className="image-preview-list">
                      {attachedImages.map((img, i) => (
                        <div key={i} className="image-preview-item">
                          <img src={img.previewUrl} alt={img.name} />
                          <button
                            type="button"
                            className="image-remove-btn"
                            onClick={() => removeImage(i)}
                            aria-label="画像を削除"
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {attachedImages.length < 3 && (
                    <button
                      type="button"
                      className="image-attach-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="3" y="5" width="18" height="14" rx="2.2" />
                        <circle cx="8.5" cy="10" r="1.5" />
                        <path d="m3 17 5-5 3.5 3.5 3-3 5 5" />
                      </svg>
                      <span>画像を貼り付ける{attachedImages.length > 0 ? `（${attachedImages.length}/3）` : "（任意・最大3枚）"}</span>
                    </button>
                  )}
                  <div className="url-input-area">
                    {attachedUrls.map((url, i) => (
                      <div key={i} className="url-input-row">
                        <input
                          type="url"
                          value={url}
                          onChange={(e) => updateUrl(i, e.target.value)}
                          placeholder="https://..."
                          className="url-input"
                        />
                        {attachedUrls.length > 1 && (
                          <button
                            type="button"
                            className="url-remove-btn"
                            onClick={() => removeUrlField(i)}
                            aria-label="URLを削除"
                          >×</button>
                        )}
                      </div>
                    ))}
                    {attachedUrls.length < 3 && (
                      <button
                        type="button"
                        className="url-add-btn"
                        onClick={addUrlField}
                      >+ URLを追加</button>
                    )}
                  </div>
                  <p className="ref-section-note">
                    画像やURLは、Dペッパーが相談内容を整理するための参考として扱います。<br />
                    画像は見える範囲で確認しますが、写真だけで正確な判断をするものではありません。<br />
                    相談文の中にURLを書いた場合も、参考URLとして扱います。<br />
                    店舗スタッフへ自動送信されるものではありません。<br />
                    来店時に見せたい画像やURLは、スマホにも保存しておいてください。
                  </p>
                </div>}

              </form>
              {lastResult && (
                <div className="result-card" ref={resultCardRef}>
                  {lastResult.category === "__complaint__" ? (
                    /* 不満・クレーム検知時：カテゴリ名を表示しない中立表示 */
                    <>
                      {lastResult.imageCount > 0 && (
                        <span className="result-image-badge">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="3" y="5" width="18" height="14" rx="2.2" />
                            <circle cx="8.5" cy="10" r="1.5" />
                            <path d="m3 17 5-5 3.5 3.5 3-3 5 5" />
                          </svg>
                          画像 {lastResult.imageCount}枚 添付済み
                        </span>
                      )}
                      {lastResult.attachedUrls?.length > 0 && (
                        <span className="result-image-badge">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                          URL {lastResult.attachedUrls.length}件 添付済み
                        </span>
                      )}
                      <h3 className="result-neutral-heading">内容を確認しました</h3>
                      <p className="result-complaint-note">
                        この内容については、アプリ内では判断・回答できません。<br />
                        必要な場合は、お電話にて店舗へご連絡ください。
                      </p>
                      <div className="exit-buttons">
                        <div className="exit-btn-list">
                          <a href="tel:0888023370" target="_self" className="exit-btn">
                            店舗に電話する
                          </a>
                          <p className="phone-hours-note">店舗電話受付：10:00〜17:00</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* 通常表示 */
                    <>
                      <span className="result-label">相談カテゴリ</span>
                      <h3>{lastResult.category}</h3>
                      {lastResult.group && (
                        <span className="result-label">分類：{lastResult.group}</span>
                      )}
                      {lastResult.imageCount > 0 && (
                        <span className="result-image-badge">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="3" y="5" width="18" height="14" rx="2.2" />
                            <circle cx="8.5" cy="10" r="1.5" />
                            <path d="m3 17 5-5 3.5 3.5 3-3 5 5" />
                          </svg>
                          画像 {lastResult.imageCount}枚 添付済み
                        </span>
                      )}
                      {lastResult.attachedUrls?.length > 0 && (
                        <span className="result-image-badge">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                          URL {lastResult.attachedUrls.length}件 添付済み
                        </span>
                      )}
                      <p>{lastResult.summary}</p>
                      <div ref={aiAreaRef}>
                        {aiLoading && (
                          <div className="ai-loading">
                            <p>{loadingWithImages ? "画像を確認しながら相談内容を整理しています" : "相談内容を整理しています"}</p>
                            <p className="ai-loading-sub">{loadingWithImages ? "画像やURLがある場合は、少し時間がかかることがあります。" : "少し時間がかかることがあります。"}画面を閉じずにお待ちください。</p>
                          </div>
                        )}
                        {!aiLoading && aiResponse && (
                          <div className="ai-response">
                            <span className="result-label">Dペッパーより</span>
                            <p>{aiResponse}</p>
                          </div>
                        )}
                        {!aiLoading && !aiResponse && aiError && (
                          <div className="ai-error">
                            <p>相談内容の整理中にうまく接続できませんでした。</p>
                            <p>少し時間を置いてから、もう一度お試しください。相談内容を共有していただくと、<ruby>Da-is<rt>デイズ</rt></ruby>のお店側でも確認できます。</p>
                            <div className="ai-error-actions">
                              <button
                                type="button"
                                className="retry-ai-btn"
                                onClick={handleRetryAI}
                                disabled={aiLoading}
                              >
                                もう一度試す
                              </button>
                              <button
                                type="button"
                                className="retry-share-btn"
                                onClick={() => setShowShareConfirm(true)}
                              >
                                <ruby>Da-is<rt>デイズ</rt></ruby>に相談内容を共有する
                              </button>
                            </div>
                          </div>
                        )}
                        {!aiLoading && !aiResponse && !aiError && lastResult.guidance && (
                          <div className="next-action">
                            <span>考え方</span>
                            <p>{lastResult.guidance}</p>
                          </div>
                        )}
                      </div>
                      <div className="next-action" style={{ marginTop: "10px" }}>
                        <span>次の案内</span>
                        <p>{withDaIs(lastResult.nextAction)}</p>
                      </div>
                      {(() => {
                        const btns = currentEntry?.id === "stylist"
                          ? EXIT_BUTTONS["美容師・見学希望"]
                          : (EXIT_BUTTONS[lastResult.category] ?? EXIT_BUTTONS["髪の悩み"]);
                        const moreBtns    = btns.filter(b => b.action === "more");
                        const historyBtns = btns.filter(b => b.action === "history");
                        const urlBtns     = btns.filter(b => b.url);
                        return (
                          <div className="exit-buttons">
                            <span className="exit-buttons-label">ご案内</span>
                            <div className="exit-btn-list">
                              {moreBtns.map((btn, i) => (
                                <button
                                  key={`more-${i}`}
                                  type="button"
                                  className="exit-btn exit-btn--primary"
                                  onClick={() => {
                                    setInput("");
                                    setIsContinuing(true);
                                    const el = textareaRef.current;
                                    if (!el) return;
                                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                                    el.focus();
                                  }}
                                >
                                  {btn.label}
                                </button>
                              ))}
                              {historyBtns.map((btn, i) => (
                                <button
                                  key={`hist-${i}`}
                                  type="button"
                                  className="exit-btn exit-btn--history"
                                  onClick={() => setHistoryOpen(true)}
                                >
                                  {btn.label}
                                </button>
                              ))}
                              {urlBtns.length > 0 && (
                                <div className="exit-btn-url-row">
                                  {urlBtns.map((btn, i) => (
                                    <a
                                      key={`url-${i}`}
                                      href={btn.url}
                                      target={btn.url.startsWith("tel:") ? "_self" : "_blank"}
                                      rel={btn.url.startsWith("tel:") ? undefined : "noopener noreferrer"}
                                      className="exit-btn"
                                    >
                                      {withDaIs(btn.label)}
                                    </a>
                                  ))}
                                </div>
                              )}
                              {urlBtns.some(b => b.url.startsWith("tel:")) && (
                                <p className="phone-hours-note">店舗電話受付：10:00〜17:00</p>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                      <div className="share-section">
                        {!showShareConfirm ? (
                          <button
                            type="button"
                            className="share-btn"
                            onClick={() => setShowShareConfirm(true)}
                          >
                            <ruby>Da-is<rt>デイズ</rt></ruby>に相談内容を共有する
                          </button>
                        ) : (
                          <div className="share-confirm">
                            <p className="share-confirm-text">
                              この相談内容を<ruby>Da-is<rt>デイズ</rt></ruby>に共有しますか？<br />
                              共有すると、相談内容が<ruby>Da-is<rt>デイズ</rt></ruby>のお店用メールに送信されます。<br />
                              返信を希望する場合は、共有フォーム内で返信先を入力してください。<br />
                              お急ぎの場合は、店舗へお電話ください（受付10:00〜17:00）。
                            </p>
                            <p className="share-confirm-hint">
                              フォームには、この相談内容の一部が自動入力されます。<br />
                              内容を確認し、必要に応じて追記して送信してください。
                            </p>
                            <div className="share-confirm-btns">
                              <button
                                type="button"
                                className="share-confirm-go"
                                onClick={() => {
                                  const url = buildShareUrl(lastResult, aiResponse);
                                  window.open(url, "_blank", "noopener,noreferrer");
                                  setShowShareConfirm(false);
                                }}
                              >
                                共有フォームを開く
                              </button>
                              <button
                                type="button"
                                className="share-confirm-cancel"
                                onClick={() => setShowShareConfirm(false)}
                              >
                                キャンセル
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="feedback-section">
                        <p className="feedback-note">
                          不具合や使いにくい点があれば教えてください。<br />
                          いただいた内容は、Dペッパー改善の参考にします。<br />
                          お急ぎの相談や予約については、予約ページまたはお電話をご利用ください。
                        </p>
                        <a
                          href={FEEDBACK_FORM_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="feedback-btn"
                        >
                          不具合・感想を送る
                        </a>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
      </div>{/* /中身 */}

      {/* 履歴パネル */}
      <div
        className={`overlay${historyOpen ? " is-open" : ""}`}
        onClick={() => { setHistoryOpen(false); setHistorySelectMode(false); setSelectedHistoryIds(new Set()); }}
      />
      <aside className={`history-panel${historyOpen ? " is-open" : ""}`}>
        <div className="history-panel-header">
          <div className="history-panel-header-top">
            <h2>履歴</h2>
            <button type="button" className="history-close-btn" onClick={() => { setHistoryOpen(false); setHistorySelectMode(false); setSelectedHistoryIds(new Set()); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12" /><path d="M18 6 6 18" />
              </svg>
            </button>
          </div>
          {consultations.length > 0 && (
            <div className="history-panel-toolbar">
              {historySelectMode ? (
                <>
                  <button type="button" className="history-action-btn" onClick={() => { setHistorySelectMode(false); setSelectedHistoryIds(new Set()); }}>
                    キャンセル
                  </button>
                  {selectedHistoryIds.size > 0 && (
                    <button type="button" className="history-action-btn history-action-btn--danger" onClick={() => setHistoryConfirmType("selected")}>
                      {selectedHistoryIds.size}件を削除
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button type="button" className="history-action-btn" onClick={() => { setHistorySelectMode(true); setSelectedHistoryIds(new Set()); }}>
                    選択
                  </button>
                  <button type="button" className="history-action-btn history-action-btn--danger" onClick={() => setHistoryConfirmType("unfavorited")}>
                    ⭐️以外を削除
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {consultations.length === 0 ? (
          <div className="history-empty">
            <p>まだ相談の記録はありません。</p>
            <span>相談すると、ここに静かに残ります。</span>
          </div>
        ) : (
          <div className="history-list">
            {consultations.map((item) => {
              const isSelected = selectedHistoryIds.has(item.id);
              const isFav = item.favorite ?? false;
              return (
                <article
                  className={`history-item${historySelectMode ? " history-item--selectable" : " history-item--clickable"}${isSelected ? " history-item--selected" : ""}${isFav ? " history-item--favorite" : ""}`}
                  key={item.id}
                  onClick={() => {
                    if (historySelectMode) {
                      setSelectedHistoryIds(prev => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      });
                    } else {
                      setHistoryDetailId(item.id);
                    }
                  }}
                >
                  {historySelectMode ? (
                    <div className={`history-checkbox${isSelected ? " history-checkbox--checked" : ""}`} aria-hidden="true">
                      {isSelected && <svg viewBox="0 0 24 24"><path d="M5 12l5 5L19 7" /></svg>}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`history-star-btn${isFav ? " history-star-btn--on" : ""}`}
                      aria-label={isFav ? "お気に入り解除" : "お気に入りに追加"}
                      onClick={e => toggleFavorite(item.id, e)}
                    >
                      {isFav ? (
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                      )}
                    </button>
                  )}
                  <div className="history-meta">
                    <span>{item.entryTitle}</span>
                    <time>{formatDate(item.createdAt)}</time>
                  </div>
                  <h3>{item.category === "__complaint__" ? "内容を確認しました" : item.category}</h3>
                  {item.imageCount > 0 && (
                    <span className="history-image-badge">画像 {item.imageCount}枚</span>
                  )}
                  {item.attachedUrls?.length > 0 && (
                    <span className="history-image-badge">URL {item.attachedUrls.length}件</span>
                  )}
                  <p>{item.text}</p>
                </article>
              );
            })}
          </div>
        )}
      </aside>

      {/* 履歴詳細モーダル */}
      {historyDetailItem && (
        <div className="history-detail-overlay" onClick={closeHistoryDetail}>
          <div className="history-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="history-detail-header">
              <h3>相談の詳細</h3>
              <div className="history-detail-header-actions">
                <button
                  type="button"
                  className={`history-star-btn history-star-btn--modal${(historyDetailItem.favorite ?? false) ? " history-star-btn--on" : ""}`}
                  aria-label={(historyDetailItem.favorite ?? false) ? "お気に入り解除" : "お気に入りに追加"}
                  onClick={e => toggleFavorite(historyDetailItem.id, e)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                </button>
                <button type="button" onClick={closeHistoryDetail} aria-label="閉じる">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12" /><path d="M18 6 6 18" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="history-detail-body">
              <div className="history-detail-row">
                <span className="history-detail-label">日時</span>
                <span className="history-detail-value">{formatDate(historyDetailItem.createdAt)}</span>
              </div>
              <div className="history-detail-row">
                <span className="history-detail-label">カテゴリ</span>
                <span className="history-detail-value">{historyDetailItem.category === "__complaint__" ? "内容を確認しました" : historyDetailItem.category}</span>
              </div>
              <div className="history-detail-row">
                <span className="history-detail-label">分類</span>
                <span className="history-detail-value">{historyDetailItem.group}</span>
              </div>
              <div className="history-detail-section">
                <span className="history-detail-label">ご相談</span>
                <p className="history-detail-text">{historyDetailItem.text}</p>
              </div>
              {historyDetailItem.aiResponse ? (
                <div className="history-detail-section">
                  <span className="history-detail-label">Dペッパーの返答</span>
                  <p className="history-detail-text">{historyDetailItem.aiResponse}</p>
                </div>
              ) : (
                <div className="history-detail-section">
                  <span className="history-detail-label history-detail-label--dim">Dペッパーの返答（この相談は保存対象外です）</span>
                </div>
              )}
              {historyDetailItem.nextAction && historyDetailItem.category !== "__complaint__" && (
                <div className="history-detail-section">
                  <span className="history-detail-label">次の案内</span>
                  <p className="history-detail-text history-detail-text--small">{historyDetailItem.nextAction}</p>
                </div>
              )}
            </div>

            {/* 履歴共有フッター */}
            <div className="history-detail-footer">
              {historyShareStatus === "sent" ? (
                <div className="history-detail-share-status history-detail-share-status--sent">
                  <p>相談内容をDa-isに共有しました。</p>
                  <button
                    type="button"
                    className="history-detail-share-again"
                    onClick={() => { setHistoryShareStatus(null); setHistoryShareConfirm(false); }}
                  >
                    もう一度送る
                  </button>
                </div>
              ) : historyShareStatus === "error" ? (
                <div className="history-detail-share-status history-detail-share-status--error">
                  <p>共有に失敗しました。少し時間を置いてからもう一度お試しください。</p>
                  <button
                    type="button"
                    className="history-detail-share-again"
                    onClick={() => { setHistoryShareStatus(null); setHistoryShareConfirm(false); }}
                  >
                    もう一度試す
                  </button>
                </div>
              ) : historyShareConfirm ? (
                <div className="history-detail-share-confirm">
                  <p className="history-detail-share-confirm-text">
                    この相談内容を<ruby>Da-is<rt>デイズ</rt></ruby>に共有します。<br />
                    お店用メールに内容が届きます。
                  </p>
                  <div className="history-detail-reply-toggle">
                    <span className="history-detail-reply-label">返信の希望</span>
                    <div className="history-detail-reply-btns">
                      <button
                        type="button"
                        className={`history-detail-reply-btn${historyShareReply === "返信希望" ? " history-detail-reply-btn--active" : ""}`}
                        onClick={() => setHistoryShareReply("返信希望")}
                      >
                        返信希望
                      </button>
                      <button
                        type="button"
                        className={`history-detail-reply-btn${historyShareReply === "返信不要" ? " history-detail-reply-btn--active" : ""}`}
                        onClick={() => setHistoryShareReply("返信不要")}
                      >
                        返信不要
                      </button>
                    </div>
                  </div>
                  <div className="history-detail-share-confirm-btns">
                    <button
                      type="button"
                      className="history-detail-share-cancel"
                      onClick={() => setHistoryShareConfirm(false)}
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      className="history-detail-share-go"
                      onClick={() => handleHistoryShare(historyDetailItem, historyShareReply)}
                    >
                      共有する
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="history-detail-share-btn"
                  disabled={historyShareStatus === "sending"}
                  onClick={() => { setHistoryShareConfirm(true); setHistoryShareStatus(null); }}
                >
                  {historyShareStatus === "sending" ? "共有しています…" : "この相談をDa-isに送る"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 削除確認ダイアログ */}
      {historyConfirmType && (
        <div className="history-confirm-overlay" onClick={() => setHistoryConfirmType(null)}>
          <div className="history-confirm-dialog" onClick={e => e.stopPropagation()}>
            <p>
              {historyConfirmType === "unfavorited"
                ? "⭐️を付けていない相談履歴をすべて削除します。⭐️付きの履歴は残ります。この操作は元に戻せません。"
                : historyConfirmType === "all-with-favorites"
                  ? "⭐️付きの履歴も含めて、すべての相談履歴を削除しますか？この操作は元に戻せません。"
                  : (() => {
                      const hasFav = [...selectedHistoryIds].some(id => consultations.find(c => c.id === id)?.favorite);
                      return hasFav
                        ? `⭐️付きの履歴が含まれています。選択した${selectedHistoryIds.size}件の相談履歴を削除しますか？この操作は元に戻せません。`
                        : `選択した${selectedHistoryIds.size}件の相談履歴を削除しますか？この操作は元に戻せません。`;
                    })()
              }
            </p>
            <div className="history-confirm-buttons">
              <button type="button" className="history-confirm-btn" onClick={() => setHistoryConfirmType(null)}>
                キャンセル
              </button>
              <button
                type="button"
                className="history-confirm-btn history-confirm-btn--danger"
                onClick={() => {
                  if (historyConfirmType === "unfavorited") {
                    setConsultations(prev => prev.filter(c => c.favorite ?? false));
                  } else if (historyConfirmType === "all-with-favorites") {
                    setConsultations([]);
                  } else {
                    setConsultations(prev => prev.filter(c => !selectedHistoryIds.has(c.id)));
                    setSelectedHistoryIds(new Set());
                    setHistorySelectMode(false);
                  }
                  setHistoryConfirmType(null);
                }}
              >
                削除する
              </button>
            </div>
            {historyConfirmType === "unfavorited" && (
              <div className="history-confirm-extra">
                <button
                  type="button"
                  className="history-confirm-extra-btn"
                  onClick={() => setHistoryConfirmType("all-with-favorites")}
                >
                  ⭐️付きも含めてすべて削除する
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
