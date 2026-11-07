import type { Metadata } from "next";
import { db } from "@/infrastructure/prisma/db";
import { getSession } from "@/modules/auth/server/auth";
import AdminShell, { type AdminUser } from "@/components/organisms/AdminShell";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/*
 * Shared chrome for everything under /admin. Without a session the shell
 * renders the page bare, which is what /admin/login needs; every other page
 * still redirects to login on its own, so this layout is never the only guard.
 * Only the display fields (name, email, role) are handed to the client.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await getSession();
  let user: AdminUser | null = null;
  if (session) {
    const row = await db.orm.public.AdminUser.where({ id: session.id }).select("name", "email").first();
    if (row) user = { name: row.name, email: row.email, role: session.role };
  }
  return <AdminShell user={user}>{children}</AdminShell>;
}
