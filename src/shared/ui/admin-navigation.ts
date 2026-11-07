import { CalendarCheck, House, LayoutDashboard, Newspaper, Users, type LucideIcon } from "lucide-react";
// Type-only import: erased at build time, so the server-only module never reaches the client.
import type { Role } from "@/modules/auth/server/auth";

/*
 * Single source for the admin panel's sections. The sidebar (AdminShell) and
 * the /admin overview both read it, so a section's label, icon and the roles
 * that see it can never disagree between the two. Visibility here is only a
 * convenience: every page still enforces its own role check on the server.
 */

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  roles: readonly Role[];
  /** Only "/admin" needs an exact match; the rest stay active on nested routes. */
  exact?: boolean;
};

export type AdminNavGroup = { label: string | null; items: AdminNavItem[] };

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  EDITOR: "Editor",
  BOOKING_MANAGER: "Gestor de reservas",
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: null,
    items: [
      { href: "/admin", label: "Panel", description: "Reservas pendientes y actividad del sitio.", icon: LayoutDashboard, roles: ["ADMIN", "EDITOR", "BOOKING_MANAGER"], exact: true },
    ],
  },
  {
    label: "Contenido",
    items: [
      { href: "/admin/listings", label: "Hospedajes", description: "Descripción, fotos y datos de cada propiedad.", icon: House, roles: ["ADMIN", "EDITOR"] },
      { href: "/admin/blog", label: "Blog", description: "Borradores, edición y publicación de artículos.", icon: Newspaper, roles: ["ADMIN", "EDITOR"] },
    ],
  },
  {
    label: "Operación",
    items: [
      { href: "/admin/bookings", label: "Reservas", description: "Estado, pagos y contacto con huéspedes.", icon: CalendarCheck, roles: ["ADMIN", "BOOKING_MANAGER"] },
    ],
  },
  {
    label: "Equipo",
    items: [
      { href: "/admin/users", label: "Usuarios", description: "Cuentas, roles y acceso del equipo.", icon: Users, roles: ["ADMIN"] },
    ],
  },
];

export function navForRole(role: Role): AdminNavGroup[] {
  return ADMIN_NAV
    .map((group) => ({ ...group, items: group.items.filter((item) => item.roles.includes(role)) }))
    .filter((group) => group.items.length > 0);
}

export function isNavItemActive(item: Pick<AdminNavItem, "href" | "exact">, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
