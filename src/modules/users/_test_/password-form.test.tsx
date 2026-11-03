// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PasswordForm from "@/modules/users/client/password-form";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("rejects mismatched passwords before sending credentials", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<PasswordForm />);
  fireEvent.change(screen.getByLabelText("Contraseña actual"), { target: { value: "old-password" } });
  fireEvent.change(screen.getByLabelText("Nueva contraseña"), { target: { value: "new-password" } });
  fireEvent.change(screen.getByLabelText("Confirmar contraseña nueva"), { target: { value: "other-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
  expect(screen.getByRole("alert").textContent).toContain("no coinciden");
  expect(fetch).not.toHaveBeenCalled();
});
