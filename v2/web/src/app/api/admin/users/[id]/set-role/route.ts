import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminRequest, adminJson } from '@/lib/admin-request';
import { createAdminSupabase } from "@/lib/supabase-admin";
import { validateBody, uuid } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Convierte un usuario en analista (solo lectura del panel) o lo revierte a
 * usuario normal. SOLO admin.
 *
 * Por qué con service-role y no con una RPC bajo la sesión del admin:
 * la BD de producción tiene un guard post-incidente que prohíbe cambiar
 * `role` desde cualquier sesión de usuario (solo lo permite la service_role).
 * Es deliberado. Por eso TODO cambio privilegiado del panel (crear
 * propietario, hard-delete) verifica al admin en la ruta y luego escribe con
 * el cliente service-role. Esta ruta sigue el mismo patrón: la autorización
 * vive aquí (requireAdmin + validaciones), la escritura la hace el backend.
 */
const schema = z.object({ role: z.enum(["analyst", "user"]) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Autorización: el que llama tiene que ser admin (sesión propia).
  const identity = await requireAdminRequest(req);
  if (identity instanceof NextResponse) return identity;
  const { user } = identity;

  const { id: targetUserId } = await params;
  if (!uuid.safeParse(targetUserId).success) {
    return adminJson({ error: "ID de usuario no válido" }, { status: 400 });
  }

  const body = await validateBody(req, schema);
  if (body instanceof NextResponse) return body;

  if (targetUserId === user.id) {
    return adminJson({ error: "No puedes cambiar tu propio rol" }, { status: 400 });
  }

  // 2. Validaciones sobre el objetivo (con service-role, que ve todas las filas).
  const admin = createAdminSupabase();
  const { data: target } = await admin
    .from("profiles").select("id, role, email").eq("id", targetUserId).maybeSingle();
  if (!target) {
    return adminJson({ error: "Usuario no encontrado" }, { status: 404 });
  }
  if (target.role === "admin") {
    // El trigger de BD también lo bloquea; aquí damos un error legible.
    return adminJson({ error: "La cuenta admin no se puede tocar" }, { status: 400 });
  }
  if (target.role === "university_admin") {
    return adminJson(
      { error: "Este usuario gestiona una universidad: retira antes esa gestión" },
      { status: 400 }
    );
  }

  // 3. Cambio de rol (service-role salta el guard de role y la RLS).
  const { error: upErr } = await admin
    .from("profiles")
    .update({ role: body.role })
    .eq("id", targetUserId);
  if (upErr) {
    console.error("[users/set-role] update error:", upErr);
    return adminJson({ error: "No se pudo cambiar el rol" }, { status: 500 });
  }

  // 4. Auditoría (best-effort: nunca bloquea la operación).
  try {
    await admin.from("admin_actions").insert({
      actor_id: user.id,
      actor_email: user.email ?? null,
      action: body.role === "analyst" ? "grant_analyst" : "revoke_analyst",
      target_table: "profiles",
      target_id: targetUserId,
      changes: { old_role: target.role, new_role: body.role, email: target.email },
    });
  } catch (e) {
    console.error("[users/set-role] audit insert failed:", e);
  }

  return adminJson({
    ok: true,
    user_id: targetUserId,
    old_role: target.role,
    new_role: body.role,
  });
}
