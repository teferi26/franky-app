import React from "react";
import { View } from "react-native";
import { ArrowRight, CloudRain } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, R, S } from "@/theme";
import { usePro } from "../../store";
import { dayLabel, localDate, localMinutes, minutesToLabel } from "../../../../../shared/pro/format";
import { courtsOps } from "../../../../../shared/pro/courts-base";
import { applyRain, rainPlan, type RainMove } from "../../../../../shared/pro/courts-ops";
import { Empty, PButton, PText, Pill, Sheet } from "../../kit";
import { WhatsAppButton, firstName } from "./booking-ops";

/**
 * Botón Llueve (versión nativa de web courts/rain-drawer.tsx): las reservas
 * de pistas exteriores que aún no han empezado pasan a la cubierta libre más
 * cercana en hora; lo que no cabe se cancela sin coste. Cada jugador tiene
 * su aviso escrito.
 */
export function RainDrawer({ date, open, onClose }: { date: string; open: boolean; onClose: () => void }) {
  const { data, update, now } = usePro();
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
    void update("court.rain", (d) => applyRain(d, date, plan));
    setDone(plan);
    toast("Hecho", {
      kind: "success",
      body: `${moved.length} ${moved.length === 1 ? "reserva movida" : "reservas movidas"} a cubierta${cancelled.length ? ` y ${cancelled.length} ${cancelled.length === 1 ? "cancelada" : "canceladas"} sin coste` : ""}. Avísales desde aquí.`,
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Llueve"
      description={`${dayLabel(`${date}T12:00:00Z`)}. Reservas en pistas exteriores que aún no han empezado.`}
      footer={
        plan.length && !done ? (
          <>
            <PButton label="Cerrar" variant="ghost" onPress={onClose} />
            <PButton
              label={`${moved.length ? `Mover ${moved.length} a cubierta` : "Cancelar sin coste"}${moved.length && cancelled.length ? ` y cancelar ${cancelled.length}` : ""}`}
              onPress={apply}
            />
          </>
        ) : (
          <PButton label="Cerrar" onPress={onClose} />
        )
      }
    >
      {!covered.length ? (
        <Empty icon={CloudRain} title="Marca tus pistas cubiertas" body="En Normas indica qué pistas están cubiertas y aquí verás a dónde mover cada reserva cuando llueva." />
      ) : !plan.length ? (
        <Empty icon={CloudRain} title="Nada que mover" body="No quedan reservas en pistas exteriores este día. Si llueve, ya está todo a cubierto." />
      ) : (
        <>
          <PText v="small">
            {`${done ? "Hecho. Ahora avisa a cada uno con su mensaje ya escrito. " : ""}${moved.length} caben en cubierta${cancelled.length ? `; ${cancelled.length} no tienen hueco y se cancelan sin coste` : ""}.`}
          </PText>
          {plan.map((m) => {
            const to = m.to;
            const when = to ? minutesToLabel(to.from) : minutesToLabel(m.from);
            return (
              <View key={m.bookingId} style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md, gap: S.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                  <PText v="h3" numberOfLines={1} style={{ flex: 1 }}>{m.clientName}</PText>
                  {to ? <Pill tone="success" label="A cubierta" /> : <Pill tone="warning" label="Sin hueco: gratis" />}
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  <PText v="small">{`${name(m.fromResourceId)} ${minutesToLabel(m.from)}`}</PText>
                  {to ? (
                    <>
                      <ArrowRight size={14} color={C.muted} />
                      <PText v="h3">{`${name(to.resourceId)} ${minutesToLabel(to.from)}`}</PText>
                    </>
                  ) : null}
                </View>
                <WhatsAppButton
                  phone={phoneOf(m.bookingId)}
                  label={`Avisar a ${firstName(m.clientName)}`}
                  message={
                    to
                      ? `Hola ${firstName(m.clientName)}, por la lluvia te pasamos a la ${name(to.resourceId).toLowerCase()}, que está cubierta, a las ${when}. Mismo precio. ¡Nos vemos en ${data.space.name}!`
                      : `Hola ${firstName(m.clientName)}, por la lluvia no podemos mantener tu partido de las ${when} en ${data.space.name}. Lo cancelamos sin coste. Si quieres, te buscamos otra hora.`
                  }
                />
              </View>
            );
          })}
        </>
      )}
    </Sheet>
  );
}
