import { resetUserPassword } from "@/modules/users/server/users";
import { authorize, errorResponse, ok, password, readBody, reply, userId } from "@/modules/users/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await authorize(request, true);
    if (actor instanceof Response) return actor;
    const id = userId((await params).id);
    if (!id) return reply(400, "Usuario no válido");
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (!password(body.currentPassword) || !password(body.newPassword) || !password(body.confirmation) || body.newPassword !== body.confirmation) return reply(400, "Solicitud no válida");
    await resetUserPassword(actor, id, body.currentPassword, body.newPassword, body.confirmation, request);
    return ok({ ok: true });
  } catch (error) { return errorResponse(error); }
}
