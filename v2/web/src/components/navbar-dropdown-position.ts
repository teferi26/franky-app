import type { CSSProperties } from "react";

/**
 * Coloca el contenedor del desplegable pegado al borde inferior de su botón,
 * en coordenadas de ventana, y lo empuja hacia dentro si se saliera por la
 * derecha. Se calcula al abrir: el usuario no puede desplazar la página con el
 * menú abierto porque el propio menú se cierra al mover el ratón fuera.
 *
 * OJO: pegado, sin hueco. La separación visual de 8px la pone un paddingTop
 * DENTRO del contenedor, para que ese espacio siga recibiendo el ratón. Antes
 * el hueco era aire de verdad (top: r.bottom + 8) y, como el panel vive en un
 * portal (no es hijo del botón), al cruzarlo saltaba el mouseleave del botón y
 * el menú se cerraba antes de poder llegar a ninguna opción.
 */
export function posicionPanel(boton: HTMLButtonElement | null): CSSProperties {
  if (!boton) return { top: -9999, left: -9999 };
  const r = boton.getBoundingClientRect();
  const ANCHO = 256; // w-64
  const MARGEN = 12;
  const maxIzq = window.innerWidth - ANCHO - MARGEN;
  return {
    top: r.bottom,
    left: Math.max(MARGEN, Math.min(r.left, maxIzq)),
    paddingTop: 8,
  };
}
