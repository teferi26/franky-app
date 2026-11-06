import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api-helpers";

/**
 * Recolector de errores de cliente.
 *
 * La app movil lleva Sentry; la web no tenia NINGUNA monitorizacion de errores.
 * Un fallo en produccion solo se descubria si alguien se molestaba en contarlo.
 *
 * Esto no pretende sustituir a Sentry (que es el destino natural: agrupa,
 * deduplica y avisa). Es el minimo util con cero dependencias nuevas y cero
 * configuracion: el error acaba en los logs de Vercel, donde ya se puede
 * buscar y alertar. Cuando haya DSN de Sentry, esta ruta se reemplaza.
 *
 * Publica a proposito (un error puede ocurrir sin sesion), con limite por IP y
 * campos acotados para que no sirva de vertedero.
 */
export const dynamic = "force-dynamic";

const schema = z.object({
  message: z.string().trim().min(1).max(500),
  stack: z.string().max(4000).optional(),
  digest: z.string().max(120).optional(),
  path: z.string().max(300).optional(),
  // Marca de que capa vino: error de ruta, error global o excepcion suelta.
  boundary: z.enum(["route", "global", "window"]).optional(),
});

export async function POST(req: Request) {
  // 30 informes por hora e IP: suficiente para una sesion con un fallo
  // recurrente, poco para inundar los logs.
  const rl = await rateLimit(req, {
    key: "client-error",
    limit: 30,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) return rl.response;

  const parsed = await validateBody(req, schema);
  if (parsed instanceof NextResponse) return parsed;

  // Una sola linea con prefijo estable: asi se puede filtrar en los logs de
  // Vercel por "[client-error]" y montar una alerta encima.
  console.error(
    "[client-error]",
    JSON.stringify({
      message: parsed.message,
      digest: parsed.digest ?? null,
      path: parsed.path ?? null,
      boundary: parsed.boundary ?? "route",
      ua: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      stack: parsed.stack?.slice(0, 2000) ?? null,
    })
  );

  // 204: al cliente no le sirve de nada la respuesta y asi no gasta parseo.
  return new NextResponse(null, { status: 204 });
}
