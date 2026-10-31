import { login, sessionCookie } from "@/modules/content/server/blog-auth";

export async function POST(request: Request) {
  try {
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return new Response(null, { status: 413 }); }
      chunks.push(value);
    }
    const body = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
    const token = await login(request, body?.password);
    if (!token) return Response.json({ error: "Credenciales inválidas" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Solicitud no válida" }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
}
