import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase-server";
import { sanitizeNext, withNext, isProOnboardingNext } from "@/lib/safe-next";
import { isCrushPartyEntry } from '@/lib/crush-party-route';
import { growthSignupMetadata } from '@/lib/growth-attribution';

const ATTRIBUTION_COOKIE = "franky_attribution";

type AttributionPayload = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  signup_referrer?: string;
  signup_landing_path?: string;
};

function parseAttributionCookie(raw: string | undefined): AttributionPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as AttributionPayload;
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch {
    return null;
  }
}

async function applyAttributionIfPresent(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ATTRIBUTION_COOKIE)?.value;
  const payload = parseAttributionCookie(raw);
  if (!payload) return;
  try {
    await supabase.rpc("set_signup_attribution", {
      p_utm_source: payload.utm_source ?? "",
      p_utm_medium: payload.utm_medium ?? "",
      p_utm_campaign: payload.utm_campaign ?? "",
      p_utm_content: payload.utm_content ?? "",
      p_utm_term: payload.utm_term ?? "",
      p_referrer: payload.signup_referrer ?? "",
      p_landing_path: payload.signup_landing_path ?? "",
    });
  } catch {
    // Attribution es best-effort; un fallo aquí no debe romper el login.
  }
}

function redirectAndClearCookie(target: string) {
  const response = NextResponse.redirect(target);
  response.cookies.set(ATTRIBUTION_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Destino post-login (p. ej. /crush desde el cartel). Saneado para evitar
  // open redirects. Se arrastra a través del onboarding para los usuarios nuevos.
  const next = sanitizeNext(searchParams.get("next"));
  const failed = () => {
    const url = new URL(isCrushPartyEntry(next) ? next : '/login', origin);
    url.searchParams.set('error', 'callback_failed');
    if (!isCrushPartyEntry(next)) url.searchParams.set('next', next);
    return NextResponse.redirect(url);
  };

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if user needs onboarding
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return failed();
      if (user) {
        const profileResult = await supabase
          .from("profiles")
          .select("onboarding_completed, role")
          .eq("id", user.id)
          .maybeSingle();
        if (profileResult.error) return failed();
        let profile = profileResult.data;

        // If profile row is missing (trigger may have failed), create a minimal one
        // with onboarding_completed=false so the user gets sent through onboarding once.
        if (!profile) {
          // This server helper inserts only when absent. A concurrent login
          // must never overwrite an existing profile or reset its onboarding.
          const repaired = await supabase.rpc('ensure_my_profile');
          if (repaired.error) return failed();
          const reloaded = await supabase.from('profiles').select('onboarding_completed, role').eq('id', user.id).maybeSingle();
          if (reloaded.error || !reloaded.data) return failed();
          profile = reloaded.data;
        }

        await applyAttributionIfPresent(supabase);
        const referral = growthSignupMetadata(request.headers.get('cookie'));
        if (Object.keys(referral).length) {
          // This RPC validates account age, unfinished onboarding and opaque touches.
          // Existing users can never be attributed retroactively.
          await supabase.rpc('growth_claim_referral', {
            p_code: referral.growth_explicit_code ?? null,
            p_first: referral.growth_first_touch ?? null,
            p_last: referral.growth_last_touch ?? null,
          });
        }

        if (!profile.onboarding_completed && !isCrushPartyEntry(next) && !isProOnboardingNext(next)) {
          return redirectAndClearCookie(`${origin}${withNext("/onboarding", next)}`);
        }

        // Conserva el destino solicitado, también al volver a un sector.
        if (profile.role === "propietario" && next === "/") {
          return redirectAndClearCookie(`${origin}/propietario/dashboard`);
        }
      }

      return redirectAndClearCookie(`${origin}${next}`);
    }
  }

  // Return to login with error
  return failed();
}
