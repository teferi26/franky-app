import { describe, expect, it } from "vitest";
import { isShirtSize, shirtSizeLabel, tallyShirtSizes } from "@/lib/event-shirts";

/**
 * El recuento de camisetas decide cuántas compra e imprime el organizador, así
 * que las cuentas tienen que salir exactas: quien no ha contestado no puede
 * contarse como camiseta, y quien dice "no quiero" tampoco.
 */

describe("tallyShirtSizes", () => {
  it("cuenta por talla y suma solo las camisetas que hay que llevar", () => {
    const t = tallyShirtSizes(["M", "M", "L", "XS", "ninguna"]);
    expect(t.bySize).toEqual([
      { size: "XS", count: 1 },
      { size: "M", count: 2 },
      { size: "L", count: 1 },
      { size: "ninguna", count: 1 },
    ]);
    expect(t.answered).toBe(5);
    expect(t.shirtsNeeded).toBe(4); // el "ninguna" no lleva camiseta
    expect(t.missing).toBe(0);
  });

  it("separa a los apuntados que aún no han elegido talla", () => {
    const t = tallyShirtSizes(["S", null, null]);
    expect(t.answered).toBe(1);
    expect(t.missing).toBe(2);
    expect(t.shirtsNeeded).toBe(1);
  });

  it("con nadie apuntado no inventa camisetas", () => {
    const t = tallyShirtSizes([]);
    expect(t.bySize).toEqual([]);
    expect(t.answered).toBe(0);
    expect(t.missing).toBe(0);
    expect(t.shirtsNeeded).toBe(0);
  });

  it("devuelve las tallas en orden de talla, no de llegada", () => {
    const t = tallyShirtSizes(["XXL", "XS", "L"]);
    expect(t.bySize.map((x) => x.size)).toEqual(["XS", "L", "XXL"]);
  });
});

describe("isShirtSize", () => {
  it("acepta las tallas del CHECK de la migración 164", () => {
    for (const s of ["XS", "S", "M", "L", "XL", "XXL", "ninguna"]) {
      expect(isShirtSize(s)).toBe(true);
    }
  });

  it("rechaza lo que la base de datos no admitiría", () => {
    expect(isShirtSize("xs")).toBe(false);
    expect(isShirtSize("XXXL")).toBe(false);
    expect(isShirtSize(null)).toBe(false);
    expect(isShirtSize(undefined)).toBe(false);
    expect(isShirtSize(42)).toBe(false);
  });
});

describe("shirtSizeLabel", () => {
  it("traduce 'ninguna' a algo legible y deja las tallas tal cual", () => {
    expect(shirtSizeLabel("ninguna")).toBe("No quiere camiseta");
    expect(shirtSizeLabel("M")).toBe("M");
  });
});
