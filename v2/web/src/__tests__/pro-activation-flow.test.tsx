// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import ActivationFlow from "@/app/pro/activar/activation-flow";
const f = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => f }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  f.replace.mockClear();
});

describe("Vuelta del pago", () => {
  it("espera al webhook y abre la guía tras un reintento, sin mostrar error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "pending" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "active", slug: "salon-centro" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<ActivationFlow workspaceId="space-1" orderId="order-1" />);
    expect(
      screen.getByRole("heading", { name: "Activando tu cuenta" }),
    ).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Volver a comprobar" });
    await waitFor(() => expect(retry).not.toBeDisabled());
    fireEvent.click(retry);
    await waitFor(() =>
      expect(f.replace).toHaveBeenCalledWith("/pro/space-1/guia"),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetchMock.mock.calls[0][0]).toContain(
      "workspace=space-1&order=order-1",
    );
  });

  it("un corte temporal conserva la pantalla de espera y permite reintentar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<ActivationFlow workspaceId="space-1" orderId="order-1" />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Volver a comprobar" }),
      ).not.toBeDisabled(),
    );
    expect(
      screen.getByRole("heading", { name: "Activando tu cuenta" }),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("permite retomar el mismo Checkout después de cancelar", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            status: "checkout",
            url: "https://checkout.stripe.com/c/pay/test-session",
          }),
        }),
    );
    render(
      <ActivationFlow workspaceId="space-1" orderId="order-1" cancelled />,
    );
    expect(
      await screen.findByRole("link", { name: "Retomar el pago" }),
    ).toHaveAttribute("href", "https://checkout.stripe.com/c/pay/test-session");
    expect(f.replace).not.toHaveBeenCalled();
  });
});
