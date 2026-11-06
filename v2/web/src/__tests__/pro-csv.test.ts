import { describe, expect, it } from "vitest";
import { proCsvCell } from "@/lib/pro/csv";

describe("exportación de clientes como texto", () => {
  it.each(["=2+2", "\t=2+2", "+34600111222", "-2+3", " @SUM(A1)"])(
    "protege %j",
    (value) => {
      expect(proCsvCell(value)).toBe(`"'${value}"`);
    },
  );
  it("conserva nombres, comillas y separadores dentro de la celda", () => {
    expect(proCsvCell('Ana; "Campus"')).toBe('"Ana; ""Campus"""');
  });
});
