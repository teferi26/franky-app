// @vitest-environment jsdom
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import StartFlow from "../app/pro/empezar/start-flow";
import { proWebPrice } from "../../../shared/pro/web-pricing";

const f = vi.hoisted(() => ({
  user: { id: "owner" } as { id: string } | null,
  loading: false,
}));
vi.mock("@/components/SessionProvider", () => ({ useSession: () => f }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: PropsWithChildren<{ href: string }>) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("@/components/ui/button", () => ({
  buttonVariants: () => "",
  Button: ({
    children,
    loading: _loading,
    variant: _variant,
    size: _size,
    ...props
  }: PropsWithChildren<
    ButtonHTMLAttributes<HTMLButtonElement> & {
      loading?: boolean;
      variant?: string;
      size?: string;
    }
  >) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/pro/kit", () => ({
  inputClass: "",
  FormField: ({
    children,
    label,
    htmlFor,
  }: PropsWithChildren<{ label: string; htmlFor: string }>) => (
    <div>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  ),
}));
vi.mock("@/lib/analytics", () => ({ trackFire: vi.fn() }));

beforeEach(() => {
  f.user = { id: "owner" };
  f.loading = false;
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

function fillBusiness() {
  for (const [label, value] of [
    ["Nombre del negocio", "Salón Centro"],
    ["Ciudad", "Alicante"],
    ["Dirección", "Calle Mayor 14"],
    ["Teléfono", "600123456"],
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Elegir mi plan" }));
}

describe("Alta autoservicio de Franky Pro", () => {
  it("lleva a crear cuenta o entrar conservando sector y campaña", () => {
    f.user = null;
    render(
      <StartFlow
        initialVertical="hairdresser"
        attribution={["utm_source: instagram", "Página de origen: peluquerias"]}
      />,
    );
    const signup = screen.getByRole("link", { name: "Crear cuenta" });
    const href = new URL(signup.getAttribute("href")!, "https://franky.es");
    expect(href.pathname).toBe("/registro");
    expect(href.searchParams.get("next")).toContain("sector=hairdresser");
    expect(href.searchParams.get("next")).toContain("utm_source=instagram");
    expect(screen.getByRole("link", { name: "Ya tengo cuenta" })).toBeTruthy();
    expect(screen.queryByLabelText("Nombre del negocio")).toBeNull();
  });

  it("con sesión pide solo los cuatro datos del negocio y mantiene los precios del catálogo", () => {
    render(<StartFlow initialVertical="hairdresser" />);
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    expect(
      screen.getByRole("button", { name: "Elegir mi plan" }),
    ).toBeDisabled();
    fillBusiness();
    expect(
      screen.getByText(`${proWebPrice("hairdresser").monthly} €`),
    ).toBeTruthy();
    expect(
      screen.getByText(`${proWebPrice("hairdresser").annual} €`),
    ).toBeTruthy();
    expect(screen.queryByText("Hablemos de tu espacio")).toBeNull();
    expect(screen.queryByText("Solicitar activación")).toBeNull();
  });

  it("envía el plan anual y reintenta con la misma clave sin crear otra solicitud", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Vuelve a intentarlo" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <StartFlow
        initialVertical="hairdresser"
        attribution={["utm_source: instagram"]}
      />,
    );
    fillBusiness();
    fireEvent.click(screen.getByRole("radio", { name: /Anual/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Empieza gratis 7 días" }),
    );
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Empieza gratis 7 días" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    const retry = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/pro/onboarding");
    expect(first).toMatchObject({
      sector: "hairdresser",
      name: "Salón Centro",
      city: "Alicante",
      address: "Calle Mayor 14",
      phone: "600123456",
      interval: "year",
      attribution: ["utm_source: instagram"],
    });
    expect(first.requestKey).toMatch(/^[a-f0-9-]{36}$/);
    expect(retry.requestKey).toBe(first.requestKey);
    expect(
      sessionStorage.getItem("franky-pro-onboarding:owner:hairdresser"),
    ).toContain(first.requestKey);
  });

  it("no abre destinos externos que no sean el pago de Stripe", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            status: "checkout",
            workspaceId: "workspace",
            url: "https://malicioso.example/pago",
          }),
        }),
    );
    render(<StartFlow initialVertical="hairdresser" />);
    fillBusiness();
    fireEvent.click(
      screen.getByRole("button", { name: "Empieza gratis 7 días" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No hemos podido abrir el pago",
    );
  });
});
