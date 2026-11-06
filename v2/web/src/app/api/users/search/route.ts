import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";

// GET /api/users/search?q=...  → search students by name (public_profiles only).
// Used by owners to find a tenant to invite to a flat.
export async function GET(req: Request) {
  const rl = await rateLimit(req, { key: "users-search", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  // Escapamos los comodines de LIKE (\, %, _) para que el termino se trate como
  // texto literal y no permita enumerar el directorio de nombres con `%` o `_`.
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  // Exigimos longitud real del termino ya filtrado: si tras quitar comodines no
  // queda al menos 2 caracteres de busqueda, no consultamos.
  if (q.replace(/[%_]/g, "").trim().length < 2) return NextResponse.json({ results: [] });

  const { data, error } = await supabase
    .from("public_profiles")
    .select("id, full_name, avatar_url, career, university_course")
    .ilike("full_name", `%${escaped}%`)
    .neq("id", user.id)
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ results: data ?? [] });
}
