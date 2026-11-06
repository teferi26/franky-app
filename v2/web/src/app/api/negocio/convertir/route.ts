import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Convierte la cuenta ya existente del usuario en cuenta de propietario.
 *
 * Caso real: un empresario se registró con Google (o como estudiante) y ahora
 * quiere el panel de inmobiliaria. En vez de obligarle a crear otra cuenta,
 * esta ruta le cambia el rol en el servidor.
 *
 * Solo asciende 'user' -> 'propietario'. Cualquier otro rol (admin, analyst,
 * university_admin, o ya propietario) se deja tal cual: esos roles se
 * gestionan desde el panel de admin y aquí no se toca ninguno de ellos.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = await rateLimit(req, { key: "negocio-convertir", limit: 5, windowMs: 60 * 60_000 });
  if (!rl.ok) return rl.response;

  const admin = createAdminSupabase();
  const { data: profile, error: readErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (readErr || !profile) {
    return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
  }

  if (profile.role === "propietario") {
    return NextResponse.json({ ok: true, already: true });
  }
  if (profile.role !== "user") {
    // admin/analyst/university_admin: roles de staff que no deben perderse por
    // una conversión (el admin además es único e intransferible, migración
    // 110). Mensaje concreto para que quien prueba con la cuenta de staff
    // entienda qué está pasando en vez de un "no se puede" opaco.
    const label =
      profile.role === "admin"
        ? "de administrador"
        : profile.role === "analyst"
        ? "de analista"
        : "de gestor de universidad";
    return NextResponse.json(
      {
        error:
          `Estás con tu cuenta ${label} y esa no se convierte (perderías el panel). ` +
          "Entra con una cuenta normal, o crea una nueva de propietario desde esta misma página cerrando sesión.",
      },
      { status: 403 }
    );
  }

  // onboarding_completed en true: si venía a publicar pisos, el wizard de
  // estudiante deja de interponerse.
  const { error: updErr } = await admin
    .from("profiles")
    .update({ role: "propietario", onboarding_completed: true })
    .eq("id", user.id)
    .eq("role", "user");

  if (updErr) {
    console.error("[negocio/convertir] update failed:", updErr.message);
    return NextResponse.json({ error: "No se pudo convertir la cuenta" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
