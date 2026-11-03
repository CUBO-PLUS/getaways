import { setUserAccess } from "@/modules/users/server/users";
import { authorize, errorResponse, ok, password, readBody, reply, role, text, userId } from "@/modules/users/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await authorize(request, true);
    if (actor instanceof Response) return actor;
    const id = userId((await params).id);
    if (!id) return reply(400, "Usuario no válido");
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (!text(body.name, 200) || !role(body.role) || typeof body.active !== "boolean" || !password(body.currentPassword)) return reply(400, "Solicitud no válida");
    const user = await setUserAccess(actor, id, { name: body.name, role: body.role, active: body.active, currentPassword: body.currentPassword }, request);
    return ok({ id: user.id, email: user.email, name: user.name, role: user.role, active: user.active });
  } catch (error) { return errorResponse(error); }
}
