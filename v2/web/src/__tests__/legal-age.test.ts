// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ageFromBirthDate,
  birthDateInputBounds,
  birthDateMessage,
  checkBirthDate,
  crushAgeGate,
  isAdultBirthDate,
} from "@/lib/legal-age";
import { legalEntityLines, LEGAL_ENTITY } from "@/lib/legal-entity";
import { isPwnedPassword, passwordSchema, PASSWORD_MIN_LENGTH } from "@/lib/password-strength";
import { friendlyProfileError, onboardingDestination, onboardingEssentialsDone } from "@/app/onboarding/essentials";

// 23 de septiembre de 2026 a mediodía, hora local.
const TODAY = new Date(2026, 8, 23, 12, 0, 0);

describe("edad a partir de la fecha de nacimiento", () => {
  it("cuenta los años cumplidos, también el día exacto del cumpleaños", () => {
    expect(ageFromBirthDate("2012-09-23", TODAY)).toBe(14);
    expect(ageFromBirthDate("2012-09-24", TODAY)).toBe(13);
    expect(ageFromBirthDate("2008-09-23", TODAY)).toBe(18);
    expect(ageFromBirthDate("2008-09-24", TODAY)).toBe(17);
  });

  it("rechaza fechas imposibles y futuras", () => {
    expect(ageFromBirthDate("2010-02-30", TODAY)).toBeNull();
    expect(ageFromBirthDate("2027-01-01", TODAY)).toBeNull();
    expect(ageFromBirthDate("", TODAY)).toBeNull();
    expect(ageFromBirthDate(null, TODAY)).toBeNull();
    expect(ageFromBirthDate("23/09/2008", TODAY)).toBeNull();
  });
});

describe("validación del alta (14 años)", () => {
  it("deja continuar desde los 14 años cumplidos", () => {
    expect(checkBirthDate("2012-09-23", TODAY)).toEqual({ ok: true, age: 14 });
  });

  it("frena a menores de 14 con un mensaje amable", () => {
    const check = checkBirthDate("2012-09-24", TODAY);
    expect(check).toMatchObject({ ok: false, reason: "under_min_age", age: 13 });
    expect(birthDateMessage(check)).toMatch(/14 años/);
  });

  it("distingue fecha vacía, inválida, futura y año mal tecleado", () => {
    expect(checkBirthDate("", TODAY)).toEqual({ ok: false, reason: "missing" });
    expect(birthDateMessage(checkBirthDate("", TODAY))).toBeNull();
    expect(checkBirthDate("2010-13-01", TODAY)).toMatchObject({ reason: "invalid" });
    expect(checkBirthDate("2030-01-01", TODAY)).toMatchObject({ reason: "future" });
    expect(checkBirthDate("0199-05-05", TODAY)).toMatchObject({ reason: "too_old" });
  });

  it("limita el selector de fecha a entre 14 y 100 años", () => {
    expect(birthDateInputBounds(TODAY)).toEqual({ min: "1926-09-23", max: "2012-09-23" });
    // 29 de febrero: el año de hace 14 no es bisiesto.
    expect(birthDateInputBounds(new Date(2028, 1, 29, 12)).max).toBe("2014-02-28");
  });
});

describe("puerta de 18 años de Crush", () => {
  it("solo deja pasar con fecha y 18 años cumplidos", () => {
    expect(crushAgeGate("2008-09-23", TODAY)).toBe("ok");
    expect(crushAgeGate("2008-09-24", TODAY)).toBe("under_18");
    expect(crushAgeGate("2010-01-01", TODAY)).toBe("under_18");
    expect(isAdultBirthDate("2008-09-24", TODAY)).toBe(false);
  });

  it("sin fecha, o con una fecha imposible, pide completarla", () => {
    expect(crushAgeGate(null, TODAY)).toBe("missing_birth_date");
    expect(crushAgeGate("", TODAY)).toBe("missing_birth_date");
    expect(crushAgeGate("2030-01-01", TODAY)).toBe("missing_birth_date");
    expect(crushAgeGate("1900-01-01", TODAY)).toBe("missing_birth_date");
  });
});

describe("onboarding: lo imprescindible", () => {
  const base = {
    full_name: "Ana López",
    birth_date: "2006-04-10",
    gender: "mujer",
    is_student: true,
    student_type: "universidad",
    university_id: "uni-1",
    university_course: 2 as number | null,
    bachillerato_course: null as number | null,
    bachillerato_modality: "",
    fp_study: "",
    master_study: "",
  };
  const answered = new Set(["is_student"]);

  it("con edad válida, universidad y curso ya se puede dejar el resto para después", () => {
    expect(onboardingEssentialsDone(base, answered)).toBe(true);
  });

  it("sin curso, sin universidad o sin responder si estudia no", () => {
    expect(onboardingEssentialsDone({ ...base, university_course: null }, answered)).toBe(false);
    expect(onboardingEssentialsDone({ ...base, university_id: "" }, answered)).toBe(false);
    expect(onboardingEssentialsDone(base, new Set())).toBe(false);
  });

  it("un menor de 14 nunca completa lo imprescindible", () => {
    expect(onboardingEssentialsDone({ ...base, birth_date: "2013-01-01" }, answered)).toBe(false);
  });

  it("quien no estudia solo necesita nombre, edad y género", () => {
    expect(onboardingEssentialsDone({ ...base, is_student: false, student_type: "" }, answered)).toBe(true);
  });

  it("lleva al FOMO de su universidad salvo que haya un destino explícito", () => {
    expect(onboardingDestination({ editMode: false, next: "/", universitySlug: "ua" })).toBe("/fomo/ua");
    expect(onboardingDestination({ editMode: false, next: "/crush", universitySlug: "ua" })).toBe("/crush");
    expect(onboardingDestination({ editMode: false, next: "/", universitySlug: null })).toBe("/");
    expect(onboardingDestination({ editMode: false, next: "/", universitySlug: "../evil" })).toBe("/");
    expect(onboardingDestination({ editMode: true, next: "/", universitySlug: "ua" })).toBe("/perfil");
  });

  it("traduce el error del trigger de edad de la base de datos", () => {
    expect(friendlyProfileError('new row violates: birth_date_under_min_age')).toMatch(/14 años/);
    expect(friendlyProfileError("otro error")).toBe("otro error");
  });
});

describe("datos del titular", () => {
  it("no muestra NIF ni domicilio mientras estén vacíos", () => {
    const labels = legalEntityLines().map((l) => l.label);
    if (LEGAL_ENTITY.name) expect(labels).toContain("Titular");
    else expect(labels).not.toContain("Titular");
    if (!LEGAL_ENTITY.nif) expect(labels).not.toContain("NIF");
    if (!LEGAL_ENTITY.address) expect(labels).not.toContain("Domicilio");
    expect(legalEntityLines().every((l) => l.value.trim().length > 0)).toBe(true);
  });

  it("muestra los campos en cuanto se rellenan", () => {
    const lines = legalEntityLines({ ...LEGAL_ENTITY, nif: "00000000T", address: "Calle Mayor 1" });
    expect(lines.map((l) => l.label)).toEqual(expect.arrayContaining(["NIF", "Domicilio"]));
  });
});

describe("política de contraseñas", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("el mínimo es 10 caracteres", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(passwordSchema.safeParse("abcdefghij").success).toBe(true);
    expect(passwordSchema.safeParse("abcdefghi").success).toBe(false);
  });

  it("consulta HaveIBeenPwned solo con el prefijo del hash y detecta la coincidencia", async () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    const fetchMock = vi.fn(async () => new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\nAAAA:1"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await isPwnedPassword("password", { timeoutMs: 1000 })).toBe(true);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toBe("https://api.pwnedpasswords.com/range/5BAA6");
    expect(calls[0][1].signal).toBeDefined();
  });

  it("falla en abierto si el servicio no responde", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await isPwnedPassword("otra-frase-larga")).toBe(false);
  });
});
