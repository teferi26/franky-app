import { describe, it, expect, beforeEach } from "vitest";
import { posicionPanel } from "@/components/navbar-dropdown-position";

/**
 * El desplegable del menú se pintaba dentro del <nav>, que lleva
 * `overflow-x: clip`. Como el borde derecho del <nav> termina donde acaba el
 * último botón, el panel (256 px) se salía y el navegador lo cortaba a mitad
 * de palabra: con el menú de propietario, que tiene un solo botón, quedaba
 * destrozado. Ahora se pinta en <body> y se coloca a mano, así que estas
 * cuentas son las que garantizan que no vuelva a salirse de la pantalla.
 */
const ANCHO_PANEL = 256;
const MARGEN = 12;

function botonEn(left: number, bottom = 58): HTMLButtonElement {
  return {
    getBoundingClientRect: () => ({ left, bottom }) as DOMRect,
  } as unknown as HTMLButtonElement;
}

describe("posicionPanel", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
  });

  it("cuelga el panel PEGADO al botón, con la separación como padding interno", () => {
    // top = r.bottom, sin sumar aire. La separación visual de 8px va en
    // paddingTop DENTRO del contenedor: si fuera hueco de verdad, el ratón lo
    // cruzaría por fuera del panel (que vive en un portal), saltaría el
    // mouseleave del botón y el menú se cerraría antes de llegar a las
    // opciones. Es el bug de "el desplegable no aguanta y no deja seleccionar".
    expect(posicionPanel(botonEn(342))).toEqual({ top: 58, left: 342, paddingTop: 8 });
  });

  it("lo empuja hacia dentro cuando el botón está pegado al borde derecho", () => {
    // Botón a 1200: 1200 + 256 = 1456 > 1280, se saldría de la pantalla.
    const pos = posicionPanel(botonEn(1200)) as { left: number };
    expect(pos.left).toBe(1280 - ANCHO_PANEL - MARGEN);
    expect(pos.left + ANCHO_PANEL).toBeLessThanOrEqual(1280);
  });

  it("respeta el margen izquierdo en pantallas estrechas", () => {
    Object.defineProperty(window, "innerWidth", { value: 240, configurable: true });
    const pos = posicionPanel(botonEn(4)) as { left: number };
    expect(pos.left).toBe(MARGEN);
  });

  it("no revienta si todavía no hay botón montado", () => {
    expect(posicionPanel(null)).toEqual({ top: -9999, left: -9999 });
  });
});
