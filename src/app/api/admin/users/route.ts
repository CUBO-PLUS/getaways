import { getSession } from "@/modules/auth/server/auth";
import { createUser, listUsers } from "@/modules/users/server/users";
import { authorize, errorResponse, ok, password, readBody, reply, role, text } from "@/modules/users/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const actor = await getSession(request);
    if (!actor) return Response.json({ error: "Sesión inválida" }, { status: 401, headers });
    if (actor.role !== "ADMIN") return Response.json({ error: "Acceso denegado" }, { status: 403, headers });
    const users = await listUsers(actor);
    return Response.json(users.map(({ id, email, name, role, active }) => ({ id, email, name, role, active })), { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorize(request, true);
    if (actor instanceof Response) return actor;
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (!text(body.name, 200) || !text(body.email, 254) || !password(body.password) || !password(body.currentPassword) || !role(body.role)) return reply(400, "Solicitud no válida");
    const user = await createUser(actor, { name: body.name, email: body.email, password: body.password, role: body.role, currentPassword: body.currentPassword }, request);
    return ok({ id: user.id, email: user.email, name: user.name, role: user.role, active: user.active }, 201);
  } catch (error) { return errorResponse(error); }
}
