"use client";

import * as React from "react";
import { ArrowRight, CloudRain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import { dayLabel, localDate, localMinutes, minutesToLabel } from "@/lib/pro/format";
import { courtsOps } from "@/lib/pro/courts-base";
import { applyRain, rainPlan, type RainMove } from "@/lib/pro/courts-ops";
import { Drawer, Empty, Pill } from "../../kit";
import { WhatsAppLink, firstName } from "./booking-ops";

/**
 * Botón Llueve: todas las reservas en pistas exteriores que aún no han
 * empezado, con la cubierta libre más cercana en hora. Un toque mueve lo que
 * cabe y cancela sin coste lo que no, y cada jugador tiene su aviso escrito.
 */
export function RainDrawer({
  date,
  open,
  onClose,
}: {
  date: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  // Tras aplicar, la lista se congela para poder avisar a cada jugador.
  const [done, setDone] = React.useState<RainMove[] | null>(null);
  React.useEffect(() => setDone(null), [open, date]);
  const live = React.useMemo(
    () => (open ? rainPlan(data, date, date === today ? localMinutes(now) : 0) : []),
    [open, data, date, today, now],
  );
  const plan = done ?? live;
  const covered = courtsOps(data).coveredIds;
  const moved = plan.filter((m) => m.to);
  const cancelled = plan.filter((m) => !m.to);
  const name = (id?: string) => data.resources.find((r) => r.id === id)?.name ?? "";
  const phoneOf = (bookingId: string) => {
    const b = data.bookings.find((x) => x.id === bookingId);
    return data.clients.find((c) => c.id === b?.clientId)?.phone;
  };

  const apply = () => {
    update("court.rain", (d) => applyRain(d, date, plan));
    setDone(plan);
    toast.success(
      "Hecho",
      `${moved.length} ${moved.length === 1 ? "reserva movida" : "reservas movidas"} a cubierta${cancelled.length ? ` y ${cancelled.length} ${cancelled.length === 1 ? "cancelada" : "canceladas"} sin coste` : ""}. Avísales desde aquí.`,
    );
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Llueve"
      description={`${dayLabel(`${date}T12:00:00Z`)}. Reservas en pistas exteriores que aún no han empezado.`}
      wide
      footer={
        plan.length && !done ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cerrar</Button>
            <Button variant="dark" onClick={apply}>
              {moved.length ? `Mover ${moved.length} a cubierta` : "Cancelar sin coste"}
              {moved.length && cancelled.length ? ` y cancelar ${cancelled.length}` : ""}
            </Button>
          </>
        ) : (
          <Button variant="dark" onClick={onClose}>Cerrar</Button>
        )
      }
    >
      {!covered.length ? (
        <Empty
          icon={CloudRain}
          title="Marca tus pistas cubiertas"
          body="En Normas indica qué pistas están cubiertas y aquí verás a dónde mover cada reserva cuando llueva."
        />
      ) : !plan.length ? (
        <Empty
          icon={CloudRain}
          title="Nada que mover"
          body="No quedan reservas en pistas exteriores este día. Si llueve, ya está todo a cubierto."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            {done ? "Hecho. Ahora avisa a cada uno con su mensaje ya escrito. " : ""}
            {moved.length} caben en cubierta{cancelled.length ? `; ${cancelled.length} no tienen hueco y se cancelan sin coste` : ""}.{done ? "" : " Revisa y confirma abajo."}
          </p>
          <ul className="flex flex-col gap-2.5">
            {plan.map((m) => {
              const to = m.to;
              const when = to ? minutesToLabel(to.from) : minutesToLabel(m.from);
              return (
                <li key={m.bookingId} className="rounded-2xl border border-border p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.clientName}</span>
                    {to ? (
                      <Pill tone="success">A cubierta</Pill>
                    ) : (
                      <Pill tone="warning">Sin hueco: se cancela gratis</Pill>
                    )}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-text-muted tabular">
                    {name(m.fromResourceId)} {minutesToLabel(m.from)}
                    {to ? (
                      <>
                        <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.9} />
                        <span className="font-semibold text-text-primary">
                          {name(to.resourceId)} {minutesToLabel(to.from)}
                        </span>
                        {to.from !== m.from ? <span>(cambia la hora)</span> : null}
                      </>
                    ) : null}
                  </p>
                  <div className="mt-2">
                    <WhatsAppLink
                      phone={phoneOf(m.bookingId)}
                      label={`Avisar a ${firstName(m.clientName)}`}
                      message={
                        to
                          ? `Hola ${firstName(m.clientName)}, por la lluvia te pasamos a la ${name(to.resourceId).toLowerCase()}, que está cubierta, a las ${when}. Mismo precio. ¡Nos vemos en ${data.space.name}!`
                          : `Hola ${firstName(m.clientName)}, por la lluvia no podemos mantener tu partido de las ${when} en ${data.space.name}. Lo cancelamos sin coste. Si quieres, te buscamos otra hora.`
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Drawer>
  );
}
