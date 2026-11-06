"use client";

import { createClient } from "@/lib/supabase-client";

/**
 * Analitica de producto para la web (tabla `analytics_events`, migracion 131).
 *
 * La app movil ya emitia eventos aqui desde el ciclo 2. La web no emitia ni
 * uno: tenia Google Analytics y Metricool, que miden PAGINAS VISTAS, pero
 * ninguna medicion de embudo propia. Sin esto no se puede responder a
 * "cuantos empiezan el onboarding y cuantos lo terminan" ni "que paso del
 * registro pierde gente", que es justo lo que hay que saber para arreglarlo.
 *
 * Reglas:
 *   * Best-effort absoluto: la telemetria JAMAS rompe ni bloquea el producto.
 *   * Solo con sesion: la RLS solo deja insertar eventos propios.
 *   * Sin PII en `props`. Ids y enums, nunca nombres, emails ni texto libre
 *     escrito por el usuario.
 */

const PLATFORM = "web" as const;
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? null;

/** Eventos que emite la web. Lista cerrada para que el panel no se llene de ruido. */
export type AnalyticsEvent =
  | "screen_view"
  | "campus_mode_changed"
  // Embudo de alta
  | "signup_started"
  | "signup_submitted"
  | "signup_completed"
  | "login_submitted"
  | "login_completed"
  | "oauth_started"
  | "email_verification_sent"
  | "email_verified"
  // Onboarding
  | "onboarding_step_viewed"
  | "onboarding_step_completed"
  | "onboarding_skipped"
  | "onboarding_completed"
  // Producto
  | "fomo_preview_viewed"
  | "fomo_thread_created"
  | "crush_opened"
  | "crush_live_entry_viewed"
  | "crush_live_deck_loaded"
  | "crush_live_event_opt_in"
  | "crush_live_profile_completed"
  | "crush_live_event_opt_out"
  | "crush_live_swipe"
  | "crush_live_match_created"
  | "crush_live_chat_started"
  | "search_performed"
  | "catalog_filtered"
  | "career_viewed"
  | "scholarship_viewed"
  | "vocational_started"
  | "vocational_completed"
  | "share_card_generated"
  // Conversion
  | "cta_clicked"
  | "checkout_started"
  | "checkout_completed";

export async function track(
  name: AnalyticsEvent,
  props: Record<string, string | number | boolean | null> = {}
): Promise<void> {
  try {
    if (typeof window !== "undefined") {
      const consent = JSON.parse(localStorage.getItem("franky_cookie_consent") ?? "{}");
      if (consent.analytics !== true) return;
    }
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Sin sesion no se inserta: la RLS lo rechazaria igualmente y no queremos
    // gastar una peticion para recibir un 403.
    if (!user) return;

    await supabase.from("analytics_events").insert({
      user_id: user.id,
      name,
      props,
      platform: PLATFORM,
      app_version: APP_VERSION,
    });
  } catch {
    /* best-effort: la telemetria nunca rompe la web */
  }
}

/**
 * Version que no espera al resultado, para usar dentro de un onClick sin
 * retrasar la navegacion.
 */
export function trackFire(
  name: AnalyticsEvent,
  props: Record<string, string | number | boolean | null> = {}
): void {
  void track(name, props);
}
