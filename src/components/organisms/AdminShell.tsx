"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, KeyRound, LogOut, Menu, X } from "lucide-react";
import GetawaysLogo from "@/components/atoms/GetawaysLogo";
import { cn } from "@/shared/ui/utils";
import { isNavItemActive, navForRole, ROLE_LABELS, type AdminNavItem } from "@/shared/ui/admin-navigation";
import type { Role } from "@/modules/auth/server/auth";

/*
 * Admin chrome: a persistent sidebar on desktop and a top bar + drawer below
 * lg. Pages keep rendering their own <main>; the shell only wraps them, so it
 * uses a <div> for the content column to avoid nesting landmarks.
 *
 * Visual language follows DESIGN.md: white surfaces, mist dividers, Lexend 500
 * for names, Inter for links, charcoal-green (#394342) pill for the active
 * item with the same subtle lightening gradient and shadow as primary actions.
 * Global base styles give <a>/<button> a blue link colour and Arial 13.3px, so
 * every control here sets its own font, size and colour explicitly.
 */

export type AdminUser = { name: string; email: string; role: Role };

/** Routes that render without the shell even when a session cookie exists. */
const BARE_ROUTES = ["/admin/login", "/admin/blog/login"];

const focusRing = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]";

const itemBase = cn(
  "flex items-center gap-3 rounded-full px-4 py-2.5 font-body text-[14px] leading-5 no-underline transition-colors duration-200",
  focusRing,
);
const itemIdle = "text-body-text hover:bg-[#f4f5f2] hover:text-heading";
const itemActive = "bg-[#394342] bg-[linear-gradient(to_right,rgba(255,255,255,0),rgba(255,255,255,0.2))] text-white shadow-[0_5px_21px_0_rgba(57,67,66,0.35)]";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function NavItem({ item, pathname }: { item: AdminNavItem; pathname: string }) {
  const active = isNavItemActive(item, pathname);
  const Icon = item.icon;
  return (
    <li>
      <Link href={item.href} aria-current={active ? "page" : undefined} className={cn(itemBase, active ? itemActive : itemIdle)}>
        <Icon aria-hidden className="block size-[18px] shrink-0" strokeWidth={1.75} />
        <span>{item.label}</span>
      </Link>
    </li>
  );
}

function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setBusy(true);
    setError("");
    try {
      // The endpoint bumps authVersion, so this closes every session of the account.
      const response = await fetch("/api/admin/logout", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo cerrar la sesión. Inténtalo de nuevo.");
      router.replace("/admin/login");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cerrar la sesión.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        title="Cierra tu sesión en todos los dispositivos"
        className={cn(itemBase, itemIdle, "w-full cursor-pointer border-0 bg-transparent text-left disabled:cursor-wait disabled:opacity-60")}
      >
        <LogOut aria-hidden className="block size-[18px] shrink-0" strokeWidth={1.75} />
        <span>{busy ? "Cerrando sesión…" : "Cerrar sesión"}</span>
      </button>
      {error && <p role="alert" className="m-0 px-4 pt-1 font-body text-[12px] leading-[18px] text-destructive">{error}</p>}
    </>
  );
}

function SidebarContent({ user, pathname }: { user: AdminUser; pathname: string }) {
  const groups = navForRole(user.role);
  const accountActive = pathname.startsWith("/admin/account");

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-6 pt-7">
        <Link href="/admin" aria-label="Getaways El Salvador — Panel" className={cn("block w-[156px] rounded text-[#394342]", focusRing)}>
          <GetawaysLogo aria-hidden className="block h-auto w-full" />
        </Link>
        <p className="m-0 mt-3 font-body text-[11px] uppercase leading-[16.5px] tracking-[1px] text-muted-text">Administración</p>
      </div>

      <nav aria-label="Panel de administración" className="flex-1 overflow-y-auto px-3 pb-6">
        {groups.map((group, index) => (
          <div key={group.label ?? index} className={cn(index > 0 && "mt-6")}>
            {group.label && (
              <p className="m-0 mb-2 px-4 font-body text-[11px] uppercase leading-[16.5px] tracking-[1px] text-muted-text">{group.label}</p>
            )}
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {group.items.map((item) => <NavItem key={item.href} item={item} pathname={pathname} />)}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[rgba(7,36,86,0.075)] px-3 py-4">
        <div className="mb-3 flex items-center gap-3 px-3">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f4f5f2] font-heading text-[14px] font-medium text-[#394342]">
            {initials(user.name)}
          </span>
          <div className="min-w-0">
            <p className="m-0 truncate font-heading text-[14px] font-medium leading-5 text-heading">{user.name}</p>
            <p className="m-0 truncate font-body text-[12px] leading-[18px] text-muted-text">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          <li>
            <Link href="/admin/account/password" aria-current={accountActive ? "page" : undefined} className={cn(itemBase, accountActive ? itemActive : itemIdle)}>
              <KeyRound aria-hidden className="block size-[18px] shrink-0" strokeWidth={1.75} />
              <span>Cambiar contraseña</span>
            </Link>
          </li>
          <li>
            <a href="/" target="_blank" rel="noopener" className={cn(itemBase, itemIdle)}>
              <ExternalLink aria-hidden className="block size-[18px] shrink-0" strokeWidth={1.75} />
              <span>Ver sitio</span>
              <span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          </li>
          <li><LogoutButton /></li>
        </ul>
      </div>
    </div>
  );
}

export default function AdminShell({ user, children }: { user: AdminUser | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer whenever navigation lands on a new page.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user || BARE_ROUTES.includes(pathname)) return <>{children}</>;

  return (
    <div lang="es" className="min-h-screen bg-[#f4f5f2]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-[rgba(7,36,86,0.075)] bg-white lg:block">
        <SidebarContent user={user} pathname={pathname} />
      </aside>

      {/* Mobile / tablet top bar. Not sticky: the blog editor pins its own toolbar to the top. */}
      <div className="flex items-center justify-between border-b border-[rgba(7,36,86,0.075)] bg-white px-4 py-3 lg:hidden">
        <Link href="/admin" aria-label="Getaways El Salvador — Panel" className={cn("block w-[128px] rounded text-[#394342]", focusRing)}>
          <GetawaysLogo aria-hidden className="block h-auto w-full" />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="admin-drawer"
          className={cn("flex size-11 cursor-pointer items-center justify-center rounded-full border-0 bg-[#f4f5f2] text-[#394342]", focusRing)}
        >
          <Menu aria-hidden className="block size-5" strokeWidth={1.75} />
          <span className="sr-only">Abrir menú</span>
        </button>
      </div>

      {/* Drawer */}
      <div className={cn("fixed inset-0 z-40 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
        <div
          onClick={() => setOpen(false)}
          className={cn("absolute inset-0 bg-[rgba(15,23,39,0.35)] transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}
        />
        <aside
          id="admin-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Menú de administración"
          inert={!open}
          className={cn(
            "absolute inset-y-0 left-0 w-[min(288px,85vw)] bg-white shadow-[0_5px_30px_0_rgba(7,36,86,0.075)] transition-transform duration-250 ease-out motion-reduce:transition-none",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={cn("absolute right-3 top-5 flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-body-text hover:bg-[#f4f5f2]", focusRing)}
          >
            <X aria-hidden className="block size-5" strokeWidth={1.75} />
            <span className="sr-only">Cerrar menú</span>
          </button>
          <SidebarContent user={user} pathname={pathname} />
        </aside>
      </div>

      <div className="lg:pl-[264px]">{children}</div>
    </div>
  );
}
