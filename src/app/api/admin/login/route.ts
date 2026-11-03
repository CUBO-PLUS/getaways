import { assertSameOrigin, sessionCookie } from "@/modules/auth/server/auth";
import { login } from "@/modules/auth/server/login";

const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return Response.json({ error: "Origen no permitido" }, { status: 403, headers });
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "Solicitud no válida" }, { status: 400, headers });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return Response.json({ error: "Solicitud demasiado grande" }, { status: 413, headers }); }
      chunks.push(value);
    }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { return Response.json({ error: "Solicitud no válida" }, { status: 400, headers }); }
    if (!body || typeof body !== "object" || !("email" in body) || !("password" in body) || typeof body.email !== "string" || typeof body.password !== "string" || body.email.length > 254 || !body.email.trim() || Buffer.byteLength(body.password) > 72 || !body.password) return Response.json({ error: "Credenciales inválidas" }, { status: 401, headers });
    const result = await login(request, body.email, body.password);
    if (result.retryAfter) return Response.json({ error: "Demasiados intentos. Inténtalo más tarde." }, { status: 429, headers: { ...headers, "Retry-After": String(result.retryAfter) } });
    if (!result.token) return Response.json({ error: "Credenciales inválidas" }, { status: 401, headers });
    return Response.json({ ok: true }, { headers: { ...headers, "Set-Cookie": sessionCookie(result.token) } });
  } catch { return Response.json({ error: "Servicio de acceso no disponible" }, { status: 503, headers }); }
}
