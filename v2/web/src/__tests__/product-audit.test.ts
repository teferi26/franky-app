import { describe, it, expect } from "vitest";
import { replayAnswers, type AnswerEntry } from "@/app/test-vocacional/lib/answer-history";
import { createEmptyProfile } from "@/app/test-vocacional/types";
import { buildCareerProfile } from "@/app/test-vocacional/lib/career-profiles";
import { computeAllMatches } from "@/app/test-vocacional/lib/matching-engine";
import { screenName } from "@/lib/screen-name";
import { plazoInfo, plazoBadge, plazoAbierto } from "@/lib/becas";
import { assessScholarship, type ScholarshipProfile, type ScholarshipRecord } from "@/lib/scholarship-eligibility";

describe("vocational answers and practical constraints", () => {
  const answer: AnswerEntry = { questionId: "q", stage: 1, option: { text: "Sí", impacts: [{ dimension: "riasec.I", delta: 4 }] } };
  it("going back and answering again never mutates a previous profile", () => {
    const previous = replayAnswers([answer]);
    const next = replayAnswers([answer, { ...answer, questionId: 'a-different-question' }]);
    expect(previous.profile.riasec.I).toBe(4);
    expect(next.profile.riasec.I).toBe(8);
    expect(replayAnswers([]).profile).toEqual(createEmptyProfile());
    expect(replayAnswers([answer]).recentDims).toEqual(["riasec"]);
  });
  it("excludes private universities when only public is selected", () => {
    const profile = createEmptyProfile(); profile.pragmatico.presupuesto = 1;
    const career = { ...buildCareerProfile("Ingeniería Informática", "ingenieria_arquitectura", 9, "grado"), name: "Ingeniería Informática", branch: "ingenieria_arquitectura", university_id: null, duration_years: 4, cut_off_score: 9, employment_rate: null };
    const result = computeAllMatches(profile, [{ ...career, id: "private", university_type: "privada" }, { ...career, id: "public", university_type: "publica" }]);
    expect(result.map(r => r.career.id)).toEqual(["public"]);
  });
  it("applies duration even when no budget or grade is supplied", () => {
    const profile = createEmptyProfile(); profile.pragmatico.duracion_max = 4;
    const career = { ...buildCareerProfile("Medicina", "ciencias_salud", null, "grado"), id: "medicine", name: "Medicina", branch: "ciencias_salud", university_id: null, duration_years: 6, cut_off_score: null, employment_rate: null };
    const [match] = computeAllMatches(profile, [{ ...career, duration_years: 6 }]);
    expect(match.scoreBreakdown.pragmatico).toBeLessThan(1);
  });
});

describe("scholarship dates and incomplete evidence", () => {
  it("does not open Equitat before its actual opening and respects the closing hour", () => {
    const window = { opens_at: '2026-09-14T22:00:00Z', closes_at: '2026-10-30T13:00:00Z' };
    expect(plazoInfo('2026-10-30', Date.parse('2026-09-05T10:00:00Z'), window).estado).toBe('pendiente_apertura');
    expect(plazoAbierto('2026-10-30', Date.parse('2026-09-14T21:59:59Z'), window)).toBe(false);
    expect(plazoAbierto('2026-10-30', Date.parse('2026-09-14T22:00:00Z'), window)).toBe(true);
    expect(plazoAbierto('2026-10-30', Date.parse('2026-10-30T12:59:59Z'), window)).toBe(true);
    expect(plazoAbierto('2026-10-30', Date.parse('2026-10-30T13:00:00Z'), window)).toBe(false);
  });
  it("never invents the next annual call for an expired deadline", () => {
    const now = Date.parse("2026-09-05T10:00:00Z");
    const result = plazoInfo("2025-05-19", now);
    expect(result.fecha?.getFullYear()).toBe(2025);
    expect(plazoBadge(result)?.label).toContain("cerrado");
    expect(plazoAbierto("2025-05-19", now)).toBe(false);
  });
  it("date-only closing days stay current during the Spanish calendar day", () => {
    expect(plazoAbierto("2026-09-05", Date.parse("2026-09-05T10:00:00Z"))).toBe(true);
    expect(plazoAbierto("2026-09-05", Date.parse("2026-09-05T22:01:00Z"))).toBe(false);
  });
  const scholarship = { target_audience: ["grado"], coverage: ["matricula"], income_threshold: 40773, gpa_requirement: 5, comunidad_autonoma: null } as ScholarshipRecord;
  const profile: ScholarshipProfile = { nivel: "grado", comunidad: "Madrid", renta: "50000", nota_media: "", ayuda: "cualquiera", discapacidad: false, familia_numerosa: false };
  it("doesn't exclude a family using the top of an income bracket", () => {
    const result = assessScholarship(scholarship, profile);
    expect(result.matches).toBe(true);
    expect(result.pending.some(p => p.includes("miembros"))).toBe(true);
  });
  it("keeps missing grade requirements pending and excludes another level", () => {
    expect(assessScholarship(scholarship, profile).pending.some(p => p.includes("académico"))).toBe(true);
    expect(assessScholarship(scholarship, { ...profile, nivel: "eso" }).matches).toBe(false);
  });
  it("does not compare an admission threshold over 10 with a GPA over 10", () => {
    const result = assessScholarship({ ...scholarship, gpa_requirement: 12.9 }, { ...profile, nota_media: "9" });
    expect(result.matches).toBe(true);
    expect(result.pending.join(" ")).toContain("no es comparable");
    expect(result.pending.join(" ")).not.toContain("12.9/10");
    expect(result.pending.join(" ")).not.toContain("Tu nota declarada es inferior");
  });
  it("keeps an invalid stored grade pending instead of suggesting it meets the requirement", () => {
    const result = assessScholarship(scholarship, { ...profile, nota_media: "14" });
    expect(result.pending.join(" ")).not.toContain("alcanza");
    expect(result.pending.join(" ")).toContain("Comprobar el requisito académico");
  });
  it("a decimal comma GPA still requires checking the academic stage", () => {
    const result = assessScholarship({ ...scholarship, gpa_requirement: 8.5 }, { ...profile, nota_media: "8,7" });
    expect(result.pending.join(" ")).toContain("si corresponde a la misma escala y modalidad");
  });
});

describe("privacy of screen analytics", () => {
  it("never includes identifiers, search terms or sensitive query values", () => {
    expect(screenName('/fomo/alacant/private-id?search=private')).toBe('fomo_hilo');
    expect(screenName('/becas?renta=50000&discapacidad=1')).toBe('becas');
    expect(screenName('/(tabs)/crush')).toBe('crush');
    expect(screenName('/unknown-private-name')).toBe('otra');
  });
});
