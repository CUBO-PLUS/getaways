import { assertSameOrigin, revokeSession, sessionCookie } from "@/modules/auth/server/auth";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store", "Set-Cookie": sessionCookie("", 0) };
  try {
    if (!assertSameOrigin(request)) return Response.json({ error: "Origen no permitido" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    await revokeSession(request);
    return Response.json({ ok: true }, { headers });
  } catch { return Response.json({ error: "Sesión local cerrada; no se pudo confirmar el cierre en los demás dispositivos." }, { status: 503, headers }); }
}
