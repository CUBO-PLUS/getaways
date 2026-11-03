import { changeOwnPassword } from "@/modules/users/server/users";
import { authorize, errorResponse, ok, password, readBody, reply } from "@/modules/users/server/http";

export async function POST(request: Request) {
  try {
    const actor = await authorize(request);
    if (actor instanceof Response) return actor;
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (!password(body.currentPassword) || !password(body.newPassword) || !password(body.confirmation) || body.newPassword !== body.confirmation) return reply(400, "Solicitud no válida");
    await changeOwnPassword(actor, body.currentPassword, body.newPassword, body.confirmation, request);
    return ok({ ok: true });
  } catch (error) { return errorResponse(error); }
}
