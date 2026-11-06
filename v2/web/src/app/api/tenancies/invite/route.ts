import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase-server";
import { validateBody, uuid } from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  accommodation_id: uuid,
  tenant_id: uuid,
  room_label: z.string().max(80).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(req: Request) {
  const rl = await rateLimit(req, { key: "tenancy-invite", limit: 30, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.response;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await validateBody(req, schema);
  if (body instanceof NextResponse) return body;

  const { data, error } = await supabase.rpc("invite_tenant", {
    p_accommodation_id: body.accommodation_id,
    p_tenant_id: body.tenant_id,
    p_room_label: body.room_label ?? null,
    p_start_date: body.start_date ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, tenancy_id: data });
}
