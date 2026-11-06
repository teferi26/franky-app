import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase-server";
import { validateBody, uuid } from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  tenancy_id: uuid,
  accept: z.boolean(),
});

export async function POST(req: Request) {
  const rl = await rateLimit(req, { key: "tenancy-respond", limit: 30, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.response;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await validateBody(req, schema);
  if (body instanceof NextResponse) return body;

  const { data, error } = await supabase.rpc("respond_tenancy", {
    p_tenancy_id: body.tenancy_id,
    p_accept: body.accept,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json(data ?? { ok: true });
}
