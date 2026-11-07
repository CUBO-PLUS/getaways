// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import Login from "@/modules/auth/client/login";
import BlogLogin from "@/modules/content/client/blog-login";
import PasswordForm from "@/modules/users/client/password-form";
import UsersPanel from "@/modules/users/client/users-panel";
import { CreateUserForm, EditUserForm } from "@/modules/users/client/user-form";
import GuestAuthForm from "@/modules/guests/client/GuestAuthForm";

const { replace, push } = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push, refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(window.location.search) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); replace.mockReset(); push.mockReset(); window.history.replaceState({}, "", "/"); });

function expectSafeForm(form: HTMLFormElement | null, action: string) {
  expect(form).not.toBeNull();
  expect(form?.getAttribute("method")?.toLowerCase()).toBe("post");
  expect(form?.getAttribute("action")).toBe(action);
}

it("renders credential forms with safe native submission before hydration", () => {
  for (const [element, action, additionalAction] of [
    [<Login key="login" />, "/api/admin/login"],
    [<BlogLogin key="blog-login" />, "/api/blog/admin/login"],
    [<PasswordForm key="password" />, "/api/admin/account/password"],
    [<CreateUserForm key="create-user" />, "/api/admin/users"],
    [<EditUserForm key="edit-user" user={{ id: 2, name: "Editora", email: "editora@example.com", role: "EDITOR", active: true }} currentUserId={1} />, "/api/admin/users/2", "/api/admin/users/2/reset-password"],
    [<GuestAuthForm key="guest-login" mode="login" />, "/api/guest/login"],
    [<GuestAuthForm key="guest-register" mode="register" />, "/api/guest/register"],
  ] as const) {
    const document = new DOMParser().parseFromString(renderToString(element), "text/html");
    expectSafeForm(document.querySelector("form"), action);
    if (additionalAction) expectSafeForm(document.querySelector(`form[action="${additionalAction}"]`), additionalAction);
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

it("keeps the user list credential-free and creates accounts with reauthentication", async () => {
  render(<UsersPanel users={[{ id: 2, name: "Editora", email: "editora@example.com", role: "EDITOR", active: true }]} currentUserId={1} created={false} />);
  expect(screen.getByRole("link", { name: "Crear usuario" }).getAttribute("href")).toBe("/admin/users/new");
  expect(screen.getByRole("link", { name: "Editar" }).getAttribute("href")).toBe("/admin/users/2");
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByLabelText(/contraseña/i)).toBeNull();

  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("confirm", vi.fn(() => true));
  render(<CreateUserForm />);
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Nueva editora" } });
  fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "nueva@example.com" } });
  fireEvent.change(screen.getByLabelText("Contraseña inicial"), { target: { value: "initial-pass-123" } });
  fireEvent.change(screen.getByLabelText("Tu contraseña actual"), { target: { value: "admin-pass-123" } });
  fireEvent.click(screen.getByRole("button", { name: "Crear usuario" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/users?created=1"));
  expect(fetch).toHaveBeenCalledWith("/api/admin/users", expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ name: "Nueva editora", email: "nueva@example.com", password: "initial-pass-123", role: "EDITOR", currentPassword: "admin-pass-123" }),
  }));
});
