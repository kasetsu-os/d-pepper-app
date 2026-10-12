// Dペッパー API 共通の防御処理（2026-10 保守点検で追加）
// ※ api/ 配下でも "_" で始まるファイルは Vercel の関数として公開されない

// 同じ人（IP）からの連続送信を抑える簡易制限。
// サーバーレスはインスタンスごとに記憶が分かれるため、これは「最低限の歯止め」。
// 本格的な制限は Vercel Firewall のレート制限ルールで行う（docs/dpepper-security-checklist.md 参照）。
const buckets = new Map();

export function clientIp(request) {
  const fwd = request.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

export function rateLimited(request, { key, limit, windowMs }) {
  const id = `${key}:${clientIp(request)}`;
  const now = Date.now();
  const hits = (buckets.get(id) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(id, hits);
    return true;
  }
  hits.push(now);
  buckets.set(id, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  }
  return false;
}

// 自分のサイト以外のページから呼ばれた場合は断る。
// （送信元情報は偽装できるため、APIへの直接アクセスは防げない。ブラウザ経由の他サイト利用を制限する補助策）
// 許可は「完全一致」のみ。似た名前のプレビューURLは許可しない。
export function allowedOrigins(env = process.env) {
  const list = ["https://d-pepper-app.vercel.app"];
  if (env.VERCEL_PROJECT_PRODUCTION_URL) list.push(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`);
  // プレビュー環境では、そのデプロイ自身のURLとブランチURLだけを許可（Vercel が自動で設定する値）
  if (env.VERCEL_ENV === "preview") {
    if (env.VERCEL_URL) list.push(`https://${env.VERCEL_URL}`);
    if (env.VERCEL_BRANCH_URL) list.push(`https://${env.VERCEL_BRANCH_URL}`);
  }
  // 独自ドメインなど、手動で追加する接続元（カンマ区切り・完全一致）
  for (const o of (env.ALLOWED_ORIGINS || "").split(",")) if (o.trim()) list.push(o.trim().replace(/\/$/, ""));
  // ローカル開発（vercel dev / 環境変数なし）のときだけ localhost を許可。本番・プレビューでは許可しない
  const isDeployed = env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
  return { origins: new Set(list), allowLocalhost: !isDeployed };
}

export function originAllowed(request, env = process.env) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const { origins, allowLocalhost } = allowedOrigins(env);
  if (origins.has(origin)) return true;
  return allowLocalhost && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

// 本文を「バイト数」で数えながら読み、上限を超えた時点で読み込みを止める
export async function readJsonLimited(request, maxBytes) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > maxBytes) return { error: "too_large" };
  if (!request.body) return { error: "invalid_json" };
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { error: "too_large" };
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  try {
    return { body: JSON.parse(new TextDecoder().decode(buf)) };
  } catch {
    return { error: "invalid_json" };
  }
}

export function reject(status, message) {
  return Response.json({ error: message }, { status });
}
