import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildDemo } from "@/lib/pro/demo";
import { ProContext, type ProStore } from "@/lib/pro/store";
import { ToastProvider } from "@/components/ui/toast";
import { PRO_VERTICALS } from "@/lib/pro/verticals";
import type { ProData, ProVerticalId } from "@/lib/pro/types";
import { nightOpsOf } from "@/lib/pro/night-ops";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/pro/demo-nightclub",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,AA==" } }));

// Jueves 24 de septiembre de 2026 a las 23:30 en Madrid: la noche está en marcha.
const NOW = new Date("2026-09-24T21:30:00.000Z");

let latest: ProData | null = null;

function Harness({ vertical, children, now = NOW }: { vertical: ProVerticalId; children: React.ReactNode; now?: Date }) {
  const [data, setData] = React.useState<ProData>(() => buildDemo(vertical, now));
  latest = data;
  const value = React.useMemo<ProStore>(
    () => ({
      spaceId: `demo-${vertical}`,
      vertical: PRO_VERTICALS[vertical],
      data,
      demo: true,
      now,
      update: async (_label, fn) => {
        setData((prev) => fn(prev));
        return true;
      },
      pending: false,
      can: () => true,
      canView: () => true,
      error: null,
      refresh: async () => {},
      spaces: [],
      loadDate: async () => {},
      resetDemo: () => {},
    }),
    [data, vertical, now],
  );
  return (
    <ToastProvider>
      <ProContext.Provider value={value}>{children}</ProContext.Provider>
    </ToastProvider>
  );
}

function clean(text: string | null | undefined) {
  expect(text ?? "").not.toMatch(/[\u2013\u2014]/);
  expect(text ?? "").not.toMatch(/\b(simulad[oa]|ficticio|demo)\b/i);
}

afterEach(() => cleanup());

describe("Noche: invitaciones, RRPP, fichajes y reservados en pantalla", () => {
  it("Cierre enseña las invitaciones con nombre y deja apuntar una", async () => {
    const { default: Caja } = await import("@/components/pro/sections/night/caja");
    const { container } = render(
      <Harness vertical="pub">
        <Caja />
      </Harness>,
    );
    fireEvent.click(screen.getByRole("tab", { name: /Invitaciones/ }));
    expect(screen.getByText("Quién invita más")).toBeTruthy();
    expect(screen.getByText("Cupo por persona")).toBeTruthy();
    clean(container.textContent);
    const before = (nightOpsOf(latest as ProData).invites ?? []).length;
    fireEvent.click(screen.getByRole("button", { name: /Apuntar invitación/ }));
    fireEvent.change(screen.getByLabelText("A quién"), { target: { value: "Mesa 4" } });
    fireEvent.click(screen.getByRole("button", { name: /^Apuntar ·/ }));
    const after = nightOpsOf(latest as ProData).invites ?? [];
    expect(after).toHaveLength(before + 1);
    expect(after[after.length - 1]).toMatchObject({ to: "Mesa 4", night: "2026-09-24" });
  }, 30000);

  it("RRPP enseña objetivos y el panel de cada RRPP", async () => {
    const { default: Rrpp } = await import("@/components/pro/sections/night/rrpp");
    const { container } = render(
      <Harness vertical="nightclub">
        <Rrpp />
      </Harness>,
    );
    expect(screen.getByText(/^Objetivos para/)).toBeTruthy();
    clean(container.textContent);
    fireEvent.click(screen.getAllByRole("button", { name: /Hugo Llorca/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Ver su panel/ }));
    expect(await screen.findByText("Así lo ve Hugo")).toBeTruthy();
    expect(screen.getByText("Tu enlace")).toBeTruthy();
    expect(screen.getByText("Ganado este mes")).toBeTruthy();
  }, 30000);

  it("Turnos compara fichajes con el cuadrante y pide habilitación en puerta", async () => {
    const { default: Cuadrante } = await import("@/components/pro/sections/night/cuadrante");
    const { container } = render(
      <Harness vertical="nightclub">
        <Cuadrante />
      </Harness>,
    );
    expect(screen.getByText("Fichado frente al cuadrante")).toBeTruthy();
    expect(screen.getByText("Controladores de acceso")).toBeTruthy();
    expect(screen.getByLabelText("Número de habilitación de Kike Martínez")).toBeTruthy();
    clean(container.textContent);
  }, 30000);

  it("Vetar con una condición de acceso la apunta también en el libro", async () => {
    const { default: Incidencias } = await import("@/components/pro/sections/night/incidencias");
    render(
      <Harness vertical="nightclub">
        <Incidencias />
      </Harness>,
    );
    fireEvent.click(screen.getByRole("tab", { name: /^Vetados/ }));
    expect(screen.getByText("Condiciones de acceso")).toBeTruthy();
    const incidents = nightOpsOf(latest as ProData).incidents.length;
    fireEvent.click(screen.getByRole("button", { name: /Añadir vetado/ }));
    fireEvent.change(screen.getByLabelText("Nombre y apellido"), { target: { value: "Pedro Gil Mas" } });
    fireEvent.click(screen.getByRole("button", { name: "Sin actitud violenta o molesta" }));
    fireEvent.change(screen.getByLabelText("Qué pasó"), { target: { value: "Empujó al portero en la cola." } });
    fireEvent.click(screen.getByRole("button", { name: /^Vetar$/ }));
    const ops = nightOpsOf(latest as ProData);
    expect(ops.bans.find((b) => b.name === "Pedro Gil Mas")?.condition).toBe("Sin actitud violenta o molesta");
    expect(ops.incidents).toHaveLength(incidents + 1);
  }, 30000);

  it("Reservados recuerda que quien falló una vez debe pagar señal", async () => {
    const { default: Reservados } = await import("@/components/pro/sections/night/reservados");
    render(
      <Harness vertical="nightclub">
        <Reservados />
      </Harness>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /VIP 3/ })[0]);
    expect(await screen.findByText(/no se presentó/)).toBeTruthy();
    expect(screen.getByText(/Pídele la señal/)).toBeTruthy();
  }, 30000);
});
