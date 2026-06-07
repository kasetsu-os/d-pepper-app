import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { buildDpepperPrompt } from "./lib/dpepperPrompt";
import { askGemini } from "./lib/geminiClient";

const STORAGE_KEY = "d-pepper-consultations";
const FONT_SIZE_KEY = "d-pepper-font-size";
const FEEDBACK_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSdxr97reDcABJk6Xfom8MUAYUV09GGhd_i1X7yke3B7SogWoA/viewform?usp=publish-editor";

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
    { label: "Da-isの予約ページを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/" },
    { label: "電話で相談する",               url: "tel:0888023370" },
  ],
  "頭皮の悩み": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約ページを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/" },
    { label: "電話で相談する",               url: "tel:0888023370" },
  ],
  "ダメージ・手触り相談": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約ページを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/" },
    { label: "電話で相談する",               url: "tel:0888023370" },
  ],
  "疲れ・気分・リラックス": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約ページを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/" },
    { label: "noteを見る",                   url: "https://note.com/da_is1119" },
  ],
  "美容室選びの不安": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約ページを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/" },
    { label: "電話で相談する",               url: "tel:0888023370" },
  ],
  "メニュー・予約前の迷い": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約ページを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/" },
    { label: "電話で相談する",               url: "tel:0888023370" },
  ],
  "商品相談": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約ページを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/" },
    { label: "電話で相談する",               url: "tel:0888023370" },
  ],
  "美容師・見学希望": [
    { label: "Instagramを見る",              url: "https://www.instagram.com/dais.kochi/" },
    { label: "noteを見る",                   url: "https://note.com/da_is1119" },
    { label: "電話で問い合わせる",           url: "tel:0888023370" },
  ],
  "円形脱毛症の相談": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約ページを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/" },
    { label: "電話で相談する",               url: "tel:0888023370" },
  ],
  "薄毛・抜け毛の相談": [
    { label: "もう少し相談する",              action: "more" },
    { label: "来店時に伝えるメモを見る",      action: "history" },
    { label: "Da-isの予約ページを開く",         url: "https://beauty.hotpepper.jp/slnH000166332/" },
    { label: "電話で相談する",               url: "tel:0888023370" },
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

  /* ─── ケア ─── */
  if (v.includes("シャンプー") || v.includes("トリートメント") || v.includes("ミルボン") || v.includes("オージュア") || v.includes("オイル") || v.includes("商品") || v.includes("アウトバス") || v.includes("ホームケア") || v.includes("市販"))
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

  /* ─── デザイン ─── */
  if (v.includes("カラー") || v.includes("染め") || v.includes("ハイライト") || v.includes("バレイヤージュ") || v.includes("インナーカラー") || v.includes("グラデーション") || v.includes("ブリーチ") || v.includes("アッシュ") || v.includes("ベージュ") || v.includes("明るく") || v.includes("暗く"))
    return {
      category: "カラー相談", group: "デザイン",
      summary: "ヘアカラーに関する相談として記録しました。",
      guidance: "カラーの仕上がりはもとの髪の明るさ・色・ダメージ状態によって変わります。理想のイメージを写真や言葉でお聞かせいただき、実際の髪の状態と照らし合わせてご提案します。",
      nextAction: "この内容は、来店時のメモや予約時の備考にも使えます。直接相談したい場合は、予約ページやお電話もご利用ください。",
    };
  if (v.includes("カット") || v.includes("似合う") || v.includes("似合わせ") || v.includes("顔型") || v.includes("ショート") || v.includes("ボブ") || v.includes("前髪") || v.includes("ストレート") || v.includes("長さ"))
    return {
      category: "カット・似合わせ相談", group: "デザイン",
      summary: "カットやヘアスタイルの似合わせに関する相談として記録しました。",
      guidance: "「似合う長さ」は存在しませんが、「似合うバランス」は存在します。顔型診断だけで断定せず、顔まわりの余白・肌面積・シルエット・重心・眉・目元・メイク・服装・なりたいイメージとのバランスで考えます。",
      nextAction: "この内容は、来店時のメモや予約時の備考にも使えます。直接相談したい場合は、予約ページやお電話もご利用ください。",
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

  /* ─── リクルート ─── */
  if (v.includes("美容師") || v.includes("見学") || v.includes("働") || v.includes("求人") || v.includes("採用"))
    return {
      category: "美容師・見学希望", group: "リクルート",
      summary: "Da-isの見学や働き方に関するご相談として記録しました。",
      guidance: "Da-isの雰囲気や働き方はInstagramやnoteでご覧いただけます。見学をご希望の方はお電話にてお問い合わせください。",
      nextAction: "Da-isの雰囲気や働き方を知りたい方は、Instagramやnoteをご覧ください。\n見学をご希望の場合は、お電話にてお問い合わせください。",
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

function App() {
  const [selectedEntry, setSelectedEntry] = useState(null);
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
  const [fontSize, setFontSize] = useState(() => localStorage.getItem(FONT_SIZE_KEY) || "medium");
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const resultCardRef = useRef(null);
  const aiRequestIdRef = useRef(0);

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
    localStorage.setItem(FONT_SIZE_KEY, fontSize);
  }, [fontSize]);

  const currentEntry = useMemo(
    () => ENTRIES.find((e) => e.id === selectedEntry),
    [selectedEntry]
  );

  function openEntry(id) {
    setSelectedEntry(id);
    setInput("");
    setLastResult(null);
    setAttachedImages([]);
    setAttachedUrls([""]);
    setIsContinuing(false);
    setAiResponse(null);
    setAiLoading(false);
    setAiError(null);
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
    if (!text || !currentEntry) return;
    const wasContinuing = isContinuing;
    const result = classifyConsult(text);
    const fieldUrls = attachedUrls.filter((u) => u.trim() !== "");
    const textUrls = extractUrls(text);
    const savedUrls = [...new Set([...fieldUrls, ...textUrls])];

    // 画像エンコードを状態クリア前にスナップショットして非同期開始
    const imagesToEncode = [...attachedImages];
    const encodedImagesPromise = Promise.all(imagesToEncode.map((img) => resizeAndEncodeImage(img)));

    setConsultations((prev) => [
      {
        id: Date.now(),
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
    setLastResult({ ...result, imageCount: attachedImages.length, attachedUrls: savedUrls });
    setAttachedImages([]);
    setAttachedUrls([""]);
    setIsContinuing(false);

    /* Gemini AI 応答 */
    setAiResponse(null);
    setAiError(null);
    if (result.category !== "__complaint__") {
      setAiLoading(true);
      const requestId = ++aiRequestIdRef.current;
      const encodedImages = (await encodedImagesPromise).filter(Boolean);
      console.log("Encoded images count:", encodedImages.length);
      console.log("Encoded image mimeTypes:", encodedImages.map((img) => img.mimeType));
      try {
        const prompt = buildDpepperPrompt({
          text,
          category: result.category,
          group: result.group,
          summary: result.summary,
          guidance: result.guidance,
          entryTitle: currentEntry.title,
          isContinuing: wasContinuing,
        });
        const aiText = await askGemini(prompt, savedUrls, encodedImages);
        if (requestId === aiRequestIdRef.current) {
          const fallbackText = wasContinuing
            ? "続きですね。書いていただいた内容をもとに、もう少し整理してみます。気になる点や状態の変化があれば、続けて書いてみてください。"
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
        }
      } catch (err) {
        if (requestId === aiRequestIdRef.current) {
          console.error("Gemini error:", err);
          if (savedUrls.length > 0 || encodedImages.length > 0) {
            const hasUrl = savedUrls.length > 0;
            const hasImg = encodedImages.length > 0;
            const what = hasUrl && hasImg ? "URLや画像の内容まで" : hasImg ? "画像の内容は十分に" : "URLの内容まで";
            const fallback = wasContinuing
              ? `続きですね。${what}は確認できませんでしたが、シャンプーやトリートメントは成分名だけでなく、使った後の重さ・乾きにくさ・ベタつき・数週間使った変化を見ることが大切です。今の髪や頭皮の状態と合わせて整理できます。`
              : `こんにちは、Da-isの髪と頭皮の相談所『Dペッパー』です。${what}は確認できませんでしたが、シャンプーやトリートメントは成分名だけでなく、使った後の重さ・乾きにくさ・ベタつき・数週間使った変化を見ることが大切です。商品だけで合う合わないを決めず、今の髪や頭皮の状態と合わせて整理できます。`;
            setAiResponse(fallback);
          } else {
            setAiError(err.message ?? "応答を取得できませんでした。");
          }
        }
      } finally {
        if (requestId === aiRequestIdRef.current) setAiLoading(false);
      }
    }
  }

  function formatDate(iso) {
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      }).format(new Date(iso));
    } catch { return ""; }
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
          <span className="brand-main">Da-is</span>
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
            <div className="hero">
              <h1>Da-isの相談所へようこそ。</h1>
              <div className="deco-line">
                <span className="deco-diamond" />
              </div>
              <p>髪や頭皮の悩みを、少し言葉にしてみませんか。</p>
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
                    <span className="entry-subtitle">{entry.subtitle}</span>
                  </span>
                  <span className="entry-arrow"><ArrowIcon /></span>
                </button>
              ))}
            </div>

            {/* 外部導線 */}
            <div className="social-section">
              <p className="social-label">Da-isをもっと見る</p>
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
            <button type="button" className="back-button" onClick={goHome}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 12H5" /><path d="m11 6-6 6 6 6" />
              </svg>
              <span>戻る</span>
            </button>
            <div className="consult-card">
              <div className="consult-badge">— {currentEntry.badge}</div>
              <h2>{currentEntry.label}</h2>
              <p className="consult-sub">{currentEntry.sub}</p>
              <form onSubmit={handleSubmit}>
                <p className="textarea-helper">
                  {isContinuing
                    ? "続きを書いてください。うまくまとまっていなくても大丈夫です。"
                    : currentEntry.id === "stylist"
                      ? "気になっていることをそのまま書いてください。採用・見学の詳細はご来店またはお電話でご案内します。"
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
                    : currentEntry.id === "regular"
                      ? "例：前回のカラーから気になっていることがあります"
                      : currentEntry.id === "first"
                        ? "例：髪のダメージが気になっています"
                        : "例：Da-isの働き方について知りたいです"
                  }
                  rows={8}
                />

                <p className="send-note">この相談内容や写真は、現在、店舗スタッフへ自動送信されません。</p>
                <button type="submit" className="submit-button">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4 20-7Z" />
                  </svg>
                  <span>相談・記録する</span>
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
                      <span>自分の髪の状態を記録する{attachedImages.length > 0 ? `（${attachedImages.length}/3）` : "（任意・最大3枚）"}</span>
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
                            電話で相談する
                          </a>
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
                      {aiLoading && (
                        <div className="ai-loading">Dペッパーが相談内容を整理しています…</div>
                      )}
                      {!aiLoading && aiResponse && (
                        <div className="ai-response">
                          <span className="result-label">Dペッパーより</span>
                          <p>{aiResponse}</p>
                        </div>
                      )}
                      {!aiLoading && !aiResponse && lastResult.guidance && (
                        <div className="next-action">
                          <span>考え方</span>
                          <p>{lastResult.guidance}</p>
                        </div>
                      )}
                      {aiError && (
                        <p style={{ fontSize: "11px", color: "var(--text-light)", marginTop: "6px" }}>※AI応答を取得できませんでした</p>
                      )}
                      <div className="next-action" style={{ marginTop: "10px" }}>
                        <span>次の案内</span>
                        <p>{lastResult.nextAction}</p>
                      </div>
                      {(() => {
                        const btns = EXIT_BUTTONS[lastResult.category] ?? EXIT_BUTTONS["髪の悩み"];
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
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="exit-btn"
                                    >
                                      {btn.label}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
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
        onClick={() => setHistoryOpen(false)}
      />
      <aside className={`history-panel${historyOpen ? " is-open" : ""}`}>
        <div className="history-panel-header">
          <h2>履歴</h2>
          <button type="button" onClick={() => setHistoryOpen(false)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12" /><path d="M18 6 6 18" />
            </svg>
          </button>
        </div>
        {consultations.length === 0 ? (
          <div className="history-empty">
            <p>まだ相談の記録はありません。</p>
            <span>相談すると、ここに静かに残ります。</span>
          </div>
        ) : (
          <div className="history-list">
            {consultations.map((item) => (
              <article className="history-item" key={item.id}>
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
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

export default App;
