import React from "react";
import { View } from "react-native";
import {
  BookOpenCheck,
  CalendarClock,
  ChevronRight,
  CloudRain,
  GraduationCap,
  Hourglass,
  KeyRound,
  Megaphone,
  MoonStar,
  Repeat,
  Ticket,
  UserX,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, S } from "@/theme";
import { localId, usePro } from "../../store";
import { useRouter } from "expo-router";
import { sectionHref, useGoSection } from "../../shell";
import type { ProPayment } from "../../../../../shared/pro/types";
import { addDays, localDate, localMinutes, money, plural } from "../../../../../shared/pro/format";
import { memberPrice } from "../../../../../shared/pro/classes";
import { resourceBookings } from "../../../../../shared/pro/courts";
import { courtsOps } from "../../../../../shared/pro/courts-base";
import { levelLabel, passesToRenew, pendingOn, waitingOn } from "../../../../../shared/pro/courts-ops";
import { lateArrivals, lockerState, releaseNoShows, renewMember, renewals } from "../../../../../shared/pro/courts-desk";
import { dormantDetails, isWelcomeSeason, monthName, welcomePackOf } from "../../../../../shared/pro/courts-growth";
import { membersAway, monthlyStudySummaries, studyHoursLabel, summaryMonth } from "../../../../../shared/pro/courts-study";
import { ChoiceGrid, Empty, PButton, PText, Panel, Pill, Sheet } from "../../kit";
import { METHOD_LABEL, WhatsAppButton, firstName } from "./booking-ops";
import { PeopleDrawer, type PersonToWrite } from "./people-drawer";
import { RainDrawer } from "./rain-drawer";
import { WelcomePackDrawer } from "./welcome-pack";

/**
 * Lo que necesita al dueño hoy (versión nativa de web
 * courts/hoy-attention.tsx): cada fila dice qué pasa y lleva a donde se
 * resuelve. Si no hay nada, no se pinta.
 */

type Item = {
  id: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  tone?: "warning";
  onPress: () => void;
};

type People = "dormant" | "away" | "summary" | null;

export function TodayAttention() {
  const { data, now, vertical, update, spaceId } = usePro();
  const go = useGoSection();
  const router = useRouter();
  const [rain, setRain] = React.useState(false);
  const [welcome, setWelcome] = React.useState(false);
  const [renew, setRenew] = React.useState(false);
  const [people, setPeople] = React.useState<People>(null);
  const coworking = vertical.id === "coworking";
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const ops = courtsOps(data);
  const items: Item[] = [];

  if (coworking) {
    const late = lateArrivals(data, now);
    if (late.length)
      items.push({
        id: "late",
        icon: UserX,
        tone: "warning",
        title: `${plural(late.length, "reserva lleva", "reservas llevan")} más de ${ops.policy.releaseAfterMinutes} min sin llegar`,
        detail: `${late.map((b) => b.clientName).slice(0, 3).join(", ")}. Toca para liberar`,
        onPress: () => {
          void update("court.release.noshows", (d) => releaseNoShows(d, late.map((b) => b.id)));
          toast(late.length === 1 ? "Puesto liberado" : `${late.length} puestos liberados`, { kind: "success", body: "Quedan libres para quien llegue y se anota la ausencia." });
        },
      });
    const list = renewals(data, today);
    if (list.length)
      items.push({
        id: "renew",
        icon: CalendarClock,
        title: `${plural(list.length, "socio tiene", "socios tienen")} que renovar esta semana`,
        detail: list.slice(0, 3).map((r) => `${firstName(r.member.name)} (${r.detail.toLowerCase()})`).join(", "),
        onPress: () => setRenew(true),
      });
    const away = membersAway(data, today);
    if (away.length)
      items.push({
        id: "away",
        icon: MoonStar,
        tone: "warning",
        title: `${plural(away.length, "socio lleva", "socios llevan")} más de 10 días sin venir`,
        detail: `${away.slice(0, 3).map((a) => firstName(a.member.name)).join(", ")}: escríbeles antes de que se den de baja`,
        onPress: () => setPeople("away"),
      });
    const month = summaryMonth(today);
    if (month)
      items.push({
        id: "summary",
        icon: BookOpenCheck,
        title: `Resumen de horas de ${monthName(month)}`,
        detail: "Cuéntale a cada uno cuánto ha estudiado",
        onPress: () => setPeople("summary"),
      });
    const lockers = ops.lockers.filter((l) => lockerState(l, today) === "expired");
    if (lockers.length)
      items.push({
        id: "lockers",
        icon: KeyRound,
        title: plural(lockers.length, "taquilla vencida", "taquillas vencidas"),
        detail: `${lockers.map((l) => l.label).join(", ")}: cobra o vacía`,
        onPress: () => go("puestos"),
      });
    const unannounced = ops.specialHours.filter((h) => !h.announced && h.to >= today);
    if (unannounced.length)
      items.push({
        id: "hours",
        icon: Megaphone,
        title: `Horario especial sin anunciar: ${unannounced[0].label}`,
        detail: "Cuéntaselo a los estudiantes para que lo vean en tu ficha",
        onPress: () => go("normas"),
      });
  } else {
    const pending = pendingOn(data, today);
    if (pending > 0)
      items.push({ id: "pending", icon: Wallet, title: `${money(pending)} por cobrar hoy`, detail: "Partes de jugadores que faltan por pagar", onPress: () => go("pistas") });
    const waiting = waitingOn(data, today);
    if (waiting.length)
      items.push({
        id: "waiting",
        icon: Hourglass,
        title: `${plural(waiting.length, "persona espera", "personas esperan")} pista hoy`,
        detail: "Si alguien cancela, verás a quién avisar primero",
        onPress: () => go("pistas"),
      });
    const soon = addDays(today, 14);
    const clashes = ops.series.reduce(
      (a, s) => a + s.clashes.filter((c) => s.active && c.status === "open" && c.date >= today && c.date <= soon).length,
      0,
    );
    if (clashes)
      items.push({
        id: "series",
        icon: Repeat,
        tone: "warning",
        title: `${plural(clashes, "turno fijo choca", "turnos fijos chocan")} en las próximas dos semanas`,
        detail: "Propón otra pista u hora con un toque",
        onPress: () => router.replace(`${sectionHref(spaceId, "pistas")}?vista=fijos` as never),
      });
    if (isWelcomeSeason(today) && !welcomePackOf(data, today) && data.resources.some((r) => r.kind === "court"))
      items.push({
        id: "welcome",
        icon: GraduationCap,
        title: "Monta tu pack de bienvenida",
        detail: "Clínic en valle, americana y bono del primer mes, en un paso",
        onPress: () => setWelcome(true),
      });
    const dormant = dormantDetails(data, now);
    if (dormant.length)
      items.push({
        id: "dormant",
        icon: UserX,
        title: `${plural(dormant.length, "jugador habitual lleva", "jugadores habituales llevan")} tres semanas sin venir`,
        detail: `${dormant.slice(0, 3).map((p) => firstName(p.client.name)).join(", ")}: con un partido a su nivel ya escrito`,
        onPress: () => setPeople("dormant"),
      });
    const passes = passesToRenew(data, today);
    if (passes.length)
      items.push({
        id: "passes",
        icon: Ticket,
        title: plural(passes.length, "bono se acaba", "bonos se acaban"),
        detail: `${passes.slice(0, 3).map((p) => firstName(p.name)).join(", ")}: la renovación más fácil del mes`,
        onPress: () => go("bonos"),
      });
    const outdoorLeft = resourceBookings(data, today).some(
      (b) =>
        (b.status === "confirmed" || b.status === "requested") &&
        localMinutes(b.start) >= nowMin &&
        data.resources.find((r) => r.id === b.resourceId)?.kind === "court" &&
        !ops.coveredIds.includes(b.resourceId ?? ""),
    );
    if (outdoorLeft && ops.coveredIds.length)
      items.push({ id: "rain", icon: CloudRain, title: "¿Llueve?", detail: "Mueve a la cubierta las reservas de las pistas exteriores", onPress: () => setRain(true) });
  }

  // Personas a las que escribir desde la fila elegida, con el mensaje hecho.
  const list: PersonToWrite[] =
    people === "dormant"
      ? dormantDetails(data, now).map((p) => ({
          id: p.client.id,
          name: p.client.name,
          phone: p.client.phone,
          detail: [`${p.client.visits} visitas`, `${p.daysAway} días sin venir`, p.level !== undefined ? `nivel ${levelLabel(p.level)}` : ""].filter(Boolean).join(" · "),
          message: p.message,
        }))
      : people === "away"
        ? membersAway(data, today).map((a) => ({
            id: a.member.id,
            name: a.member.name,
            phone: a.member.phone,
            detail: a.lastSeen ? `Vino por última vez hace ${a.days} días` : "No ha venido desde que se apuntó",
            message: a.message,
            extra: <PButton label="Pausar su cuota" small variant="ghost" onPress={() => { setPeople(null); go("socios"); }} />,
          }))
        : people === "summary"
          ? monthlyStudySummaries(data, summaryMonth(today) ?? today.slice(0, 7), now).map((s) => ({
              id: s.personId,
              name: s.name,
              phone: s.phone,
              detail: `${studyHoursLabel(s.minutes)} este mes · puesto ${s.rank}`,
              message: s.message,
            }))
          : [];

  return (
    <>
      {items.length ? (
        <Panel title="Para hoy" description="Lo que necesita tu atención, en orden." flush>
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <Tap
                key={item.id}
                onPress={item.onPress}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${item.detail}`}
                style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md, borderTopWidth: i ? 1 : 0, borderTopColor: C.borderLight }}
              >
                <Icon size={17} color={item.tone === "warning" ? C.warning : C.blue} strokeWidth={1.9} />
                <View style={{ flex: 1 }}>
                  <PText v="h3">{item.title}</PText>
                  <PText v="tiny" numberOfLines={2}>{item.detail}</PText>
                </View>
                <ChevronRight size={16} color={C.muted} />
              </Tap>
            );
          })}
        </Panel>
      ) : null}
      {!coworking ? <RainDrawer date={today} open={rain} onClose={() => setRain(false)} /> : null}
      {!coworking ? <WelcomePackDrawer open={welcome} onClose={() => setWelcome(false)} /> : null}
      {coworking ? <RenewalsSheet open={renew} onClose={() => setRenew(false)} /> : null}
      <PeopleDrawer
        open={people !== null}
        onClose={() => setPeople(null)}
        title={people === "dormant" ? "Jugadores que han dejado de venir" : people === "away" ? "Socios que no vienen" : "Resumen de horas del mes"}
        description={
          people === "dormant"
            ? "Cada mensaje propone un partido a su nivel o su pista de siempre."
            : people === "away"
              ? "Recuérdales su sitio y ofrece pausar en vez de perderlos."
              : "Un mensaje por persona con sus horas de estudio."
        }
        people={list}
        emptyIcon={UserX}
        emptyTitle="Nadie en la lista"
        emptyBody="Cuando alguien deje de venir, aparecerá aquí con su mensaje escrito."
        cta={people === "summary" ? "Enviar" : "Escribir"}
      />
    </>
  );
}

/** Por renovar esta semana: recordar por WhatsApp y cobrar la renovación en un toque. */
function RenewalsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, now } = usePro();
  const today = localDate(now);
  const list = renewals(data, today);
  const [charging, setCharging] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<ProPayment["method"]>("card");

  return (
    <Sheet open={open} onClose={onClose} title="Por renovar esta semana" description="La venta más fácil del mes: recuérdaselo con un toque y cobra aquí mismo.">
      {list.length ? (
        list.map((r) => {
          const price = memberPrice(r.member, r.plan);
          return (
            <View key={r.member.id} style={{ gap: S.sm, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                <View style={{ flex: 1 }}>
                  <PText v="h3" numberOfLines={1}>{r.member.name}</PText>
                  <PText v="tiny" numberOfLines={1}>{`${r.plan.name} · ${r.detail}`}</PText>
                </View>
                <Pill
                  tone={r.reason === "overdue" ? "danger" : r.reason === "running_out" ? "warning" : "neutral"}
                  label={r.reason === "overdue" ? "Vencida" : r.reason === "running_out" ? "Se agota" : "Esta semana"}
                />
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
                <WhatsAppButton
                  phone={r.member.phone}
                  label="Recordar"
                  message={`Hola ${firstName(r.member.name)}, te escribimos de ${data.space.name}. ${
                    r.reason === "running_out" ? `Tu ${r.plan.name.toLowerCase()} está a punto de acabarse.` : `Tu cuota de ${r.plan.name.toLowerCase()} se renueva estos días.`
                  } Son ${money(price)} y te lo dejamos listo en recepción o por Bizum. ¡Ánimo con el estudio!`}
                />
                <PButton
                  label={`Renovar · ${money(price)}`}
                  small
                  variant={charging === r.member.id ? "secondary" : "dark"}
                  onPress={() => setCharging(charging === r.member.id ? null : r.member.id)}
                />
              </View>
              {charging === r.member.id ? (
                <View style={{ gap: S.sm }}>
                  <ChoiceGrid value={method} onChange={setMethod} options={(["card", "bizum", "cash"] as const).map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
                  <PButton
                    label={`Cobrar ${money(price)}`}
                    small
                    onPress={() => {
                      void update("member.renew", (d) => renewMember(d, { memberId: r.member.id, method, paymentId: localId("p"), now, priceCents: price }));
                      toast("Renovado", { kind: "success", body: `${r.member.name}, ${r.plan.name.toLowerCase()} por ${money(price)}.` });
                      setCharging(null);
                    }}
                  />
                </View>
              ) : null}
            </View>
          );
        })
      ) : (
        <Empty icon={CalendarClock} title="Nadie tiene que renovar esta semana" body="Aquí aparecen los bonos que se agotan y las cuotas que se cobran en los próximos 7 días." />
      )}
    </Sheet>
  );
}
