"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Maximize2, Plus, Share2, Trash2, Trophy, Users, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProAmericana, ProLeague, ProLeagueFixture, ProLeagueTeam } from "@/lib/pro/courts-types";
import { addDays, localDate, money, plural } from "@/lib/pro/format";
import { clockLabel } from "@/lib/pro/courts-base";
import {
  americanaProgress,
  americanaStandings,
  clubRanking,
  leagueShareText,
  leagueStandings,
  setFixtureResult,
} from "@/lib/pro/courts-compete";
import {
  LEVEL_BAND_LABEL,
  createLeague,
  currentRound,
  rankingByBand,
  rankingShareText,
  type LevelBand,
} from "@/lib/pro/courts-admin";
import { levelLabel } from "@/lib/pro/courts-ops";
import { cn } from "@/lib/utils";
import {
  ChoiceChips,
  Drawer,
  Empty,
  FixedPortal,
  FormField,
  Meter,
  PageHeader,
  Panel,
  Pill,
  Segmented,
  Tip,
  inputClass,
} from "../../kit";
import { AmericanaDrawer, NewAmericanaDrawer, americanaWhen, shareHref } from "./americana";
import { CourtsNotReady, shortDate, useCourtsState, useInitialView } from "./state";

/**
 * Torneos del club: americanas que se montan en diez minutos, la liga entre
 * facultades que llena los mediodías todo el curso y el ranking de la
 * temporada, con su vista para la tele.
 */

const VIEWS = ["americanas", "liga", "ranking"] as const;
type View = (typeof VIEWS)[number];
const DAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

export default function TorneosSection() {
  const { ready } = useCourtsState();
  if (!ready)
    return (
      <div className="flex flex-col gap-5">
        <PageHeader eyebrow="Torneos" title="Americanas y liga" />
        <CourtsNotReady
          icon={Trophy}
          title="Americanas, liga y ranking"
          body="Monta una americana en diez minutos, con rondas y clasificación, o una liga entre facultades para tus mediodías."
        />
      </div>
    );
  return <Torneos />;
}

function Torneos() {
  const { data, now } = usePro();
  const { ops } = useCourtsState();
  const today = localDate(now);
  const [view, setView] = useInitialView<View>(VIEWS, "americanas");
  const [newAmericana, setNewAmericana] = React.useState(false);
  const [openAmericana, setOpenAmericana] = React.useState<string | null>(null);
  const [newLeague, setNewLeague] = React.useState(false);
  const [band, setBand] = React.useState<LevelBand>("all");
  const [tv, setTv] = React.useState(false);

  const upcoming = ops.americanas
    .filter((a) => a.status !== "done" && a.date >= addDays(today, -1))
    .sort((a, b) => a.date.localeCompare(b.date) || a.from - b.from);
  const done = ops.americanas
    .filter((a) => a.status === "done" || a.date < addDays(today, -1))
    .sort((a, b) => b.date.localeCompare(a.date));
  const ranking = rankingByBand(clubRanking(data, today), band);
  const league = ops.league;

  const title = view === "americanas" ? "Americanas" : view === "liga" ? league?.name ?? "Liga entre facultades" : "Ranking de la temporada";
  const description =
    view === "americanas"
      ? upcoming.length
        ? `${plural(upcoming.length, "americana en marcha", "americanas en marcha")}, ${upcoming.reduce((a, x) => a + x.players.length, 0)} jugadores apuntados.`
        : "Parejas que rotan cada ronda, resultados desde el móvil y clasificación para compartir."
      : view === "liga"
        ? league
          ? `${league.teams.length} parejas, los ${DAYS[league.weekday]} a las ${clockLabel(league.from)}. Jornada ${currentRound(league, today)} de ${Math.max(...league.fixtures.map((f) => f.round))}.`
          : "Equipos por facultad, jornadas en franja valle y clasificación que se comparte sola."
        : ranking.length
          ? `${plural(ranking.length, "jugador puntúa", "jugadores puntúan")} desde septiembre: un punto por juego en americana, tres por victoria en liga.`
          : "Se llena solo con las americanas y la liga de esta temporada.";

  const action =
    view === "americanas" ? (
      <Button variant="dark" onClick={() => setNewAmericana(true)}>
        <Plus className="h-4 w-4" /> Nueva americana
      </Button>
    ) : view === "liga" ? (
      league ? (
        <a
          href={shareHref(leagueShareText(league, data.space.name))}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "dark" })}
        >
          <Share2 className="h-4 w-4" /> Compartir clasificación
        </a>
      ) : (
        <Button variant="dark" onClick={() => setNewLeague(true)}>
          <Plus className="h-4 w-4" /> Crear liga
        </Button>
      )
    ) : (
      <>
        <Button variant="outline" className="min-h-10" onClick={() => setTv(true)} disabled={!ranking.length}>
          <Maximize2 className="h-4 w-4" /> Vista para la tele
        </Button>
        <a
          href={shareHref(rankingShareText(ranking, data.space.name, band))}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!ranking.length}
          className={cn(buttonVariants({ variant: "dark" }), !ranking.length && "pointer-events-none opacity-50")}
        >
          <Share2 className="h-4 w-4" /> Compartir
        </a>
      </>
    );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Torneos" title={title} description={description} actions={action}>
        <Segmented
          label="Torneos"
          value={view}
          onChange={setView}
          options={[
            { value: "americanas", label: "Americanas", count: upcoming.length },
            { value: "liga", label: "Liga" },
            { value: "ranking", label: "Ranking" },
          ]}
        />
      </PageHeader>

      {view === "americanas" ? (
        <AmericanasView
          upcoming={upcoming}
          done={done}
          onOpen={setOpenAmericana}
          onNew={() => setNewAmericana(true)}
        />
      ) : view === "liga" ? (
        league ? (
          <LeagueView league={league} today={today} />
        ) : (
          <div className="rounded-2xl border border-border bg-bg-primary">
            <Empty
              icon={Users}
              title="Monta la liga entre facultades"
              body="Una pareja por facultad, un partido por semana a mediodía. Llena tus horas valle todo el curso y cada jornada trae a sus amigos a mirar."
              action={
                <Button variant="dark" onClick={() => setNewLeague(true)}>
                  <Plus className="h-4 w-4" /> Crear liga
                </Button>
              }
            />
          </div>
        )
      ) : (
        <RankingView ranking={ranking} band={band} onBand={setBand} />
      )}

      <NewAmericanaDrawer open={newAmericana} onClose={() => setNewAmericana(false)} />
      <AmericanaDrawer id={openAmericana} onClose={() => setOpenAmericana(null)} />
      <NewLeagueDrawer open={newLeague} onClose={() => setNewLeague(false)} />
      {tv ? <RankingTv ranking={ranking} band={band} onClose={() => setTv(false)} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Americanas                                                          */
/* ------------------------------------------------------------------ */

function AmericanasView({
  upcoming,
  done,
  onOpen,
  onNew,
}: {
  upcoming: ProAmericana[];
  done: ProAmericana[];
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  if (!upcoming.length && !done.length)
    return (
      <div className="rounded-2xl border border-border bg-bg-primary">
        <Empty
          icon={Trophy}
          title="Tu primera americana"
          body="Elige día, pistas y nivel. Las pistas se bloquean solas, compartes la invitación y, al cerrar, las rondas salen sin que nadie repita pareja."
          action={
            <Button variant="dark" onClick={onNew}>
              <Plus className="h-4 w-4" /> Nueva americana
            </Button>
          }
        />
      </div>
    );
  return (
    <div className="flex flex-col gap-5">
      {upcoming.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {upcoming.map((a) => (
            <AmericanaCard key={a.id} americana={a} onOpen={() => onOpen(a.id)} />
          ))}
        </div>
      ) : (
        <Tip title="Sin americanas a la vista">
          Un viernes por la tarde con doce jugadores llena tres pistas dos horas. Crea la próxima y compártela en el grupo del club.
        </Tip>
      )}
      {done.length ? (
        <Panel title="Jugadas" flush>
          <div className="divide-y divide-border-light">
            {done.slice(0, 8).map((a) => {
              const winner = americanaStandings(a)[0];
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onOpen(a.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary sm:px-5"
                >
                  <Trophy className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{a.name}</span>
                    <span className="block text-xs text-text-muted">
                      {shortDate(a.date)}, {plural(a.players.length, "jugador", "jugadores")}
                    </span>
                  </span>
                  {winner && winner.games ? <Pill tone="violet">Gana {winner.name.split(" ")[0]}</Pill> : null}
                </button>
              );
            })}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function AmericanaCard({ americana: a, onOpen }: { americana: ProAmericana; onOpen: () => void }) {
  const { data } = usePro();
  const progress = americanaProgress(a);
  const paid = a.players.filter((p) => p.paid).length;
  const courts = a.resourceIds.map((id) => data.resources.find((r) => r.id === id)?.name ?? "").join(", ");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="hover-lift flex flex-col gap-3 rounded-2xl border border-border bg-bg-primary p-4 text-left shadow-card transition-colors hover:border-text-primary/15"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-heading text-base font-bold">{a.name}</p>
          <p className="text-sm text-text-muted">{americanaWhen(a)}</p>
        </div>
        <Pill tone={a.status === "open" ? "violet" : "info"}>{a.status === "open" ? "Inscripción" : "Jugando"}</Pill>
      </div>
      {a.status === "open" ? (
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-heading text-xl font-extrabold tabular">
              {a.players.length}
              <span className="text-sm text-text-muted">/{a.maxPlayers}</span>
            </span>
            <span className="text-xs text-text-muted">
              {paid} pagados{a.pricePerPlayerCents ? `, ${money(paid * a.pricePerPlayerCents)}` : ""}
            </span>
          </div>
          <Meter value={a.players.length} max={a.maxPlayers} className="mt-1.5" />
        </div>
      ) : (
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">Resultados</span>
            <span className="text-xs text-text-muted tabular">
              {progress.played} de {progress.total}
            </span>
          </div>
          <Meter value={progress.played} max={progress.total} className="mt-1.5" tone="success" />
        </div>
      )}
      <p className="truncate text-xs text-text-muted">
        {courts}. Nivel {a.level}
        {a.studentsOnly ? ", solo estudiantes" : ""}
      </p>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Liga                                                                */
/* ------------------------------------------------------------------ */

function LeagueView({ league, today }: { league: ProLeague; today: string }) {
  const { data, update } = usePro();
  const standings = leagueStandings(league);
  const rounds = Math.max(...league.fixtures.map((f) => f.round));
  const [round, setRound] = React.useState(() => currentRound(league, today));
  const fixtures = league.fixtures.filter((f) => f.round === round);
  const team = (id: string) => league.teams.find((t) => t.id === id);
  const courtName = (id: string) => data.resources.find((r) => r.id === id)?.name ?? "";

  const setResult = (f: ProLeagueFixture, homeSets: number | null, awaySets: number | null) =>
    void update("court.league.result", (d) => setFixtureResult(d, f.id, homeSets, awaySets));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <Panel title="Clasificación" description="Victoria 3 puntos, derrota 1. A igualdad, diferencia de sets." flush>
        <div className="overflow-x-auto pro-scroll">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border-light text-left text-xs text-text-muted">
                <th className="py-2 pl-4 pr-2 font-medium sm:pl-5">#</th>
                <th className="px-2 py-2 font-medium">Pareja</th>
                <th className="px-2 py-2 text-right font-medium">PJ</th>
                <th className="px-2 py-2 text-right font-medium">G</th>
                <th className="px-2 py-2 text-right font-medium">Sets</th>
                <th className="py-2 pl-2 pr-4 text-right font-medium sm:pr-5">Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.team.id} className={cn("border-b border-border-light last:border-0", i === 0 && s.played && "bg-violet-50/60")}>
                  <td className="py-2.5 pl-4 pr-2 font-heading font-bold tabular sm:pl-5">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <span className="block font-semibold">{s.team.name}</span>
                    <span className="block truncate text-xs text-text-muted">{s.team.players.join(" y ")}</span>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular">{s.played}</td>
                  <td className="px-2 py-2.5 text-right tabular">{s.won}</td>
                  <td className="px-2 py-2.5 text-right tabular">
                    {s.setsFor}-{s.setsAgainst}
                  </td>
                  <td className="py-2.5 pl-2 pr-4 text-right font-heading font-bold tabular sm:pr-5">{s.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title={`Jornada ${round}`}
        description={fixtures[0] ? `${shortDate(fixtures[0].date)} a las ${clockLabel(fixtures[0].from)}` : undefined}
        action={
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="min-h-10" disabled={round <= 1} onClick={() => setRound(round - 1)} aria-label="Jornada anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="min-h-10" disabled={round >= rounds} onClick={() => setRound(round + 1)} aria-label="Jornada siguiente">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      >
        <ul className="flex flex-col gap-2">
          {fixtures.map((f) => (
            <li key={f.id} className="rounded-xl border border-border p-3">
              <p className="text-xs font-semibold text-text-muted">
                {courtName(f.resourceId)}, {clockLabel(f.from)}
              </p>
              <div className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 text-sm">
                <span className="truncate font-medium">{team(f.home)?.name}</span>
                <SetsInput
                  value={f.homeSets}
                  label={`Sets de ${team(f.home)?.name ?? ""}`}
                  onChange={(v) => setResult(f, v, f.awaySets)}
                />
                <span className="truncate font-medium">{team(f.away)?.name}</span>
                <SetsInput
                  value={f.awaySets}
                  label={`Sets de ${team(f.away)?.name ?? ""}`}
                  onChange={(v) => setResult(f, f.homeSets, v)}
                />
              </div>
            </li>
          ))}
        </ul>
        {league.teams.length % 2 ? (
          <p className="mt-3 text-xs text-text-muted">
            Con {league.teams.length} parejas, una descansa cada jornada.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}

/** Sets ganados: 0, 1 o 2 en tres botones grandes. */
function SetsInput({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1">
      {[0, 1, 2].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(value === n ? null : n)}
          className={cn(
            "h-10 w-10 rounded-xl border font-heading text-base font-bold tabular transition-colors",
            value === n ? "border-text-primary bg-text-primary text-bg-primary" : "border-border text-text-secondary hover:border-text-primary/25",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

type TeamDraft = { name: string; faculty: string; a: string; b: string; phone: string };

function NewLeagueDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const courts = data.resources.filter((r) => r.kind === "court");
  const [name, setName] = React.useState("Liga entre facultades");
  const [weekday, setWeekday] = React.useState(2);
  const [from, setFrom] = React.useState(12 * 60 + 30);
  const [start, setStart] = React.useState(addDays(today, 7));
  const [courtIds, setCourtIds] = React.useState<string[]>([]);
  const [teams, setTeams] = React.useState<TeamDraft[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setName("Liga entre facultades");
    setWeekday(2);
    setFrom(12 * 60 + 30);
    setStart(addDays(today, 7));
    setCourtIds(courts.slice(0, 2).map((r) => r.id));
    setTeams([
      { name: "Derecho", faculty: "Facultad de Derecho", a: "", b: "", phone: "" },
      { name: "Económicas", faculty: "Facultad de Económicas", a: "", b: "", phone: "" },
      { name: "Politécnica", faculty: "Escuela Politécnica Superior", a: "", b: "", phone: "" },
      { name: "Ciencias", faculty: "Facultad de Ciencias", a: "", b: "", phone: "" },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ready = teams.filter((t) => t.name.trim() && t.a.trim() && t.b.trim());
  const valid = name.trim().length >= 3 && ready.length >= 3 && courtIds.length > 0;
  const setTeam = (i: number, patch: Partial<TeamDraft>) =>
    setTeams((list) => list.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  const rounds = ready.length % 2 ? ready.length : ready.length - 1;

  const save = async () => {
    if (!valid) return;
    const leagueTeams: ProLeagueTeam[] = ready.map((t) => ({
      id: localId("eq"),
      name: t.name.trim(),
      faculty: t.faculty.trim() || t.name.trim(),
      players: [t.a.trim(), t.b.trim()],
      phone: t.phone.trim() || undefined,
    }));
    const ok = await update("court.league.create", (d) =>
      createLeague(
        d,
        { id: localId("liga"), name, weekday, from, startDate: start, resourceIds: courtIds, teams: leagueTeams },
        localId,
      ),
    );
    if (ok) {
      toast.success("Liga creada", `${plural(rounds, "jornada", "jornadas")} los ${DAYS[weekday]}, con las pistas ya bloqueadas.`);
      onClose();
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Nueva liga"
      description="Todos contra todos, una jornada por semana."
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save} disabled={!valid}>
            Crear y bloquear pistas
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Nombre" htmlFor="lg-name">
          <input id="lg-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="Día de la semana">
          <ChoiceChips
            value={String(weekday)}
            onChange={(v) => setWeekday(Number(v))}
            options={["Lun", "Mar", "Mié", "Jue", "Vie"].map((d, i) => ({ value: String(i), label: d }))}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Hora" htmlFor="lg-from" hint="A mediodía llena la franja valle.">
            <select id="lg-from" value={from} onChange={(e) => setFrom(Number(e.target.value))} className={inputClass}>
              {Array.from({ length: 22 }, (_, i) => 9 * 60 + i * 30).map((m) => (
                <option key={m} value={m}>
                  {clockLabel(m)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Empieza" htmlFor="lg-start">
            <input id="lg-start" type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <FormField label="Pistas">
          <div className="flex flex-wrap gap-2">
            {courts.map((r) => {
              const on = courtIds.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCourtIds((list) => (on ? list.filter((id) => id !== r.id) : [...list, r.id]))}
                  className={cn(
                    "min-h-10 rounded-xl border px-3 text-sm font-semibold transition-colors",
                    on ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary",
                  )}
                >
                  {r.name}
                </button>
              );
            })}
          </div>
        </FormField>
        <FormField label="Parejas" hint="Nombre del equipo y sus dos jugadores. Mínimo tres.">
          <ul className="flex flex-col gap-2">
            {teams.map((t, i) => (
              <li key={i} className="grid gap-2 rounded-xl border border-border p-2.5 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input value={t.name} onChange={(e) => setTeam(i, { name: e.target.value })} placeholder="Facultad" aria-label="Facultad" className={inputClass} />
                <input value={t.a} onChange={(e) => setTeam(i, { a: e.target.value })} placeholder="Jugador 1" aria-label="Jugador 1" className={inputClass} />
                <input value={t.b} onChange={(e) => setTeam(i, { b: e.target.value })} placeholder="Jugador 2" aria-label="Jugador 2" className={inputClass} />
                <button
                  type="button"
                  aria-label="Quitar pareja"
                  onClick={() => setTeams((list) => list.filter((_, k) => k !== i))}
                  className="inline-flex h-10 w-10 items-center justify-center justify-self-end rounded-xl text-text-muted hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.9} />
                </button>
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="min-h-10 self-start"
            onClick={() => setTeams((list) => [...list, { name: "", faculty: "", a: "", b: "", phone: "" }])}
          >
            <Plus className="h-3.5 w-3.5" /> Añadir pareja
          </Button>
        </FormField>
        {ready.length >= 3 ? (
          <p className="rounded-2xl bg-bg-secondary p-4 text-sm text-text-muted">
            {plural(rounds, "jornada", "jornadas")} desde el {shortDate(start)}, los {DAYS[weekday]} a las {clockLabel(from)}.
            {ready.length % 2 ? " Con parejas impares, una descansa cada semana." : ""}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

function RankingView({
  ranking,
  band,
  onBand,
}: {
  ranking: ReturnType<typeof rankingByBand>;
  band: LevelBand;
  onBand: (b: LevelBand) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ChoiceChips
        value={band}
        onChange={onBand}
        options={(Object.keys(LEVEL_BAND_LABEL) as LevelBand[]).map((b) => ({ value: b, label: LEVEL_BAND_LABEL[b] }))}
      />
      <Panel flush>
        {ranking.length ? (
          <ol className="divide-y divide-border-light">
            {ranking.slice(0, 30).map((r, i) => (
              <li key={r.name} className={cn("flex items-center gap-3 px-4 py-3 sm:px-5", i < 3 && "bg-violet-50/40")}>
                <span className="w-6 text-right font-heading text-lg font-extrabold tabular">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  <span className="block text-xs text-text-muted">
                    {[
                      r.americanas ? plural(r.americanas, "americana", "americanas") : "",
                      r.leagueMatches ? plural(r.leagueMatches, "partido de liga", "partidos de liga") : "",
                      r.level ? `nivel ${levelLabel(r.level)}` : "",
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </span>
                <span className="font-heading text-lg font-extrabold tabular">
                  {r.points}
                  <span className="ml-1 text-xs font-medium text-text-muted">pts</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <Empty icon={Trophy} title="Nadie puntúa aún en este nivel" body="Los puntos llegan con cada americana y cada jornada de liga." />
        )}
      </Panel>
    </div>
  );
}

/** Pantalla completa para la tele del club: el ranking en grande. */
function RankingTv({
  ranking,
  band,
  onClose,
}: {
  ranking: ReturnType<typeof rankingByBand>;
  band: LevelBand;
  onClose: () => void;
}) {
  const { data } = usePro();
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const top = ranking.slice(0, 10);
  return (
    <FixedPortal>
      <div className="fixed inset-0 z-[70] flex flex-col bg-bg-dark px-6 py-8 text-white sm:px-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white/60">{data.space.name}</p>
            <h2 className="mt-2 font-heading text-4xl font-extrabold tracking-[-0.03em] sm:text-6xl">
              Ranking{band === "all" ? "" : `, ${LEVEL_BAND_LABEL[band].toLowerCase()}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ol className="mt-8 grid flex-1 content-start gap-x-12 gap-y-3 overflow-y-auto sm:grid-cols-2">
          {top.map((r, i) => (
            <li key={r.name} className="flex items-baseline gap-4 border-b border-white/10 pb-3">
              <span className="w-10 font-heading text-3xl font-extrabold text-white/50 tabular sm:text-4xl">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-2xl font-semibold sm:text-3xl">{r.name}</span>
              <span className="font-heading text-2xl font-extrabold tabular sm:text-3xl">{r.points}</span>
            </li>
          ))}
        </ol>
      </div>
    </FixedPortal>
  );
}
