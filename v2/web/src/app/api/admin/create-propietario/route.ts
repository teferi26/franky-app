import { NextResponse } from "next/server";
import { requireAdminRequest, adminJson } from '@/lib/admin-request';
import { createAdminSupabase } from "@/lib/supabase-admin";
import { createPropietarioSchema } from "@/lib/validations";
import { validateBody } from '@/lib/api-helpers';

export async function POST(request: Request) {
  // Verify the caller is an admin
  const identity = await requireAdminRequest(request);
  if (identity instanceof NextResponse) return identity;
  const { user, supabase } = identity;

  const parsed = await validateBody(request, createPropietarioSchema, { maxBytes: 4096 });
  if (parsed instanceof NextResponse) return parsed;
  const { email, name, role } = parsed;
  const roleLabel = role === "analyst" ? "analista" : "propietario";

  const adminSupabase = createAdminSupabase();

  // Create auth user with service role (generates a random password, user will use password reset)
  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name },
  });

  if (authError) {
    if (authError.message.includes("already been registered")) {
      return adminJson({ error: 'Ya existe una cuenta con ese correo. Revisa su rol desde Usuarios; no se ha modificado.' }, { status: 409 });
    }
    return adminJson({ error: 'No se ha podido crear la cuenta. Comprueba el correo y vuelve a intentarlo.' }, { status: 400 });
  }

  // Update the profile to set the requested role
  if (authData.user) {
    const { data: updated, error: updateError } = await adminSupabase
      .from("profiles")
      .update({
        role,
        full_name: name,
        onboarding_completed: true,
      })
      .eq("id", authData.user.id).eq('role', 'user').not('is_discarded', 'is', true).select('id');
    if (updateError || updated?.length !== 1) return adminJson({ error: 'La cuenta se ha creado, pero no se ha confirmado su rol. Revísala en Usuarios antes de repetir la operación.' }, { status: 503 });

    const { error: auditError } = await supabase.rpc("log_admin_action", {
      p_admin_id: user.id,
      p_action: role === "analyst" ? "create_analyst" : "create_propietario",
      p_target_type: "user",
      p_target_id: authData.user.id,
      p_details: { email, name, role },
    });
    if (auditError) return adminJson({ error: 'La cuenta y su rol están creados, pero no se ha confirmado la auditoría. Revisa Usuarios antes de repetir la operación.' }, { status: 503 });
  } else {
    return adminJson({ error: 'No se ha confirmado la creación. Revisa Usuarios antes de repetir la operación.' }, { status: 503 });
  }

  return adminJson({
    message: `${roleLabel === "analista" ? "Analista" : "Propietario"} creado correctamente`,
  });
}
