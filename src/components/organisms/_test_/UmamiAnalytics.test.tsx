// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname }));

import Umami from "@/components/organisms/UmamiAnalytics";

afterEach(() => {
  cleanup();
  document.getElementById("umami-analytics")?.remove();
  delete window.umamiBeforeSend;
  vi.unstubAllGlobals();
});

it("keeps only safe event data and the current public URL", () => {
  vi.stubGlobal("window", {
    location: {
      hostname: "getaways.mauriciodmo.com",
      pathname: "/properties",
      origin: "https://getaways.mauriciodmo.com",
    },
  });
  render(<Umami />);

  expect(window.umamiBeforeSend?.("event", {
    website: "site-id",
    name: "contact_click",
    url: "https://getaways.mauriciodmo.com/properties?session_id=secret#private",
    referrer: "https://getaways.mauriciodmo.com/account?token=secret",
    title: "Private title",
    data: { source: "footer", channel: "email", href: "mailto:secret" },
  })).toEqual({
    website: "site-id",
    hostname: "getaways.mauriciodmo.com",
    url: "/properties",
    name: "contact_click",
    data: { source: "footer", channel: "email" },
  });
  expect(window.umamiBeforeSend?.("event", { website: "site-id" })).toEqual({
    website: "site-id",
    hostname: "getaways.mauriciodmo.com",
    url: "/properties",
  });
  expect(window.umamiBeforeSend?.("event", { website: "site-id", name: "unknown" })).toBe(false);
});

it("rejects events after navigation into a private route", () => {
  const location = {
    hostname: "getaways.mauriciodmo.com",
    pathname: "/properties",
    origin: "https://getaways.mauriciodmo.com",
  };
  vi.stubGlobal("window", { location });
  render(<Umami />);

  location.pathname = "/account/login";
  expect(window.umamiBeforeSend?.("event", { website: "site-id", name: "search_click" })).toBe(false);
});

it("starts tracking when a persistent layout navigates from private to public", () => {
  const location = {
    hostname: "getaways.mauriciodmo.com",
    pathname: "/account/login",
    origin: "https://getaways.mauriciodmo.com",
  };
  vi.stubGlobal("window", { location });
  const view = render(<Umami />);
  expect(document.getElementById("umami-analytics")).toBeNull();

  location.pathname = "/properties";
  view.rerender(<Umami />);
  expect(document.getElementById("umami-analytics")).not.toBeNull();
});

it.each(["localhost", "other.example.com", "getaways.mauriciodmo.com.attacker.test"])(
  "does not load the tracker on %s",
  (hostname) => {
    vi.stubGlobal("window", { location: { hostname, pathname: "/properties" } });
    render(<Umami />);
    expect(document.getElementById("umami-analytics")).toBeNull();
    expect(window.umamiBeforeSend).toBeUndefined();
  },
);

it("loads the tracker once across StrictMode effects and remounts", () => {
  vi.stubGlobal("window", {
    location: { hostname: "getaways.mauriciodmo.com", pathname: "/properties" },
  });
  const first = render(<StrictMode><Umami /></StrictMode>);
  first.unmount();
  render(<StrictMode><Umami /></StrictMode>);

  expect(document.querySelectorAll("#umami-analytics")).toHaveLength(1);
});
