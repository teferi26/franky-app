import { isDemoPaymentActor } from '@/lib/payment-demo-guard';
import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabase } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";
import { getPayoutStatus } from "@/lib/connect";

/**
 * Estado de cobros del usuario que llama: "none" | "pending" | "active".
 *
 * Existe para que los formularios que ponen precio a algo (crear/editar evento
 * en web y en la app) puedan decir la verdad ANTES de publicar en vez de
 * prometer un paso posterior. Acepta cookies (web) o Authorization: Bearer
 * (app móvil), igual que el resto de rutas de Connect.
 *
 * Lectura en vivo desde Stripe si la cuenta existe y aún no está lista, de modo
 * que al volver del alta el usuario vea "activos" sin esperar al webhook.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createRequestSupabase(req);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (await isDemoPaymentActor(user.id)) return NextResponse.json({ error: 'Esta cuenta es de demostración. Los servicios de cobro reales están desactivados.' }, { status: 403 });

    // Cada consulta puede costar una llamada a Stripe mientras la cuenta no
    // esté activa: se limita por usuario para que un cliente en bucle no gaste
    // la cuota de la plataforma.
    const rl = await rateLimit(req, {
      key: "connect-status",
      limit: 30,
      windowMs: 60_000,
      subject: user.id,
    });
    if (!rl.ok) return rl.response;

    const status = await getPayoutStatus(user.id, { live: true });
    return NextResponse.json({ status });
  } catch (error) {
    console.error("Connect status error:", error);
    return NextResponse.json(
      { error: "No se pudo comprobar el estado de tus cobros" },
      { status: 500 }
    );
  }
}
