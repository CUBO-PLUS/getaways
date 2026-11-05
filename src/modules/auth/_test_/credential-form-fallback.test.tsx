// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import Login from "@/modules/auth/client/login";
import BlogLogin from "@/modules/content/client/blog-login";
import PasswordForm from "@/modules/users/client/password-form";
import UsersPanel from "@/modules/users/client/users-panel";
import GuestAuthForm from "@/modules/guests/client/GuestAuthForm";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(window.location.search) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); replace.mockReset(); window.history.replaceState({}, "", "/"); });

function expectSafeForm(form: HTMLFormElement | null, action: string) {
  expect(form).not.toBeNull();
  expect(form?.getAttribute("method")?.toLowerCase()).toBe("post");
  expect(form?.getAttribute("action")).toBe(action);
}

it("renders credential forms with safe native submission before hydration", () => {
  for (const [element, action] of [
    [<Login key="login" />, "/api/admin/login"],
    [<BlogLogin key="blog-login" />, "/api/blog/admin/login"],
    [<PasswordForm key="password" />, "/api/admin/account/password"],
    [<UsersPanel key="users" currentUserId={1} />, "/api/admin/users"],
    [<GuestAuthForm key="guest-login" mode="login" />, "/api/guest/login"],
    [<GuestAuthForm key="guest-register" mode="register" />, "/api/guest/register"],
  ] as const) {
    const document = new DOMParser().parseFromString(renderToString(element), "text/html");
    expectSafeForm(document.querySelector("form"), action);
  }
});

it("keeps guest login returns on the site while allowing the saved checkout", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
  const checkout = "/checkout?session_id=cko_1_123e4567-e89b-42d3-a456-426614174000";
  for (const [returnTo, expected] of [["//attacker.example/checkout", "/account"], [checkout, checkout]]) {
    window.history.replaceState({}, "", `/account/login?returnTo=${encodeURIComponent(returnTo)}`);
    const { unmount } = render(<GuestAuthForm mode="login" />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "guest@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password-123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    await waitFor(() => expect(replace).toHaveBeenLastCalledWith(expected));
    unmount();
  }
});

it("keeps user edit and password reset forms safe for native submission", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [
    { id: 2, name: "Editora", email: "editora@example.com", role: "EDITOR", active: true },
  ] }));
  render(<UsersPanel currentUserId={1} />);
  fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
  expectSafeForm(screen.getByRole("button", { name: "Guardar cambios" }).closest("form"), "/api/admin/users/2");
  fireEvent.click(screen.getByRole("button", { name: "Restablecer contraseña" }));
  expectSafeForm(screen.getByRole("button", { name: "Restablecer" }).closest("form"), "/api/admin/users/2/reset-password");
});
