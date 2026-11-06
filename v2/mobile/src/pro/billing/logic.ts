import type { ProSectionId, ProVerticalId } from "../../../../shared/pro/types";
import {
  PRO_ENGINE_GAINS,
  PRO_IAP_TIERS,
  PRO_TRIAL_DAYS,
  PRO_VERTICAL_TIER,
  isFreeSection,
  tierForProduct,
  type ProIapTier,
} from "../../../../shared/pro/iap";
import { PRO_VERTICALS } from "../../../../shared/pro/verticals";

/**
 * Reglas puras de Franky Pro de pago en la app: qué devuelve el servidor,
 * cuántos días de prueba quedan, qué sección lleva candado y qué se enseña en
 * el paywall. Sin React ni módulos nativos, para poder probarlas con vitest.
 */

export type ProAccessStatus = "trialing" | "active" | "billing_retry" | "grace" | "expired" | "revoked" | "refunded";

export type ProAccess = {
  pro: boolean;
  status: ProAccessStatus | null;
  tier: ProIapTier | null;
  productId: string | null;
  expiresAt: string | null;
  isTrial: boolean;
  trialEligible: boolean;
  /** Pro heredado del dueño o administrador del espacio (no es tuyo). */
  viaTeam?: boolean;
};

const STATUSES: ProAccessStatus[] = ["trialing", "active", "billing_retry", "grace", "expired", "revoked", "refunded"];

/**
 * Traduce el jsonb de get_my_pro_access (o la respuesta de
 * /api/apple/pro/verify, que puede venir envuelta en { access }). Si no tiene
 * la forma esperada devuelve null: acceso desconocido, sin candados.
 */
export function parseProAccess(raw: unknown): ProAccess | null {
  if (!raw || typeof raw !== "object") return null;
  const wrapped = (raw as { access?: unknown }).access;
  const r = (wrapped && typeof wrapped === "object" ? wrapped : raw) as Record<string, unknown>;
  if (typeof r.pro !== "boolean") return null;
  const status = typeof r.status === "string" && (STATUSES as string[]).includes(r.status) ? (r.status as ProAccessStatus) : null;
  const productId = typeof r.product_id === "string" ? r.product_id : null;
  const tier = typeof r.tier === "string" && r.tier in PRO_IAP_TIERS ? (r.tier as ProIapTier) : productId ? tierForProduct(productId) : null;
  const expiresAt = typeof r.expires_at === "string" && !Number.isNaN(Date.parse(r.expires_at)) ? r.expires_at : null;
  return {
    pro: r.pro,
    status,
    tier,
    productId,
    expiresAt,
    isTrial: r.is_trial === true,
    // Si el servidor no lo dice, se ofrece la prueba: Apple decide al comprar.
    trialEligible: r.trial_eligible !== false,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días de prueba que quedan (redondeando hacia arriba) o null si no está en prueba. */
export function trialDaysLeft(access: ProAccess | null, now: number): number | null {
  if (!access || !access.pro || !access.isTrial || !access.expiresAt) return null;
  const left = Date.parse(access.expiresAt) - now;
  if (!(left > 0)) return null;
  return Math.min(Math.ceil(left / DAY_MS), PRO_TRIAL_DAYS);
}

export function tierForVertical(vertical: ProVerticalId): ProIapTier | null {
  return PRO_VERTICAL_TIER[vertical] ?? null;
}

export function productForVertical(vertical: ProVerticalId): string | null {
  const tier = tierForVertical(vertical);
  return tier ? PRO_IAP_TIERS[tier].productId : null;
}

/**
 * ¿Lleva candado esta sección? Solo en negocios reales, con el acceso ya
 * confirmado por el servidor y sin Pro. Las demos van completas, las
 * secciones del escaparate gratis nunca se cierran y la universidad (contrato
 * anual, sin App Store) tampoco.
 */
export function isSectionLocked(input: { demo: boolean; access: ProAccess | null; section: ProSectionId; vertical: ProVerticalId }): boolean {
  if (input.demo || !input.access || coversVertical(input.access, input.vertical)) return false;
  if (!tierForVertical(input.vertical)) return false;
  return !isFreeSection(input.section);
}

/**
 * ¿El Pro que tiene esta cuenta sirve para este sector? Cada sector necesita
 * al menos su nivel de precio: el plan de 19 € no abre una discoteca (49 €).
 * El acceso que llega por el equipo no trae nivel y se acepta tal cual.
 */
export function coversVertical(access: ProAccess | null, vertical: ProVerticalId): boolean {
  if (!access?.pro) return false;
  const need = tierForVertical(vertical);
  if (!need || access.viaTeam || !access.tier) return true;
  return PRO_IAP_TIERS[access.tier].catalogEuros >= PRO_IAP_TIERS[need].catalogEuros;
}

export type PlanStrip = { kind: "free"; trialEligible: boolean } | { kind: "trial"; days: number };

/** Franja de Hoy: plan gratis, días de prueba o nada si ya es Pro de pago. */
export function planStrip(input: { demo: boolean; access: ProAccess | null; vertical: ProVerticalId; now: number }): PlanStrip | null {
  const { demo, access, vertical, now } = input;
  if (demo || !access || !tierForVertical(vertical)) return null;
  if (!coversVertical(access, vertical)) return { kind: "free", trialEligible: access.trialEligible };
  const days = trialDaysLeft(access, now);
  return days === null ? null : { kind: "trial", days };
}

export function planStripText(strip: PlanStrip): string {
  if (strip.kind === "trial") return strip.days === 1 ? "Prueba Pro: te queda 1 día" : `Prueba Pro: te quedan ${strip.days} días`;
  return strip.trialEligible ? `Plan gratis · Prueba Pro ${PRO_TRIAL_DAYS} días gratis` : "Plan gratis · Pásate a Pro";
}

/** Lo que tiene cualquier negocio sin pagar: el escaparate básico. */
export const FREE_SHOWCASE: string[] = [
  "Tu ficha pública en Franky",
  "Apareces para los estudiantes de tu zona",
  "Respondes a las peticiones que te llegan en Hoy",
  "Validas la Franky Card en tu mostrador",
];

/** Lo que gana ese sector con Pro: las herramientas del motor y sus promesas. */
export function proGains(vertical: ProVerticalId): string[] {
  const v = PRO_VERTICALS[vertical];
  const seen = new Set<string>();
  return [...PRO_ENGINE_GAINS[v.engine], ...v.promises].filter((line) => {
    const key = line.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Texto de renovación que Apple exige junto al botón de compra. */
export function renewalNotice(price: string, withTrial: boolean): string {
  const renew =
    "La suscripción se renueva automáticamente cada mes hasta que la canceles en Ajustes > tu nombre > Suscripciones, al menos 24 horas antes de que acabe el periodo.";
  if (!withTrial) return `${price} al mes. ${renew}`;
  return `${PRO_TRIAL_DAYS} días gratis, después ${price} al mes. ${renew} Si cancelas durante la prueba no se te cobra.`;
}

export type PurchaseErrorKind = "cancelled" | "pending" | "failed";

/** Clasifica un error de StoreKit: cancelar no es un fallo y no se avisa. */
export function purchaseErrorKind(error: unknown): PurchaseErrorKind {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const normalized = code.toLowerCase().replace(/^e_/, "").replace(/_/g, "-");
  if (normalized === "user-cancelled" || normalized === "usercancelled") return "cancelled";
  if (normalized === "deferred-payment" || normalized === "pending") return "pending";
  return "failed";
}

/** Mensaje en claro para los errores del servidor al verificar la compra. */
export function verifyErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "pro_subscription_owner_conflict":
      return "Esta suscripción ya está asociada a otra cuenta de Franky.";
    case "pro_subscription_environment_mismatch":
      return "Esta compra es de un entorno de pruebas distinto.";
    case "unauthorized":
    case "session_required":
      return "Tu sesión ha caducado. Vuelve a entrar e inténtalo de nuevo.";
    default:
      return "No hemos podido confirmar la compra. Pulsa Restaurar compras en unos minutos.";
  }
}
