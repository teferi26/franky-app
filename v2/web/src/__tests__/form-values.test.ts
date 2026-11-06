import { describe, expect, it } from "vitest";
import {
  MAX_NUMERIC_10_2,
  nullableDate,
  nullableInt,
  nullableNum,
  nullableText,
  nullableUuid,
} from "@/lib/form-values";

/**
 * Estos casos son los que tumbaban el alta de pisos con un 500 mudo ("No se
 * pudo crear el anuncio"): lo que el propietario escribía llegaba crudo a
 * Postgres y la columna lo rechazaba. Cada expect de aquí es un anuncio que
 * antes se perdía.
 */

describe("nullableDate", () => {
  it("acepta lo que manda <input type=date>", () => {
    expect(nullableDate("2027-06-30")).toBe("2027-06-30");
  });

  it("acepta la fecha escrita a mano en formato español", () => {
    // El caso real: navegador sin soporte de type=date (webviews), el campo
    // degrada a texto y la inmobiliaria escribe la fecha como aquí se escribe.
    expect(nullableDate("30/06/2027")).toBe("2027-06-30");
    expect(nullableDate("1/9/2027")).toBe("2027-09-01");
    expect(nullableDate("30-06-2027")).toBe("2027-06-30");
  });

  it("acepta ISO con hora", () => {
    expect(nullableDate("2027-06-30T00:00:00.000Z")).toBe("2027-06-30");
  });

  it("descarta lo que no es una fecha en vez de romper el alta", () => {
    expect(nullableDate("")).toBeNull();
    expect(nullableDate("junio 2027")).toBeNull();
    expect(nullableDate("30/06/27")).toBeNull();
    expect(nullableDate(null)).toBeNull();
    expect(nullableDate(undefined)).toBeNull();
  });

  it("descarta fechas que no existen en el calendario", () => {
    expect(nullableDate("31/02/2027")).toBeNull();
    expect(nullableDate("2027-02-30")).toBeNull();
    expect(nullableDate("2027-13-01")).toBeNull();
  });

  it("respeta los años bisiestos", () => {
    expect(nullableDate("29/02/2028")).toBe("2028-02-29");
    expect(nullableDate("29/02/2027")).toBeNull();
  });
});

describe("nullableUuid", () => {
  it("acepta un UUID", () => {
    expect(nullableUuid("28ef67ae-2ac4-4e41-935a-04681776e2cd")).toBe(
      "28ef67ae-2ac4-4e41-935a-04681776e2cd",
    );
  });

  it("descarta cualquier otra cosa (la columna es UUID y da 22P02)", () => {
    expect(nullableUuid("universidad-de-alicante")).toBeNull();
    expect(nullableUuid("")).toBeNull();
    expect(nullableUuid("28ef67ae2ac44e41935a04681776e2cd")).toBeNull();
    expect(nullableUuid(42)).toBeNull();
  });
});

describe("nullableInt", () => {
  it("acepta valores normales de un anuncio", () => {
    expect(nullableInt(3, 99)).toBe(3);
    expect(nullableInt("120", 100_000)).toBe(120);
    expect(nullableInt(90.7, 99)).toBe(90);
  });

  it("descarta lo que desborda un INTEGER en vez de reventar el insert", () => {
    expect(nullableInt(99_999_999_999, 100_000)).toBeNull();
    expect(nullableInt(1_234_567_890, 100_000)).toBeNull();
  });

  it("descarta cero, negativos y texto", () => {
    expect(nullableInt(0)).toBeNull();
    expect(nullableInt(-5)).toBeNull();
    expect(nullableInt("no sé")).toBeNull();
    expect(nullableInt(null)).toBeNull();
  });
});

describe("nullableNum", () => {
  it("acepta decimales y el cero", () => {
    expect(nullableNum(1.5, 99)).toBe(1.5);
    expect(nullableNum(0, 99)).toBe(0);
  });

  it("descarta lo que se sale del techo", () => {
    expect(nullableNum(99_999_999_999, 99)).toBeNull();
    expect(nullableNum(-1, 99)).toBeNull();
    expect(nullableNum(Infinity, 99)).toBeNull();
  });
});

describe("nullableText", () => {
  it("recorta y descarta lo vacío", () => {
    expect(nullableText("  Piso céntrico  ")).toBe("Piso céntrico");
    expect(nullableText("   ")).toBeNull();
    expect(nullableText(7)).toBeNull();
  });
});

describe("MAX_NUMERIC_10_2", () => {
  it("es el techo real de la columna price", () => {
    expect(MAX_NUMERIC_10_2).toBe(99_999_999.99);
  });
});
