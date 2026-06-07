export async function POST(request) {
  return Response.json({
    ok: true,
    message: "gemini api route alive"
  });
}

export function GET() {
  return Response.json({
    ok: true,
    message: "gemini api route alive"
  });
}
