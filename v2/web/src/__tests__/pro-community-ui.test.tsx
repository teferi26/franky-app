import * as React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { ProContext, type ProStore } from "@/lib/pro/store";
import { PRO_VERTICALS } from "@/lib/pro/verticals";
import type { ProData } from "@/lib/pro/types";
import { communityOps } from "@/lib/pro/community";
import CommunityJunta from "@/components/pro/sections/community/junta";
import CommunityHoy from "@/components/pro/sections/community/hoy";
import CommunityAsamblea from "@/components/pro/sections/community/asamblea";
import CommunityAvisos from "@/components/pro/sections/community/avisos";
import CommunityPatrocinios from "@/components/pro/sections/community/patrocinios";
import CommunitySubvenciones from "@/components/pro/sections/community/subvenciones";
import CommunityCaja from "@/components/pro/sections/community/caja";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/pro/demo-asociacion/caja",
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => toast }));

const now = new Date("2026-10-03T10:00:00.000Z");
let latest: ProData;
const opened: string[] = [];

/** Tienda mínima con los datos de la demo: `update` aplica el cambio de verdad. */
function Harness({ children }: { children: React.ReactNode }) {
  const [data, setData] = React.useState<ProData>(() => buildDemo("community", now));
  latest = data;
  const value: ProStore = {
    spaceId: "demo-asociacion",
    vertical: PRO_VERTICALS.community,
    data,
    demo: true,
    now,
    update: async (_label, fn) => {
      setData((d) => fn(d));
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
  };
  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

function show(ui: React.ReactElement) {
  return render(<Harness>{ui}</Harness>);
}

beforeEach(() => {
  opened.length = 0;
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:doc");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(window, "open").mockImplementation((url) => {
    opened.push(String(url));
    return { addEventListener: vi.fn(), focus: vi.fn(), print: vi.fn() } as unknown as Window;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Junta", () => {
  it("prepara los papeles del registro y los guarda en el archivo", async () => {
    show(<CommunityJunta />);
    expect(screen.getByText("Papeles del registro universitario")).toBeTruthy();
    expect(screen.getByText("Certificado de la junta directiva")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Preparar los papeles/ }));
    });
    expect(opened).toContain("blob:doc");
    const doc = communityOps(latest).documents.find((d) => d.tag === "registro:26/27");
    expect(doc?.html).toContain("Relación de socios");
    expect(screen.getByRole("button", { name: /Volver a preparar/ })).toBeTruthy();
  });

  it("el archivo filtra por tipo y abre los documentos de verdad", async () => {
    show(<CommunityJunta />);
    const archive = screen.getByText("Archivo de la asociación").closest("section") as HTMLElement;
    fireEvent.click(within(archive).getByRole("tab", { name: /Acta/ }));
    const rows = within(archive).getAllByRole("listitem");
    expect(rows.length).toBe(communityOps(latest).documents.filter((d) => d.kind === "acta").length);
    await act(async () => {
      fireEvent.click(within(archive).getByRole("button", { name: /Abrir Acta de la reunión de junta de septiembre/ }));
    });
    expect(opened).toContain("blob:doc");
  });

  it("el relevo inmediato cambia la junta y lo apunta en el archivo", async () => {
    show(<CommunityJunta />);
    fireEvent.click(screen.getByRole("button", { name: /Traspasar junta/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ahora mismo/ }));
    const names = ["Nora Sempere", "Álex Poveda", "Julia Lillo", "Mario Brotons"];
    screen.getAllByPlaceholderText("Busca entre tus socios").forEach((input, i) => {
      fireEvent.change(input, { target: { value: names[i] } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Guardar ahora/ }));
    });
    expect(latest.board.map((b) => b.name)).toEqual(names);
    expect(communityOps(latest).documents[0].title).toBe("Relevo de la junta directiva");
    expect(latest.communityMembers.find((m) => m.name === "Lucía Carbonell")?.role).toBe("socio");
  });
});

describe("Resumen", () => {
  it("enseña lo que toca: tareas, dinero por devolver y papeles", () => {
    show(<CommunityHoy />);
    expect(screen.getByText(/Debes .* a 2 personas/)).toBeTruthy();
    expect(screen.getByText("Papeles del registro universitario")).toBeTruthy();
    expect(screen.getByText("Caja del curso")).toBeTruthy();
  });
});

describe("Asamblea", () => {
  it("enseña la asistencia de cada cargo y saca su certificado", async () => {
    show(<CommunityAsamblea />);
    expect(screen.getByText("Asistencia a las reuniones de junta")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Certificado de asistencia de Marcos Llorca" }));
    });
    expect(opened).toContain("blob:doc");
  });
});

describe("Avisos", () => {
  it("al enviar abre WhatsApp con el texto para el grupo", async () => {
    show(<CommunityAvisos />);
    fireEvent.click(screen.getByRole("button", { name: /Nuevo aviso/ }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Cinefórum el martes" } });
    fireEvent.change(screen.getByLabelText("Mensaje"), { target: { value: "A las 19:00 en el salón de actos." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enviar aviso/ }));
    });
    const wa = opened.find((u) => u.startsWith("https://wa.me/"));
    expect(wa).toBeTruthy();
    expect(decodeURIComponent(wa ?? "")).toContain("Cinefórum el martes");
    expect(decodeURIComponent(wa ?? "")).toContain("https://franky.es/n/hilo-rojo");
    expect(latest.announcements[0].title).toBe("Cinefórum el martes");
  });
});

describe("Patrocinios y subvenciones", () => {
  it("descarga el dossier con los datos del curso", async () => {
    show(<CommunityPatrocinios />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Descargar dossier/ }));
    });
    expect(opened).toContain("blob:doc");
  });

  it("la memoria se abre, marca el requisito y queda en el archivo", async () => {
    show(<CommunitySubvenciones />);
    fireEvent.click(screen.getAllByRole("button", { name: /Generar memoria/ })[0]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Generar memoria en PDF/ }));
    });
    expect(opened).toContain("blob:doc");
    const sb1 = latest.subsidies.find((s) => s.id === "sb1");
    expect(sb1?.checklist.find((c) => /memoria/i.test(c.label))?.done).toBe(true);
    expect(communityOps(latest).documents.some((d) => d.source?.type === "memory")).toBe(true);
  });
});

describe("Caja", () => {
  it("se abre con el saldo del curso", () => {
    show(<CommunityCaja />);
    expect(screen.getAllByText(/Saldo/i).length).toBeGreaterThan(0);
  });
});
