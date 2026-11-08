// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AssistantLink from "../AssistantLink";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

afterEach(cleanup);

it("links to the assistant on other pages and hides when navigating to it", () => {
  const { rerender } = render(<AssistantLink />);
  expect(screen.getByRole("link", { name: "Chat with the Getaways assistant" }).getAttribute("href")).toBe("/assistant");

  navigation.pathname = "/assistant";
  rerender(<AssistantLink />);
  expect(screen.queryByRole("link", { name: "Chat with the Getaways assistant" })).toBeNull();

  navigation.pathname = "/admin/bookings";
  rerender(<AssistantLink />);
  expect(screen.queryByRole("link", { name: "Chat with the Getaways assistant" })).toBeNull();

  navigation.pathname = "/admin";
  rerender(<AssistantLink />);
  expect(screen.queryByRole("link", { name: "Chat with the Getaways assistant" })).toBeNull();

  navigation.pathname = "/about";
  rerender(<AssistantLink />);
  expect(screen.getByRole("link", { name: "Chat with the Getaways assistant" })).toBeTruthy();
});
