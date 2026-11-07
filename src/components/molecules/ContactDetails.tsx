import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";

import { BUSINESS, formattedAddress, telHref } from "@/modules/site/business";

export default function ContactDetails() {
  const tel = telHref();
  const methods = [
    ...(tel ? [{ label: "Call us", value: BUSINESS.telephone, href: tel, Icon: Phone, channel: "phone" }] : []),
    { label: "Email us", value: BUSINESS.email, href: `mailto:${BUSINESS.email}`, Icon: Mail, channel: "email" },
  ];

  return (
    <address className="mt-5 not-italic" aria-label="Contact details">
      {methods.map(({ label, value, href, Icon, channel }) => (
        <a key={label} data-umami-event="contact_click" data-umami-event-source="contact" data-umami-event-channel={channel} className="group flex min-w-0 items-center gap-4 border-b border-[rgba(7,36,86,.075)] py-5 text-body-text leading-[1.65] hover:text-button-bg focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-[#648d79]" href={href}>
          <span className="grid size-12 shrink-0 place-items-center rounded-[10px] bg-button-bg/5"><Icon size={20} strokeWidth={1.5} aria-hidden="true" /></span>
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold tracking-[1.5px] text-muted-text uppercase">{label}</span>
            <span className="mt-1 block text-base font-medium text-heading [overflow-wrap:anywhere] max-[600px]:text-sm">{value}</span>
          </span>
          <ArrowUpRight className="ml-auto size-4 shrink-0 text-[rgba(7,36,86,.35)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none" strokeWidth={1.5} aria-hidden="true" />
        </a>
      ))}
      <p className="mt-6 mb-0 flex items-center gap-2 text-xs leading-[1.65]">
        <MapPin className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />{formattedAddress()}
      </p>
    </address>
  );
}
