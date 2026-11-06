import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api-helpers";
import { createRequestSupabase } from "@/lib/supabase-server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Buzón de la plataforma: lo que se escribe en /contacto (y lo que mande la app
 * móvil) acaba aquí.
 *
 * Antes esta ruta no existía y el formulario era
 * `<form action="mailto:contacto@franky.es">`, que en un navegador moderno no
 * hace nada útil: todo lo que escribía la gente se perdía sin dejar rastro.
 *
 * Guarda en platform_messages y el trigger de la migración 167 se encarga de
 * avisar por correo a admin y analistas. Se guarda SIEMPRE, aunque el correo
 * falle: perder el aviso es malo, perder el mensaje es peor.
 */
export const dynamic = "force-dynamic";

const schema = z.object({
  nombre: z.string().trim().min(2, "Dinos tu nombre").max(120),
  email: z.string().trim().email("Ese email no parece válido").max(200),
  asunto: z.string().trim().min(3, "Ponle un asunto").max(200),
  mensaje: z.string().trim().min(10, "Cuéntanos un poco más").max(4000),
  tipo: z.enum(["contacto", "sugerencia", "fallo", "otro"]).optional().default("contacto"),
  origen: z.enum(["web", "movil", "otro"]).optional().default("web"),
  // Campo trampa: invisible para una persona, irresistible para un bot.
  web: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const body = await validateBody(req, schema);
  if (body instanceof NextResponse) return body;

  // Bot: se le responde OK para que no reintente, pero no se guarda nada.
  if (body.web && body.web.trim().length > 0) {
    return NextResponse.json({ ok: true });
  }

  // Tope por IP y por email: 5 mensajes cada 10 minutos. Suficiente para
  // cualquiera con algo que decir, molesto para quien quiera inundar el buzón.
  const porIp = await rateLimit(req, { key: "contacto-ip", limit: 5, windowMs: 10 * 60_000 });
  if (!porIp.ok) return porIp.response;
  const porEmail = await rateLimit(req, {
    key: "contacto-email",
    limit: 5,
    windowMs: 10 * 60_000,
    subject: body.email,
  });
  if (!porEmail.ok) return porEmail.response;

  // Si escribe con la sesión abierta, se guarda quién es: así se le puede
  // contestar dentro de la app y se ve su historial.
  const supabase = await createRequestSupabase(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Con service_role: la tabla admite INSERT anónimo por RLS, pero escribir por
  // aquí evita depender de esa política si mañana se endurece.
  const admin = createAdminSupabase();
  const { error } = await admin.from("platform_messages").insert({
    user_id: user?.id ?? null,
    kind: body.tipo,
    name: body.nombre,
    email: body.email,
    subject: body.asunto,
    body: body.mensaje,
    source: body.origen,
  });

  if (error) {
    console.error("[contacto] no se pudo guardar el mensaje:", error.message);
    return NextResponse.json(
      { error: "No hemos podido enviar tu mensaje. Inténtalo en unos minutos." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
