import "server-only";
import { assertSameOrigin, getSession, type Session } from "@/modules/auth/server/auth";
import type { UserRole } from "./users";

const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
export function reply(status: number, error: string, extraHeaders?: Record<string, string>) {
  return Response.json({ error }, { status, headers: { ...headers, ...extraHeaders } });
}
export function ok(body: object, status = 200) { return Response.json(body, { status, headers }); }

export async function authorize(request: Request, admin = false): Promise<Session | Response> {
  if (!assertSameOrigin(request)) return reply(403, "Origen no permitido");
  const actor = await getSession(request);
  if (!actor) return reply(401, "Sesión inválida");
  if (admin && actor.role !== "ADMIN") return reply(403, "Acceso denegado");
  return actor;
}

export async function readBody(request: Request): Promise<Record<string, unknown> | Response> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return reply(415, "Se requiere JSON");
  const reader = request.body?.getReader();
  if (!reader) return reply(400, "Solicitud no válida");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); return reply(413, "Solicitud demasiado grande"); }
    chunks.push(value);
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return reply(400, "Solicitud no válida");
    return parsed as Record<string, unknown>;
  } catch { return reply(400, "Solicitud no válida"); }
}

export function role(value: unknown): value is UserRole { return value === "ADMIN" || value === "EDITOR" || value === "BOOKING_MANAGER"; }
export function text(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max; }
export function password(value: unknown): value is string { return typeof value === "string" && [...value].length >= 8 && [...value].length <= 32 && Buffer.byteLength(value, "utf8") <= 72; }
export function userId(value: string): number | null {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

export function errorResponse(error: unknown): Response {
  if (!(error instanceof Error)) return reply(503, "Servicio no disponible");
  const rateLimit = /^Reauthentication rate limited: ([1-9]\d{0,5})$/.exec(error.message);
  if (rateLimit) return reply(429, "Demasiados intentos", { "Retry-After": rateLimit[1] });
  switch (error.message) {
    case "Unauthorized": return reply(401, "Sesión inválida");
    case "Invalid credentials": return reply(401, "Credenciales inválidas");
    case "Invalid email": case "Invalid name": case "Invalid role": case "Invalid active status": case "Invalid password length": case "Password confirmation does not match": case "Use the own-password change operation": return reply(400, "Solicitud no válida");
    case "User not found": return reply(404, "Usuario no encontrado");
    case "Email already exists": case "Cannot revoke your own admin access": case "Cannot remove the last active administrator": case "User changed concurrently": return reply(409, "Conflicto al actualizar usuario");
    default: return reply(503, "Servicio no disponible");
  }
}
