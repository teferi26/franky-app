import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { reportSchema } from "@/lib/validations";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parsed = reportSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || "Datos inválidos";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { reported_user_id, context, reason } = parsed.data;

  if (reported_user_id === user.id) {
    return NextResponse.json({ error: "No puedes reportarte a ti mismo" }, { status: 400 });
  }

  const { error } = await supabase.from("user_reports").insert({
    reporter_id: user.id,
    reported_user_id,
    context,
    reason,
  });

  if (error) {
    if (error.message.includes("rate limit") || error.message.includes("5 reportes")) {
      return NextResponse.json({ error: "Has alcanzado el límite de reportes (5 por día)" }, { status: 429 });
    }
    return NextResponse.json({ error: "Error al enviar el reporte" }, { status: 500 });
  }

  return NextResponse.json({ message: "Reporte enviado correctamente" });
}
