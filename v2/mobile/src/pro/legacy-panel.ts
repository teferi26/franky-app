/**
 * Paso al panel anterior de espacios. Desde el 25-sep los negocios de ocio
 * entran siempre en Franky Pro; el panel anterior solo se abre cuando Franky
 * Pro lo pide expresamente (sectores que aún no tienen modo real, cuenta,
 * equipo o facturación). Dura hasta que se cierra la app.
 */
const legacySpaces = new Set<string>();
let accountPanel = false;

export function allowLegacyPanel(spaceId: string) {
  legacySpaces.add(spaceId);
}

export function isLegacyPanelAllowed(spaceId: string) {
  return legacySpaces.has(spaceId);
}

export function allowAccountPanel() {
  accountPanel = true;
}

export function isAccountPanelAllowed() {
  return accountPanel;
}
