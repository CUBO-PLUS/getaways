import { setAdminReferralCodeActive } from "@/modules/referrals/referral-admin";
import { authorize, ok, readBody, reply } from "@/modules/users/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const actor = await authorize(request, true);
    if (actor instanceof Response) return actor;
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (Object.keys(body).some((key) => key !== "active")) return reply(400, "Solo se puede editar el estado del código.");
    const { code } = await params;
    const result = await setAdminReferralCodeActive(actor, code, body.active);
    return result ? ok(result) : reply(404, "Código de referido no encontrado.");
  } catch (error) {
    return error instanceof RangeError
      ? reply(400, "Código o estado no válido.")
      : reply(503, "No se pudo guardar el código. Inténtalo de nuevo.");
  }
}
