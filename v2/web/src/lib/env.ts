/**
 * Single source of truth for environment variables.
 *
 * Why this exists:
 * - Catches missing vars at boot time instead of failing with an opaque
 *   "Supabase client not configured" deep inside a request handler.
 * - Gives editor autocomplete + types for `serverEnv.X` and `clientEnv.X`.
 *
 * Two split schemas because:
 * - Anything in `clientEnv` is shipped in the browser bundle (NEXT_PUBLIC_*).
 *   It MUST NOT contain secrets.
 * - Anything in `serverEnv` only runs server-side. Accessing it from a
 *   client component would inline `undefined`.
 *
 * Rendimiento (sep-2026): este módulo lo importa `supabase-client.ts`, que a su
 * vez importa el SessionProvider del layout raíz. Al validar con zod, el
 * paquete entero de zod (unos 98 KB minificados, 30 KB gzip) viajaba en el
 * chunk compartido de TODAS las páginas, solo para comprobar que dos cadenas
 * no están vacías. La validación se hace ahora a mano: mismo comportamiento
 * (falla en arranque si faltan las variables) y cero dependencias en el
 * navegador. Las rutas de API que validan cuerpos siguen usando zod, pero eso
 * ya no toca al bundle de cliente.
 */

export type ClientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  // Optional: empty string treated as "not set" so the feature stays dark.
  NEXT_PUBLIC_GA_ID?: string;
  NEXT_PUBLIC_ADSENSE_CLIENT?: string;
};

export type ServerEnv = {
  SUPABASE_SERVICE_ROLE_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  // Separate signing secret for the V2 Connect thin-events endpoint
  // (/api/stripe/connect/webhook). Distinct from STRIPE_WEBHOOK_SECRET.
  STRIPE_CONNECT_WEBHOOK_SECRET?: string;
  STRIPE_HOUSING_PRICE_ID?: string;
  STRIPE_LEISURE_PRICE_ID?: string;
  // Plan Usuario Propietario: 80€/mes y trimestre inicial 192€ (-20%).
  STRIPE_OWNER_MONTHLY_PRICE_ID?: string;
  STRIPE_OWNER_QUARTERLY_PRICE_ID?: string;
  STRIPE_PREMIUM_MONTHLY_PRICE_ID?: string;
  STRIPE_PREMIUM_YEARLY_PRICE_ID?: string;
  STRIPE_PRO_MONTHLY_PRICE_ID?: string;
  STRIPE_PRO_YEARLY_PRICE_ID?: string;
  GOOGLE_AI_API_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  // Secreto compartido entre el trigger de Postgres (dispatch_email) y la ruta
  // /api/internal/notify-email. Debe coincidir con app.notify_email_secret.
  NOTIFY_EMAIL_SECRET?: string;
  // Secreto de los Vercel Cron Jobs (Vercel lo manda como Authorization:
  // Bearer <CRON_SECRET> en cada invocación). Sin él, los crons quedan
  // inactivos (fail closed en /api/cron/*).
  // Mínimo 32 chars: un secreto corto debilitaría la comparación del Bearer.
  CRON_SECRET?: string;
  // Marketplace commission percentages (e.g. "10" = 10%). Optional: defaults
  // live in lib/pricing.ts COMMISSION.
  FEE_VISIT_PCT?: string;
  FEE_RENT_PCT?: string;
  FEE_TICKET_PCT?: string;
  // Rate limit distribuido (lib/rate-limit.ts). Si faltan, el rate limit es
  // por instancia (fallback en memoria), no un fallo duro: opcionales.
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
};

/** Cadena opcional: `undefined` si no está definida o está vacía. */
function optional(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ─── Client ──────────────────────────────────────────────────────────────────
// Las referencias a process.env.NEXT_PUBLIC_* van escritas una a una y con el
// nombre literal: Next solo puede inlinearlas en el bundle del navegador así.
const rawClient = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID,
  NEXT_PUBLIC_ADSENSE_CLIENT: process.env.NEXT_PUBLIC_ADSENSE_CLIENT,
};

const clientErrors: Record<string, string> = {};
if (!rawClient.NEXT_PUBLIC_SUPABASE_URL || !isHttpUrl(rawClient.NEXT_PUBLIC_SUPABASE_URL)) {
  clientErrors.NEXT_PUBLIC_SUPABASE_URL = "Invalid url";
}
if (
  !rawClient.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  rawClient.NEXT_PUBLIC_SUPABASE_ANON_KEY.length < 20
) {
  clientErrors.NEXT_PUBLIC_SUPABASE_ANON_KEY = "String must contain at least 20 character(s)";
}

if (Object.keys(clientErrors).length > 0) {
  // Throw loud in dev/build; in production this propagates to the platform logs
  // and the deploy fails, exactly what we want.
  console.error("❌ Invalid public env vars:", clientErrors);
  throw new Error("Missing or invalid NEXT_PUBLIC_SUPABASE_* environment variables");
}

export const clientEnv: ClientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: rawClient.NEXT_PUBLIC_SUPABASE_URL as string,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: rawClient.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  NEXT_PUBLIC_GA_ID: optional(rawClient.NEXT_PUBLIC_GA_ID),
  NEXT_PUBLIC_ADSENSE_CLIENT: optional(rawClient.NEXT_PUBLIC_ADSENSE_CLIENT),
};

// ─── Server ──────────────────────────────────────────────────────────────────
// Server vars are parsed lazily because they don't exist client-side and
// importing this module from a client component would otherwise fail.
let _serverEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (_serverEnv) return _serverEnv;

  const env: ServerEnv = {
    SUPABASE_SERVICE_ROLE_KEY: optional(process.env.SUPABASE_SERVICE_ROLE_KEY),
    STRIPE_SECRET_KEY: optional(process.env.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: optional(process.env.STRIPE_WEBHOOK_SECRET),
    STRIPE_CONNECT_WEBHOOK_SECRET: optional(process.env.STRIPE_CONNECT_WEBHOOK_SECRET),
    STRIPE_HOUSING_PRICE_ID: optional(process.env.STRIPE_HOUSING_PRICE_ID),
    STRIPE_LEISURE_PRICE_ID: optional(process.env.STRIPE_LEISURE_PRICE_ID),
    STRIPE_OWNER_MONTHLY_PRICE_ID: optional(process.env.STRIPE_OWNER_MONTHLY_PRICE_ID),
    STRIPE_OWNER_QUARTERLY_PRICE_ID: optional(process.env.STRIPE_OWNER_QUARTERLY_PRICE_ID),
    STRIPE_PREMIUM_MONTHLY_PRICE_ID: optional(process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID),
    STRIPE_PREMIUM_YEARLY_PRICE_ID: optional(process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID),
    STRIPE_PRO_MONTHLY_PRICE_ID: optional(process.env.STRIPE_PRO_MONTHLY_PRICE_ID),
    STRIPE_PRO_YEARLY_PRICE_ID: optional(process.env.STRIPE_PRO_YEARLY_PRICE_ID),
    GOOGLE_AI_API_KEY: optional(process.env.GOOGLE_AI_API_KEY),
    RESEND_API_KEY: optional(process.env.RESEND_API_KEY),
    EMAIL_FROM: optional(process.env.EMAIL_FROM),
    NOTIFY_EMAIL_SECRET: optional(process.env.NOTIFY_EMAIL_SECRET),
    CRON_SECRET: optional(process.env.CRON_SECRET),
    FEE_VISIT_PCT: optional(process.env.FEE_VISIT_PCT),
    FEE_RENT_PCT: optional(process.env.FEE_RENT_PCT),
    FEE_TICKET_PCT: optional(process.env.FEE_TICKET_PCT),
    UPSTASH_REDIS_REST_URL: optional(process.env.UPSTASH_REDIS_REST_URL),
    UPSTASH_REDIS_REST_TOKEN: optional(process.env.UPSTASH_REDIS_REST_TOKEN),
  };

  const errors: Record<string, string> = {};
  if (env.SUPABASE_SERVICE_ROLE_KEY !== undefined && env.SUPABASE_SERVICE_ROLE_KEY.length < 20) {
    errors.SUPABASE_SERVICE_ROLE_KEY = "String must contain at least 20 character(s)";
  }
  if (env.CRON_SECRET !== undefined && env.CRON_SECRET.length < 32) {
    errors.CRON_SECRET = "String must contain at least 32 character(s)";
  }
  // En produccion fallamos en el arranque si faltan los secretos criticos,
  // en vez de dejar que el error aflore en la primera request real.
  if (process.env.VERCEL_ENV === "production") {
    const requiredInProd = [
      "SUPABASE_SERVICE_ROLE_KEY",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
    ] as const;
    for (const key of requiredInProd) {
      if (!env[key]) errors[key] = `${key} es obligatoria en produccion`;
    }
  }

  if (Object.keys(errors).length > 0) {
    console.error("❌ Invalid server env vars:", errors);
    throw new Error("Server env validation failed");
  }
  _serverEnv = env;
  return _serverEnv;
}
