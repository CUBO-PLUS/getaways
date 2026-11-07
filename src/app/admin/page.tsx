import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getSession } from "@/modules/auth/server/auth";
import { navForRole, ROLE_LABELS } from "@/shared/ui/admin-navigation";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  // The overview card for "Panel" itself would link to this page, so skip it.
  const sections = navForRole(session.role).flatMap((group) => group.items.map((item) => ({ ...item, group: group.label }))).filter((item) => !item.exact);

  return (
    <main lang="es" className="mx-auto max-w-5xl px-6 py-10 lg:px-10 lg:py-14">
      <header>
        <span aria-hidden className="block h-[5px] w-[50px] rounded-full bg-[#394342] bg-[linear-gradient(to_right,rgba(255,255,255,0),rgba(255,255,255,0.2))]" />
        <h1 className="mt-4 text-[34px] lg:text-[42px]">Panel de administración</h1>
        <p className="m-0 mt-2 text-[16px] leading-6 text-muted-text">Sesión como {ROLE_LABELS[session.role].toLowerCase()}. Elige una sección para continuar.</p>
      </header>

      <ul className="m-0 mt-10 grid list-none gap-6 p-0 sm:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                className="group flex h-full flex-col rounded-[10px] bg-white px-6 py-5 no-underline shadow-[0_5px_30px_0_rgba(7,36,86,0.075)] transition-transform duration-250 outline-none hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd] motion-reduce:transition-none"
              >
                <span className="flex items-center justify-between">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-[#f4f5f2] text-[#394342]">
                    <Icon aria-hidden className="block size-[22px]" strokeWidth={1.75} />
                  </span>
                  {section.group && <span className="font-body text-[11px] uppercase leading-[16.5px] tracking-[1px] text-muted-text">{section.group}</span>}
                </span>
                <span className="mt-5 font-heading text-[21px] font-medium leading-[26.25px] text-heading">{section.label}</span>
                <span className="mt-1 font-body text-[14px] leading-[21px] text-body-text">{section.description}</span>
                <span className="mt-5 flex items-center gap-2 border-t border-[rgba(7,36,86,0.075)] pt-4 font-body text-[14px] leading-5 text-[#394342]">
                  Abrir {section.label.toLowerCase()}
                  <ArrowRight aria-hidden className="block size-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.75} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
