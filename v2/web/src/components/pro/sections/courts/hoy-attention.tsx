"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CloudRain,
  GraduationCap,
  Hourglass,
  KeyRound,
  Megaphone,
  MoonStar,
  Repeat,
  Ticket,
  Trophy,
  UserX,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProSectionId } from "@/lib/pro/types";
import { addDays, localDate, localMinutes, money, plural } from "@/lib/pro/format";
import { courtsOps } from "@/lib/pro/courts-base";
import { passesToRenew, pendingOn, waitingOn } from "@/lib/pro/courts-ops";
import { lateArrivals, lockerState, releaseNoShows, renewals } from "@/lib/pro/courts-desk";
import { resourceBookings, type OpenMatchX } from "@/lib/pro/courts";
import { dormantDetails, isWelcomeSeason, monthName, welcomePackOf } from "@/lib/pro/courts-growth";
import { membersAway, monthlyStudySummaries, studyHoursLabel, summaryMonth } from "@/lib/pro/courts-study";
import { levelLabel } from "@/lib/pro/courts-ops";
import { Panel, RowList } from "../../kit";
import { sectionHref } from "../../shell";
import { RainDrawer } from "./rain-drawer";
import { PeopleDrawer, type PersonToWrite } from "./people-drawer";
import { WelcomePackDrawer } from "./welcome-pack";

/**
 * Lo que necesita al dueño hoy, en una lista corta: cada fila dice qué pasa
 * y lleva a donde se resuelve. Si no hay nada, no se pinta.
 */

type Item = {
  id: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  href?: string;
  action?: React.ReactNode;
  tone?: "warning" | "danger";
};

export function TodayAttention() {
  const { data, now, spaceId, vertical, update } = usePro();
  const toast = useToast();
  const [rain, setRain] = React.useState(false);
  const [welcome, setWelcome] = React.useState(false);
  const [people, setPeople] = React.useState<"dormant" | "away" | "summary" | null>(null);
  const coworking = vertical.id === "coworking";
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const ops = courtsOps(data);
  const href = (section: ProSectionId, query = "") => `${sectionHref(spaceId, section)}${query}`;
  const items: Item[] = [];

  if (coworking) {
    const late = lateArrivals(data, now);
    if (late.length)
      items.push({
        id: "late",
        icon: UserX,
        tone: "warning",
        title: `${plural(late.length, "reserva lleva", "reservas llevan")} más de ${ops.policy.releaseAfterMinutes} min sin llegar`,
        detail: late.map((b) => b.clientName).slice(0, 3).join(", "),
        action: (
          <Button
            size="sm"
            variant="dark"
            className="min-h-10"
            onClick={() => {
              update("court.release.noshows", (d) => releaseNoShows(d, late.map((b) => b.id)));
              toast.success(
                late.length === 1 ? "Puesto liberado" : `${late.length} puestos liberados`,
                "Quedan libres para quien llegue y se anota la ausencia.",
              );
            }}
          >
            Liberar
          </Button>
        ),
      });
    const renew = renewals(data, today);
    if (renew.length)
      items.push({
        id: "renew",
        icon: CalendarClock,
        title: `${plural(renew.length, "socio tiene", "socios tienen")} que renovar esta semana`,
        detail: renew.slice(0, 3).map((r) => `${r.member.name.split(" ")[0]} (${r.detail.toLowerCase()})`).join(", "),
        href: href("mostrador", "?vista=renovar"),
      });
    const lockers = ops.lockers.filter((l) => lockerState(l, today) === "expired");
    if (lockers.length)
      items.push({
        id: "lockers",
        icon: KeyRound,
        title: `${plural(lockers.length, "taquilla vencida", "taquillas vencidas")}`,
        detail: `${lockers.map((l) => l.label).join(", ")}: cobra o vacía`,
        href: href("puestos", "?vista=taquillas"),
      });
    const unannounced = ops.specialHours.filter((h) => !h.announced && h.to >= today);
    if (unannounced.length)
      items.push({
        id: "hours",
        icon: Megaphone,
        title: `Horario especial sin anunciar: ${unannounced[0].label}`,
        detail: "Cuéntaselo a los estudiantes para que lo vean en tu ficha",
        href: href("normas"),
      });
    const away = membersAway(data, today);
    if (away.length)
      items.push({
        id: "away",
        icon: MoonStar,
        tone: "warning",
        title: `${plural(away.length, "socio lleva", "socios llevan")} más de 10 días sin venir`,
        detail: `${away.slice(0, 3).map((a) => a.member.name.split(" ")[0]).join(", ")}: escríbeles antes de que se den de baja`,
        action: (
          <Button size="sm" variant="outline" className="min-h-10" onClick={() => setPeople("away")}>
            Escribir
          </Button>
        ),
      });
    const month = summaryMonth(today);
    if (month)
      items.push({
        id: "summary",
        icon: BookOpenCheck,
        title: `Resumen de horas de ${monthName(month)}`,
        detail: "Cuéntale a cada uno cuánto ha estudiado: es el mensaje que más se agradece",
        action: (
          <Button size="sm" variant="outline" className="min-h-10" onClick={() => setPeople("summary")}>
            Enviar
          </Button>
        ),
      });
  } else {
    const pending = pendingOn(data, today);
    if (pending > 0)
      items.push({
        id: "pending",
        icon: Wallet,
        title: `${money(pending)} por cobrar hoy`,
        detail: "Partes de jugadores que faltan por pagar",
        href: href("mostrador"),
      });
    const waiting = waitingOn(data, today);
    if (waiting.length)
      items.push({
        id: "waiting",
        icon: Hourglass,
        title: `${plural(waiting.length, "persona espera", "personas esperan")} pista hoy`,
        detail: "Si alguien cancela, verás a quién avisar primero",
        href: href("pistas"),
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
        href: href("pistas", "?vista=fijos"),
      });
    const renew = passesToRenew(data, today);
    if (renew.length)
      items.push({
        id: "passes",
        icon: Ticket,
        title: `${plural(renew.length, "bono se acaba", "bonos se acaban")}`,
        detail: renew.slice(0, 3).map((p) => p.name.split(" ")[0]).join(", ") + ": la renovación más fácil del mes",
        href: href("bonos"),
      });
    const released = (data.openMatches as OpenMatchX[]).filter(
      (m) => m.releasedAt && localDate(m.start) === today && localMinutes(m.start) > nowMin,
    );
    if (released.length)
      items.push({
        id: "released",
        icon: CalendarClock,
        title: `${plural(released.length, "pista liberada", "pistas liberadas")} de partidos sin completar`,
        detail: "Ofrécelas a estudiantes como franja de última hora",
        href: href("pistas", "?vista=partidos"),
      });
    if (isWelcomeSeason(today) && !welcomePackOf(data, today) && data.resources.some((r) => r.kind === "court"))
      items.push({
        id: "welcome",
        icon: GraduationCap,
        title: "Monta tu pack de bienvenida",
        detail: "Clínic en valle, americana para conocerse y bono del primer mes, en un paso",
        action: (
          <Button size="sm" variant="dark" className="min-h-10" onClick={() => setWelcome(true)}>
            Montar
          </Button>
        ),
      });
    const dormant = dormantDetails(data, now);
    if (dormant.length)
      items.push({
        id: "dormant",
        icon: UserX,
        title: `${plural(dormant.length, "jugador habitual lleva", "jugadores habituales llevan")} tres semanas sin venir`,
        detail: `${dormant.slice(0, 3).map((p) => p.client.name.split(" ")[0]).join(", ")}: con un partido a su nivel ya escrito`,
        action: (
          <Button size="sm" variant="outline" className="min-h-10" onClick={() => setPeople("dormant")}>
            Escribir
          </Button>
        ),
      });
    const nextAmericana = ops.americanas.find((a) => a.status === "open" && a.date >= today);
    if (nextAmericana && nextAmericana.players.length < nextAmericana.maxPlayers)
      items.push({
        id: "americana",
        icon: Trophy,
        title: `${nextAmericana.name}: ${nextAmericana.players.length} de ${nextAmericana.maxPlayers} inscritos`,
        detail: `Faltan ${nextAmericana.maxPlayers - nextAmericana.players.length} para llenar las pistas`,
        href: href("torneos"),
      });
    const outdoorLeft = resourceBookings(data, today).some(
      (b) =>
        (b.status === "confirmed" || b.status === "requested") &&
        localMinutes(b.start) >= nowMin &&
        data.resources.find((r) => r.id === b.resourceId)?.kind === "court" &&
        !ops.coveredIds.includes(b.resourceId ?? ""),
    );
    if (outdoorLeft && ops.coveredIds.length)
      items.push({
        id: "rain",
        icon: CloudRain,
        title: "¿Llueve?",
        detail: "Mueve a la cubierta las reservas de las pistas exteriores en un minuto",
        action: (
          <Button size="sm" variant="outline" className="min-h-10" onClick={() => setRain(true)}>
            Llueve
          </Button>
        ),
      });
  }

  if (!items.length) return null;

  // Personas a las que escribir desde la fila elegida, con el mensaje hecho.
  const list: PersonToWrite[] =
    people === "dormant"
      ? dormantDetails(data, now).map((p) => ({
          id: p.client.id,
          name: p.client.name,
          phone: p.client.phone,
          detail: [
            `${p.client.visits} visitas`,
            `${p.daysAway} días sin venir`,
            p.level !== undefined ? `nivel ${levelLabel(p.level)}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
          message: p.message,
        }))
      : people === "away"
        ? membersAway(data, today).map((a) => ({
            id: a.member.id,
            name: a.member.name,
            phone: a.member.phone,
            detail: a.lastSeen ? `Vino por última vez hace ${a.days} días` : "No ha venido desde que se apuntó",
            message: a.message,
            extra: (
              <Link
                href={`${href("socios")}?c=${a.member.id}`}
                className="inline-flex min-h-10 items-center px-2 text-sm font-semibold text-violet"
              >
                Pausar su cuota
              </Link>
            ),
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
      <Panel title="Para hoy" description="Lo que necesita tu atención, en orden." flush>
        <RowList>
          {items.map((item) => {
            const Icon = item.icon;
            const body = (
              <>
                <Icon
                  className={
                    item.tone === "warning"
                      ? "h-4 w-4 shrink-0 text-amber-600"
                      : item.tone === "danger"
                        ? "h-4 w-4 shrink-0 text-rose-600"
                        : "h-4 w-4 shrink-0 text-violet"
                  }
                  strokeWidth={1.9}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{item.title}</span>
                  <span className="block truncate text-xs text-text-muted">{item.detail}</span>
                </span>
              </>
            );
            if (item.href)
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-secondary sm:px-5"
                >
                  {body}
                  <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                </Link>
              );
            return (
              <div key={item.id} className="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-5">
                {body}
                {item.action}
              </div>
            );
          })}
        </RowList>
      </Panel>
      <RainDrawer date={today} open={rain} onClose={() => setRain(false)} />
      <WelcomePackDrawer open={welcome} onClose={() => setWelcome(false)} />
      <PeopleDrawer
        open={people !== null}
        onClose={() => setPeople(null)}
        title={
          people === "dormant"
            ? "Jugadores que han dejado de venir"
            : people === "away"
              ? "Socios que no vienen"
              : "Resumen de horas del mes"
        }
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
