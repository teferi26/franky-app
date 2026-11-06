import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase-server";
import { validateBody, uuid } from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";

// GET /api/tenancies?accommodation_id=...  → tenancies of a flat (owner only, via RLS)
export async function GET(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const accommodationId = new URL(req.url).searchParams.get("accommodation_id");
  if (!accommodationId || !uuid.safeParse(accommodationId).success) {
    return NextResponse.json({ error: "accommodation_id requerido" }, { status: 400 });
  }

  const { data: rows, error } = await supabase
    .from("tenancies")
    .select("id, tenant_id, room_label, status, is_public, start_date, confirmed_at, created_at")
    .eq("accommodation_id", accommodationId)
    .in("status", ["pending_confirmation", "active"])
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const tenantIds = [...new Set((rows ?? []).map((r) => r.tenant_id))];
  const profilesById = new Map<string, Record<string, unknown>>();
  if (tenantIds.length > 0) {
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, full_name, avatar_url, career, university_course")
      .in("id", tenantIds);
    for (const p of profiles ?? []) profilesById.set(p.id as string, p);
  }

  const tenancies = (rows ?? []).map((r) => ({ ...r, tenant: profilesById.get(r.tenant_id) ?? null }));
  return NextResponse.json({ tenancies });
}

// PATCH /api/tenancies  → set visibility (tenant only)
const patchSchema = z.object({ tenancy_id: uuid, is_public: z.boolean() });

export async function PATCH(req: Request) {
  const rl = await rateLimit(req, { key: "tenancy-visibility", limit: 30, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.response;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await validateBody(req, patchSchema);
  if (body instanceof NextResponse) return body;

  const { data, error } = await supabase.rpc("set_tenancy_visibility", {
    p_tenancy_id: body.tenancy_id,
    p_is_public: body.is_public,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? { ok: true });
}

// DELETE /api/tenancies?tenancy_id=...  → end a tenancy (owner or tenant)
export async function DELETE(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenancyId = new URL(req.url).searchParams.get("tenancy_id");
  if (!tenancyId || !uuid.safeParse(tenancyId).success) {
    return NextResponse.json({ error: "tenancy_id requerido" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("end_tenancy", { p_tenancy_id: tenancyId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? { ok: true });
}
