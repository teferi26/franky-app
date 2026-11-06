import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import type { ProData } from "@/lib/pro/types";
import type { CommunityMember } from "@/lib/pro/community-types";
import { communityLedger, communityOps, withCommunityOps } from "@/lib/pro/community";
import {
  REGISTRY_COMMUNITY_PCT,
  courseActivities,
  courseRange,
  registryPack,
  registryTag,
  representationAttendance,
  sameName,
  universityCommunityShare,
} from "@/lib/pro/community-registry";
import {
  archiveDocumentHtml,
  courseMemoryHtml,
  registryPackHtml,
  representationCertificateHtml,
  sponsorDossierFromData,
  subsidyMemoryFromData,
  volunteerAgreementHtml,
  volunteerCertificateHtml,
} from "@/lib/pro/community-docs";
import { communityTodayItems } from "@/lib/pro/community-today";
import {
  endVolunteer,
  signVolunteerAgreement,
  startVolunteer,
  volunteerRegistry,
  volunteerRegistryCsv,
  volunteerState,
} from "@/lib/pro/community-volunteers";

// Un sábado de octubre: en plena temporada de papeles del registro.
const now = new Date("2026-10-03T10:00:00.000Z");
const demo = () => buildDemo("community", now);

function member(id: string, university: string, extra: Partial<CommunityMember> = {}): CommunityMember {
  return {
    id,
    name: `Persona ${id}`,
    university,
    studies: "Historia",
    role: "socio",
    fee: "paid",
    joinedAt: "2025-10-01T10:00:00.000Z",
    activities: 0,
    ...extra,
  };
}

const LONG_DASH = /[–—]/;

describe("curso académico", () => {
  it("el curso va del 1 de julio al 30 de junio", () => {
    expect(courseRange(now)).toEqual({ label: "26/27", from: "2026-07-01", to: "2027-06-30" });
    expect(courseRange(now, -1)).toEqual({ label: "25/26", from: "2025-07-01", to: "2026-06-30" });
    expect(courseRange("2027-03-10", 0).label).toBe("26/27");
  });

  it("solo cuenta actividades hechas dentro del curso", () => {
    const data = demo();
    const prev = courseActivities(data.activities, courseRange(now, -1));
    expect(prev.length).toBeGreaterThanOrEqual(3);
    expect(prev.every((a) => a.status === "done")).toBe(true);
    expect(prev.every((a) => a.date.slice(0, 10) <= "2026-06-30")).toBe(true);
    // Ordenadas de la más antigua a la más reciente.
    expect([...prev].sort((a, b) => a.date.localeCompare(b.date))).toEqual(prev);
  });
});

describe("comunidad universitaria del registro", () => {
  it("compara universidades sin tildes ni mayúsculas", () => {
    expect(sameName("Universidad de Alicante", "universidad  de alicante")).toBe(true);
    expect(sameName("Universitat d'Alacant", "Universidad de Alicante")).toBe(false);
  });

  it("79,x % no llega al 80 %", () => {
    const list = [
      ...Array.from({ length: 39 }, (_, i) => member(`a${i}`, "Universidad de Alicante")),
      ...Array.from({ length: 10 }, (_, i) => member(`b${i}`, "Universidad Miguel Hernández")),
    ];
    const share = universityCommunityShare(list, "Universidad de Alicante");
    expect(share.total).toBe(49);
    expect(share.pct).toBe(79);
    expect(share.meets).toBe(false);
  });

  it("las bajas no cuentan y el 80 % justo sí vale", () => {
    const list = [
      ...Array.from({ length: 8 }, (_, i) => member(`a${i}`, "Universidad de Alicante")),
      member("b0", "Universidad Miguel Hernández"),
      member("b1", "Universidad Miguel Hernández"),
      member("b2", "Universidad Miguel Hernández", { leftAt: "2026-09-01T10:00:00.000Z" }),
    ];
    const share = universityCommunityShare(list, "Universidad de Alicante");
    expect(share).toMatchObject({ total: 10, community: 8, pct: REGISTRY_COMMUNITY_PCT, meets: true });
  });

  it("sin socios no se cumple", () => {
    expect(universityCommunityShare([], "Universidad de Alicante").meets).toBe(false);
  });
});

describe("papeles del registro", () => {
  it("en octubre están en temporada y con los tres papeles listos en la demo", () => {
    const pack = registryPack(demo(), now);
    expect(pack.inSeason).toBe(true);
    expect(pack.due).toBe("2026-12-31");
    expect(pack.daysLeft).toBe(89);
    expect(pack.items.map((i) => i.id)).toEqual(["board", "members", "memory"]);
    expect(pack.share.meets).toBe(true);
    expect(pack.ready).toBe(true);
    expect(pack.prepared).toBeUndefined();
  });

  it("sin secretaría el certificado de junta no está listo", () => {
    const data = demo();
    const pack = registryPack({ ...data, board: data.board.filter((b) => !/secretar/i.test(b.role)) }, now);
    const board = pack.items.find((i) => i.id === "board");
    expect(board?.ready).toBe(false);
    expect(board?.detail).toContain("secretaría");
    expect(pack.ready).toBe(false);
  });

  it("encuentra los papeles ya preparados por su etiqueta de curso", () => {
    const data = demo();
    const tag = registryTag(courseRange(now));
    const withDoc = withCommunityOps(data, (o) => ({
      ...o,
      documents: [
        { id: "reg", title: "Papeles", kind: "registro", at: now.toISOString(), by: "Secretaría", html: "<p></p>", tag },
        ...o.documents,
      ],
    }));
    expect(registryPack(withDoc, now).prepared?.id).toBe("reg");
  });

  it("el documento junta certificado, lista de socios y memoria del curso anterior", () => {
    const data = demo();
    const html = registryPackHtml(data, now);
    expect(html).toContain("Certificado de la junta directiva");
    expect(html).toContain("Relación de socios");
    expect(html).toContain("Memoria del curso 25/26");
    expect(html).toContain("Irene Castelló");
    expect(html).not.toMatch(LONG_DASH);
    // Un nombre con HTML no rompe el documento.
    const hostile = { ...data, space: { ...data.space, name: "<script>x</script>" } };
    expect(registryPackHtml(hostile, now)).not.toContain("<script>x</script>");
  });

  it("la memoria de un curso sin actividades no se inventa ninguna", () => {
    const data = { ...demo(), activities: [] };
    const html = courseMemoryHtml(data, now, -1);
    expect(html).toContain("<b>0</b><span>actividades realizadas");
  });
});

describe("asistencia a las reuniones de junta", () => {
  it("cuenta las reuniones cerradas desde que empezó cada cargo", () => {
    const rows = representationAttendance(demo());
    const byName = new Map(rows.map((r) => [r.seat.name, r]));
    expect(byName.get("Irene Castelló")).toMatchObject({ sessions: 3, attended: 3, pct: 100, meets: true });
    // Faltó a una de tres: 67 %, no llega al 80 %.
    expect(byName.get("Marcos Llorca")).toMatchObject({ sessions: 3, attended: 2, pct: 67, meets: false });
  });

  it("un cargo nuevo solo cuenta las reuniones de su mandato", () => {
    const data = demo();
    const late = data.board.map((b) => (b.name === "Marcos Llorca" ? { ...b, since: "2026-09-01" } : b));
    const row = representationAttendance({ ...data, board: late }).find((r) => r.seat.name === "Marcos Llorca");
    expect(row).toMatchObject({ sessions: 1, attended: 1, meets: true });
  });

  it("el certificado lleva las sesiones y el porcentaje", () => {
    const data = demo();
    const seat = data.board.find((b) => b.name === "Marcos Llorca");
    const html = representationCertificateHtml(data, seat!.id, now);
    expect(html).toContain("2 de 3");
    expect(html).toContain("67 %");
    expect(html).toContain("No asiste");
    expect(html).not.toMatch(LONG_DASH);
    expect(representationCertificateHtml(data, "no-existe", now)).toBeNull();
  });
});

describe("memoria de la subvención y dossier", () => {
  it("la memoria lleva los gastos del curso sin la comisión de Franky", () => {
    const data = demo();
    const html = subsidyMemoryFromData(data, "sb1", now) ?? "";
    expect(html).toContain("Gastos del periodo");
    expect(html).toContain("Derechos y licencias");
    expect(html).not.toContain("Comisión de Franky");
    expect(html).toContain("Importe solicitado");
    expect(html).not.toMatch(LONG_DASH);
  });

  it("sin convocatoria no habla de importe solicitado", () => {
    const html = subsidyMemoryFromData(demo(), null, now) ?? "";
    expect(html).not.toContain("Importe solicitado");
  });

  it("la memoria guardada en el archivo se regenera con los datos del momento", () => {
    const data = demo();
    const doc = {
      id: "m1",
      title: "Memoria",
      kind: "memoria" as const,
      at: now.toISOString(),
      by: "Secretaría",
      source: { type: "memory" as const, subsidyId: "sb1" },
    };
    expect(archiveDocumentHtml(data, doc, now)).toContain("Memoria de actividades");
  });

  it("el dossier sale con cifras del curso", () => {
    const html = sponsorDossierFromData(demo(), now);
    expect(html).toContain("Dossier de patrocinio");
    expect(html).not.toMatch(LONG_DASH);
  });
});

describe("lo que toca hoy", () => {
  it("junta tareas, dinero por devolver y papeles del registro", () => {
    const data = demo();
    const items = communityTodayItems(data, now);
    const kinds = new Set(items.map((i) => i.kind));
    expect(kinds.has("task")).toBe(true);
    expect(kinds.has("reimburse")).toBe(true);
    expect(kinds.has("registry")).toBe(true);
    const reimburse = items.find((i) => i.kind === "reimburse");
    expect(reimburse?.title).toContain(String(communityLedger(data, now).pendingReimburse.length));
    // Lo urgente va primero.
    const firstCalm = items.findIndex((i) => !i.urgent);
    expect(items.slice(firstCalm === -1 ? items.length : firstCalm).every((i) => !i.urgent)).toBe(true);
  });

  it("con los papeles preparados deja de pedirlos", () => {
    const data = demo();
    const tag = registryTag(courseRange(now));
    const done = withCommunityOps(data, (o) => ({
      ...o,
      documents: [{ id: "r", title: "Papeles", kind: "registro", at: now.toISOString(), by: "Secretaría", tag }, ...o.documents],
    }));
    expect(communityTodayItems(done, now).some((i) => i.kind === "registry")).toBe(false);
  });

  it("un espacio sin operación no se rompe", () => {
    const data: ProData = { ...demo(), communityOps: undefined, activities: [], board: [] };
    expect(() => communityTodayItems(data, now)).not.toThrow();
    expect(communityOps(data).documents).toEqual([]);
  });
});

describe("registro de voluntariado", () => {
  it("alta, acuerdo firmado y baja", () => {
    const m = member("v1", "Universidad de Alicante");
    expect(volunteerState(m)).toBe("none");
    const started = startVolunteer(m, "2026-10-01");
    expect(started.role).toBe("voluntario");
    expect(volunteerState(started)).toBe("pending_agreement");
    const signed = signVolunteerAgreement(started, "2026-10-02");
    expect(volunteerState(signed)).toBe("active");
    const ended = endVolunteer(signed, "2026-12-01");
    expect(volunteerState(ended)).toBe("left");
    expect(ended.role).toBe("socio");
    expect(ended.volunteer).toEqual({ since: "2026-10-01", agreementAt: "2026-10-02", leftAt: "2026-12-01" });
  });

  it("la junta sigue siendo junta aunque se apunte como voluntaria", () => {
    const m = member("v2", "Universidad de Alicante", { role: "junta" });
    expect(startVolunteer(m, "2026-10-01").role).toBe("junta");
    expect(endVolunteer(startVolunteer(m, "2026-10-01"), "2026-11-01").role).toBe("junta");
  });

  it("la demo tiene voluntarios con el acuerdo y uno pendiente", () => {
    const data = demo();
    const list = volunteerRegistry(data.communityMembers as CommunityMember[]);
    expect(list.length).toBeGreaterThan(3);
    expect(list.filter((m) => volunteerState(m) === "pending_agreement")).toHaveLength(1);
  });

  it("el CSV protege las fórmulas y lleva las horas", () => {
    const hostile = startVolunteer(member("v3", "Universidad de Alicante", { name: "=HYPERLINK(1)" }), "2026-10-01");
    const csv = volunteerRegistryCsv([hostile], [], now);
    const [header, row] = csv.split("\n");
    expect(header).toContain("Acuerdo de incorporación firmado");
    expect(row.startsWith(`"'=HYPERLINK(1)"`)).toBe(true);
    expect(row).toContain('"No"');
  });

  it("acuerdo y certificado con los turnos hechos", () => {
    const data = demo();
    const vol = volunteerRegistry(data.communityMembers as CommunityMember[])[0];
    const agreement = volunteerAgreementHtml(data, vol.id, now) ?? "";
    expect(agreement).toContain("Acuerdo de incorporación de voluntariado");
    expect(agreement).toContain(vol.name);
    expect(agreement).not.toMatch(LONG_DASH);
    const cert = volunteerCertificateHtml(data, vol.id, now) ?? "";
    expect(cert).toContain("Certificado de voluntariado");
    expect(volunteerCertificateHtml(data, "m5000", now)).toBeNull();
  });
});
