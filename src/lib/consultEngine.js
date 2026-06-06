const CATEGORY_RULES = [
  {
    category: '円形脱毛症の相談',
    keywords: [
      '円形脱毛症', '円形', '脱毛斑', '丸く抜けた', '一部だけ抜けた', '十円ハゲ',
    ],
  },
  {
    category: '薄毛・抜け毛の相談',
    keywords: [
      '薄毛', '抜け毛', '髪が抜ける', 'ボリュームが減った',
      'つむじ', '分け目', '生え際', '地肌が見える',
    ],
  },
  {
    category: '頭皮の悩み',
    keywords: [
      '頭皮', 'フケ', 'かゆい', 'かゆみ', '乾燥', 'べたつき', 'べたべた',
      '薄毛', '分け目', 'スカルプ', '抜け毛', 'にきび', 'ニキビ',
    ],
  },
  {
    category: '疲れ気分',
    keywords: [
      '疲れ', 'つかれ', 'ストレス', 'リフレッシュ', 'リラックス',
      'のんびり', 'ゆっくり', '気分転換', '落ち込み', 'しんどい', '癒し',
    ],
  },
  {
    category: '美容室選び',
    keywords: [
      '美容室', '美容院', 'サロン', 'おすすめ', '選び方',
      'はじめて', '初めて', '近く', '通い',
    ],
  },
  {
    category: 'メニュー迷い',
    keywords: [
      'メニュー', 'どれ', 'ヘッドスパ', 'ハイライト', 'バレイヤージュ',
      'インナーカラー', 'グラデーション', 'どんな', '何がいい', 'どうすれば',
      'どうしたら', '迷い', '迷って',
    ],
  },
  {
    category: '商品相談',
    keywords: [
      'シャンプー', 'コンディショナー', 'トリートメント', 'オイル',
      'ワックス', 'スタイリング', 'ヘアケア', '商品', 'milbon', 'ミルボン',
      'アウトバス', '自宅', 'ホームケア', '市販',
    ],
  },
  {
    category: '美容師相談',
    keywords: [
      '美容師', 'スタッフ', '担当', '見学', '就職', '転職',
      '働く', '求人', '業務委託', 'アシスタント', 'スタイリスト',
    ],
  },
  {
    category: '髪の悩み',
    keywords: [
      'くせ毛', 'うねり', '広がり', 'パサパサ', 'パサつく', 'まとまらない',
      'ダメージ', '切れ毛', '枝毛', '白髪', 'カラー', '染め',
      '縮毛', 'ストレート', 'パーマ', '髪質', '髪の毛', 'ボリューム',
      '量', 'すき', 'すかれ', 'カット', 'はねる', 'まとまり',
    ],
  },
]

function entryTypeDefaultCategory(entryType) {
  if (entryType === 'hairdresser') return '美容師相談'
  return '髪の悩み'
}

function buildSummary(text) {
  const trimmed = text.trim()
  return trimmed.length <= 40 ? trimmed : trimmed.slice(0, 40) + '…'
}

const SENSITIVE_NEXT_ACTION =
  '・美容室で相談する\n・皮膚科に相談する\n・髪型・分け目・カバー方法を相談する\n・頭皮に配慮した施術相談\n・Da-isエステシャンプーについて見る'

function buildNextAction(category) {
  const map = {
    '円形脱毛症の相談': SENSITIVE_NEXT_ACTION,
    '薄毛・抜け毛の相談': SENSITIVE_NEXT_ACTION,
    '髪の悩み': '担当スタイリストにご相談ください',
    '頭皮の悩み': 'スカルプケアメニューがおすすめです',
    '疲れ気分': 'ヘッドスパでリフレッシュしませんか',
    '美容室選び': 'まずはお気軽にご来店ください',
    'メニュー迷い': 'カウンセリングで一緒に考えましょう',
    '商品相談': 'サロンでお試しいただけます',
    '美容師相談': 'ぜひ見学にいらしてください',
  }
  return map[category] ?? 'お気軽にご相談ください'
}

export function analyzeConsultation({ text, entryType }) {
  const normalized = text.toLowerCase()

  const scored = CATEGORY_RULES.map(rule => ({
    category: rule.category,
    score: rule.keywords.filter(kw => normalized.includes(kw)).length,
  }))

  const best = scored.reduce((a, b) => (b.score > a.score ? b : a))
  const category = best.score > 0 ? best.category : entryTypeDefaultCategory(entryType)

  return {
    category,
    summary: buildSummary(text),
    nextAction: buildNextAction(category),
  }
}
