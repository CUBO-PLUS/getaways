"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { UMAMI_SCRIPT_URL, UMAMI_TRACKED_HOST, UMAMI_WEBSITE_ID } from "@/shared/analytics/umami";

type UmamiPayload = Record<string, unknown>;

declare global {
  interface Window {
    umamiBeforeSend?: (type: string, payload: unknown) => UmamiPayload | false;
  }
}

function isPrivatePath(pathname: string): boolean {
  return /^\/(?:admin|account|auth|api|checkout|booking-confirmation|editor|verification|verify|__editor-check|editor-verification-temporary)(?:\/|$)/i.test(pathname);
}

function beforeUmamiSend(type: string, payload: unknown): UmamiPayload | false {
  // Re-check at send time: the site layout stays mounted across client navigation.
  if (
    window.location.hostname !== UMAMI_TRACKED_HOST ||
    isPrivatePath(window.location.pathname) ||
    type !== "event" ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return false;
  }

  const event = payload as UmamiPayload;
  if (typeof event.website !== "string") return false;
  const clean: UmamiPayload = {
    website: event.website,
    hostname: UMAMI_TRACKED_HOST,
    url: window.location.pathname,
  };

  // Keep only the event contract this site uses; never forward title, referrer,
  // arbitrary event properties, hrefs, or other queued payload fields.
  if (typeof event.name === "string") {
    const eventNames = ["booking_click", "search_click", "contact_click", "concierge_click"];
    if (!eventNames.includes(event.name)) return false;
    clean.name = event.name;

    if (event.data && typeof event.data === "object" && !Array.isArray(event.data)) {
      const data = event.data as Record<string, unknown>;
      const safeData: Record<string, string> = {};
      const allowedValues = {
        source: ["listing", "home", "archive", "contact", "footer", "concierge"],
        channel: ["phone", "email"],
        mode: ["checkout", "contact"],
      };
      for (const key of ["source", "channel", "mode"] as const) {
        const value = data[key];
        if (typeof value === "string" && allowedValues[key].includes(value)) {
          safeData[key] = value;
        }
      }
      if (Object.keys(safeData).length) clean.data = safeData;
    }
  } else if (event.name !== undefined) {
    return false;
  }

  return clean;
}

export default function Umami() {
  const pathname = usePathname();

  useEffect(() => {
    if (
      window.location.hostname !== UMAMI_TRACKED_HOST ||
      isPrivatePath(window.location.pathname)
    ) {
      return;
    }
    window.umamiBeforeSend = beforeUmamiSend;

    if (document.getElementById("umami-analytics")) return;
    const script = document.createElement("script");
    script.id = "umami-analytics";
    script.src = UMAMI_SCRIPT_URL;
    script.async = true;
    script.dataset.websiteId = UMAMI_WEBSITE_ID;
    script.dataset.domains = UMAMI_TRACKED_HOST;
    script.dataset.excludeSearch = "true";
    script.dataset.excludeHash = "true";
    script.dataset.beforeSend = "umamiBeforeSend";
    document.head.appendChild(script);
  }, [pathname]);

  return null;
}
