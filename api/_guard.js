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
// （スクリプトから直接叩く攻撃は防げないが、他サイトに埋め込まれて使われるのは防ぐ）
const ALLOWED_ORIGINS = new Set(
  [
    "https://d-pepper-app.vercel.app",
    ...(process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()),
  ].filter(Boolean)
);

export function originAllowed(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Vercel のプレビュー環境（d-pepper-app-xxxx.vercel.app）は許可
  return /^https:\/\/d-pepper-app(-[a-z0-9-]+)?\.vercel\.app$/.test(origin) ||
    /^http:\/\/localhost:\d+$/.test(origin);
}

export async function readJsonLimited(request, maxBytes) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > maxBytes) return { error: "too_large" };
  const raw = await request.text();
  if (raw.length > maxBytes) return { error: "too_large" };
  try {
    return { body: JSON.parse(raw) };
  } catch {
    return { error: "invalid_json" };
  }
}

export function reject(status, message) {
  return Response.json({ error: message }, { status });
}
