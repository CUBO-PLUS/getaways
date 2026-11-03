import "server-only";
import { getSession } from "@/modules/auth/server/auth";
import { db } from "@/infrastructure/prisma/db";

type Actor = NonNullable<Awaited<ReturnType<typeof getSession>>>;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class BlogAccessError extends Error {
  constructor(readonly status: 401 | 403) { super("Blog access denied"); }
}
export async function requireBlogAccess(request?: Request, adminOnly = false): Promise<Actor> {
  const actor = await getSession(request);
  if (!actor) throw new BlogAccessError(401);
  if (actor.role !== "ADMIN" && (adminOnly || actor.role !== "EDITOR")) throw new BlogAccessError(403);
  return actor;
}
export async function recheckBlogAccess(tx: Transaction, actor: Actor, adminOnly = false) {
  const user = await tx.orm.public.AdminUser.where({ id: actor.id }).forUpdate().first();
  if (!user || !user.active || user.authVersion !== actor.authVersion) throw new BlogAccessError(401);
  if (user.role !== "ADMIN" && (adminOnly || user.role !== "EDITOR")) throw new BlogAccessError(403);
}
export function blogAccessResponse(error: unknown): Response | null {
  return error instanceof BlogAccessError ? new Response(null, { status: error.status, headers: { "Cache-Control": "private, no-store" } }) : null;
}
