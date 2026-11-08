"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AssistantLink() {
  const pathname = usePathname();

  if (pathname === "/assistant" || pathname === "/assistant/" || pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  return (
    <Link
      href="/assistant"
      aria-label="Chat with the Getaways assistant"
      title="Chat with the Getaways assistant"
      className="fixed bottom-6 right-6 z-30 flex size-14 items-center justify-center rounded-full bg-[#394342] text-white shadow-[0_5px_21px_rgba(57,67,66,0.35)] transition-colors hover:bg-[#273332] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#394342]"
    >
      <MessageCircle size={25} aria-hidden="true" />
    </Link>
  );
}
