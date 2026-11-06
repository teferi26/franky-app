"use client";

import type { ProData, ProVerticalId } from "./types";
import { buildDemo } from "./demo";
import { demoSpaceId, verticalFromPublicSlug } from "./verticals";
import { localDate } from "./format";

/**
 * Puente entre la ficha pública de un negocio de demostración (/n/<slug>) y
 * su app de Franky Pro (/pro/demo-...). Lo que hace el "estudiante" en la
 * ficha se guarda en el mismo almacenamiento de la sesión que lee la app del
 * negocio, así que la reserva aparece en su agenda al momento. Así se enseña
 * en una visita comercial cómo se conectan los dos lados.
 */
function key(spaceId: string, now: Date) {
  return `franky-pro:${spaceId}:${localDate(now)}:v1`;
}

export function readDemo(vertical: ProVerticalId, now = new Date()): ProData {
  const spaceId = demoSpaceId(vertical);
  try {
    const raw = window.sessionStorage.getItem(key(spaceId, now));
    if (raw) return JSON.parse(raw) as ProData;
  } catch {
    // Sin almacenamiento: se genera de nuevo.
  }
  return buildDemo(vertical, now);
}

export function writeDemo(vertical: ProVerticalId, data: ProData, now = new Date()) {
  try {
    window.sessionStorage.setItem(key(demoSpaceId(vertical), now), JSON.stringify(data));
  } catch {
    // Sin almacenamiento: el cambio solo vive en esta pantalla.
  }
}

export function mutateDemo(vertical: ProVerticalId, fn: (d: ProData) => ProData): ProData {
  const now = new Date();
  const next = fn(readDemo(vertical, now));
  writeDemo(vertical, next, now);
  return next;
}

/** Busca qué negocio de demostración tiene ese slug público. */
export function findDemoBySlug(slug: string): { vertical: ProVerticalId; data: ProData } | null {
  const vertical = verticalFromPublicSlug(slug);
  return vertical ? { vertical, data: readDemo(vertical) } : null;
}
