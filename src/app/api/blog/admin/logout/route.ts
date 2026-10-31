import { assertSameOrigin, sessionCookie } from "@/modules/content/server/blog-auth";

export async function POST(request: Request) {
  try { if (!assertSameOrigin(request)) return new Response(null, { status: 403 }); }
  catch { return new Response(null, { status: 503 }); }
  return new Response(null, { status: 204, headers: { "Set-Cookie": sessionCookie("", 0), "Cache-Control": "no-store" } });
}
