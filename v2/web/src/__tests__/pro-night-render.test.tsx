import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { buildDemo } from "@/lib/pro/demo";
import { ProContext, type ProStore } from "@/lib/pro/store";
import { ToastProvider } from "@/components/ui/toast";
import { PRO_VERTICALS } from "@/lib/pro/verticals";
import type { ProData, ProVerticalId } from "@/lib/pro/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/pro/demo-pub",
  useSearchParams: () => new URLSearchParams(),
}));

// Jueves 24 de septiembre de 2026 a las 23:30 en Madrid: la noche está en marcha.
const NOW = new Date("2026-09-24T21:30:00.000Z");

/** Envuelve una sección con un almacén de demo en memoria, como el de /pro/demo-*. */
function Harness({ vertical, children, now = NOW }: { vertical: ProVerticalId; children: React.ReactNode; now?: Date }) {
  const [data, setData] = React.useState<ProData>(() => buildDemo(vertical, now));
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

const SECTIONS = {
  hoy: () => import("@/components/pro/sections/night/hoy"),
  eventos: () => import("@/components/pro/sections/night/eventos"),
  rrpp: () => import("@/components/pro/sections/night/rrpp"),
  puerta: () => import("@/components/pro/sections/night/puerta"),
  reservados: () => import("@/components/pro/sections/night/reservados"),
  caja: () => import("@/components/pro/sections/night/caja"),
  barra: () => import("@/components/pro/sections/night/barra"),
  carta: () => import("@/components/pro/sections/night/carta"),
  cuadrante: () => import("@/components/pro/sections/night/cuadrante"),
  incidencias: () => import("@/components/pro/sections/night/incidencias"),
} as const;

afterEach(() => cleanup());

describe("Noche: todas las pantallas se pintan con la demo", () => {
  for (const vertical of ["pub", "nightclub"] as const) {
    for (const [id, load] of Object.entries(SECTIONS)) {
      it(`${vertical}: ${id}`, async () => {
        const { default: Section } = await load();
        const { container } = render(
          <Harness vertical={vertical}>
            <Section />
          </Harness>,
        );
        expect(container.textContent?.length ?? 0).toBeGreaterThan(40);
        // Nada de guiones largos ni palabras de demo dentro de la pantalla.
        expect(container.textContent).not.toMatch(/[\u2013\u2014]/);
        expect(container.textContent).not.toMatch(/\b(simulad[oa]|ficticio)\b/i);
        // La primera carga de cada pantalla importa mucho código: margen amplio.
      }, 30000);
    }
  }

  it("la cuenta de la noche y el informe del lunes salen en Cierre", async () => {
    const { default: Caja } = await SECTIONS.caja();
    render(
      <Harness vertical="nightclub">
        <Caja />
      </Harness>,
    );
    expect(screen.getAllByText("Informe del lunes").length).toBeGreaterThan(0);
  });

  it("Esta noche del pub pide opinión de anoche y, en noche de karaoke, enseña la cola", async () => {
    const { default: Hoy } = await SECTIONS.hoy();
    render(
      <Harness vertical="pub">
        <Hoy />
      </Harness>,
    );
    expect(screen.getByText("Pide su opinión")).toBeTruthy();
    cleanup();
    // Miércoles 30 a las 22:30: noche de karaoke en marcha.
    render(
      <Harness vertical="pub" now={new Date("2026-09-30T20:30:00.000Z")}>
        <Hoy />
      </Harness>,
    );
    expect(screen.getByText("Cola del karaoke")).toBeTruthy();
  }, 30000);
});
