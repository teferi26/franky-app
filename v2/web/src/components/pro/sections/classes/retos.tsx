"use client";

import * as React from "react";
import {
  Check,
  Flag,
  Gift,
  Link2,
  MessageCircle,
  Plus,
  Share2,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProChallenge, ProRoomResult } from "@/lib/pro/classes-types";
import type { ProBooking, ProClassSession } from "@/lib/pro/types";
import { addDays, dayLabel, localDate, plural, time } from "@/lib/pro/format";
import { isRoomMode, shortUni } from "@/lib/pro/classes";
import { withExtras } from "@/lib/pro/classes-care";
import {
  addChallengeBonus,
  challengeDaysLeft,
  challengeShareText,
  challengeStandings,
  challengeState,
  challengesOf,
  createChallenge,
  currentChallenge,
  formatRecord,
  nextFreeSession,
  nextRoomMessage,
  parseRecordValue,
  playerCollection,
  rankFor,
  rankingByUniversity,
  resultForBooking,
  roomRanking,
  saveRoomResult,
} from "@/lib/pro/classes-play";
import {
  askReferralMessage,
  referralBoard,
  referralMessage,
  referralUrl,
  rewardReferral,
} from "@/lib/pro/classes-growth";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { UNIVERSITIES } from "@/lib/pro/demo/common";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  Meter,
  PageHeader,
  Panel,
  Pill,
  SearchInput,
  Segmented,
  Tip,
  inputClass,
} from "../../kit";
import { CheerList, RecordBoard, RecordDrawer } from "./records";
import { Stepper } from "./ui";

/**
 * Lo que hace volver. En el gimnasio: el reto del mes entre carreras, las
 * marcas personales y "trae a un amigo". En el escape room: el ranking de
 * cada sala, las universidades que más juegan y la sala que le toca a cada
 * grupo después.
 */
export default function ClassesRetos() {
  const { vertical } = usePro();
  return vertical.id === "culture" ? <RoomRankingSection /> : <GymRetos />;
}

async function shareOrCopy(text: string, onCopied: () => void, onFail: () => void) {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    onCopied();
  } catch {
    onFail();
  }
}

/* ------------------------------------------------------------------ */
/* Gimnasio                                                            */
/* ------------------------------------------------------------------ */

type GymTab = "reto" | "marcas" | "amigos";

function GymRetos() {
  const { data, now } = usePro();
  const [tab, setTab] = React.useState<GymTab>("reto");
  const [creating, setCreating] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const ch = currentChallenge(data, now);
  const rows = ch ? challengeStandings(data, ch, now) : [];
  const board = referralBoard(data);
  const joinedByFriends = board.reduce((a, r) => a + r.joined, 0);

  const primary =
    tab === "marcas" ? (
      <Button variant="dark" onClick={() => setRecording(true)}>
        <Plus className="h-4 w-4" /> Apuntar marca
      </Button>
    ) : tab === "reto" ? (
      <Button variant="dark" onClick={() => setCreating(true)}>
        <Flag className="h-4 w-4" /> Nuevo reto
      </Button>
    ) : undefined;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Retos"
        title="Que vuelvan a por más"
        description={
          ch && challengeState(ch, now) === "live"
            ? `${ch.title}: ${rows[0] ? `va ganando ${rows[0].team} con ${plural(rows[0].visits, "asistencia", "asistencias")}` : "todavía sin asistencias"}, quedan ${plural(challengeDaysLeft(ch, now), "día", "días")}.`
            : "Un reto de un mes entre carreras mete grupos enteros en tus clases. Las marcas y los amigos hacen el resto."
        }
        actions={primary}
      />

      <Segmented
        label="Vista"
        value={tab}
        onChange={setTab}
        options={[
          { value: "reto", label: "Reto entre carreras" },
          { value: "marcas", label: "Marcas" },
          { value: "amigos", label: "Trae a un amigo", count: joinedByFriends || undefined },
        ]}
      />

      {tab === "reto" ? <ChallengeView onCreate={() => setCreating(true)} /> : null}
      {tab === "marcas" ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <CheerList />
          <RecordBoard />
        </div>
      ) : null}
      {tab === "amigos" ? <ReferralsView /> : null}

      <ChallengeDrawer open={creating} onClose={() => setCreating(false)} />
      <RecordDrawer open={recording} onClose={() => setRecording(false)} />
    </div>
  );
}

function ChallengeView({ onCreate }: { onCreate: () => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [bonusOpen, setBonusOpen] = React.useState(false);
  const ch = currentChallenge(data, now);
  const past = challengesOf(data)
    .filter((c) => challengeState(c, now) === "ended")
    .sort((a, b) => b.endsOn.localeCompare(a.endsOn));

  if (!ch)
    return (
      <Panel>
        <Empty
          icon={Trophy}
          title="Sin reto en marcha"
          body="Elige un mes y un premio. Cada asistencia de un socio suma para su carrera, y la clasificación se comparte en un toque."
          action={
            <Button variant="dark" onClick={onCreate}>
              <Flag className="h-4 w-4" /> Crear el primero
            </Button>
          }
        />
      </Panel>
    );

  const rows = challengeStandings(data, ch, now);
  const state = challengeState(ch, now);
  const daysLeft = challengeDaysLeft(ch, now);
  const top = Math.max(1, ...rows.map((r) => r.visits));
  const total = rows.reduce((a, r) => a + r.visits, 0);

  const share = () =>
    void shareOrCopy(
      challengeShareText(ch, rows, data.space.name, daysLeft),
      () =>
        toast.success("Clasificación copiada", "Pégala en tus stories o en los grupos de clase."),
      () => toast.info("No se ha podido compartir"),
    );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel
        title={ch.title}
        description={`${dayLabel(`${ch.startsOn}T12:00:00Z`, { weekday: false })} a ${dayLabel(`${ch.endsOn}T12:00:00Z`, { weekday: false })}. Premio: ${ch.prize}.`}
        action={
          <Button size="sm" variant="secondary" onClick={share} disabled={!rows.length}>
            <Share2 className="h-3.5 w-3.5" /> Compartir
          </Button>
        }
        flush
      >
        {rows.length ? (
          <ol className="divide-y divide-border-light">
            {rows.map((r, i) => (
              <li key={r.team} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span
                  className={cn(
                    "w-6 shrink-0 font-heading text-lg font-extrabold tabular",
                    i === 0 ? "text-violet" : "text-text-muted",
                  )}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{r.team}</span>
                    <span className="shrink-0 text-sm font-bold tabular">{r.visits}</span>
                  </span>
                  <Meter
                    value={r.visits}
                    max={top}
                    className="mt-1.5"
                    tone={i === 0 ? "violet" : "success"}
                  />
                  <span className="mt-1 block text-xs text-text-muted">
                    {plural(r.people, "persona ha venido", "personas han venido")} de {r.members}{" "}
                    socios
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <Empty
            icon={Users}
            title="Aún sin asistencias"
            body="En cuanto un socio con carrera en su ficha venga a clase, su carrera empieza a sumar."
          />
        )}
      </Panel>

      <div className="flex flex-col gap-5">
        <section className="rounded-2xl border border-border bg-bg-primary p-4 shadow-card sm:p-5">
          <p className="eyebrow">
            {state === "upcoming" ? "Empieza pronto" : state === "live" ? "En marcha" : "Terminado"}
          </p>
          <p className="mt-2 font-heading text-3xl font-extrabold tabular">{total}</p>
          <p className="text-sm text-text-muted">asistencias en el reto</p>
          <p className="mt-3 text-sm text-text-secondary">
            {state === "live"
              ? `Quedan ${plural(daysLeft, "día", "días")}.`
              : state === "upcoming"
                ? `Empieza el ${dayLabel(`${ch.startsOn}T12:00:00Z`, { weekday: true })}.`
                : "Anuncia la carrera ganadora."}
          </p>
          <Button className="mt-4 w-full" variant="outline" onClick={() => setBonusOpen(true)}>
            <Plus className="h-4 w-4" /> Sumar asistencias a mano
          </Button>
        </section>
        <Tip title="Cómo moverlo">
          Cuelga la clasificación los lunes en tus stories y en los grupos de cada carrera. La
          carrera que va segunda es la que más gente trae.
        </Tip>
        {past.length ? (
          <Panel title="Retos anteriores" flush>
            <ul className="divide-y divide-border-light">
              {past.slice(0, 4).map((c) => {
                const winner = challengeStandings(data, c, now)[0];
                return (
                  <li key={c.id} className="px-4 py-2.5 text-sm sm:px-5">
                    <p className="font-semibold">{c.title}</p>
                    <p className="text-xs text-text-muted">Ganó {winner?.team ?? "nadie"}</p>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ) : null}
      </div>
      <BonusDrawer
        open={bonusOpen}
        challenge={ch}
        teams={rows.map((r) => r.team)}
        onClose={() => setBonusOpen(false)}
        onSave={(team, n) =>
          void update("challenge.bonus", (d) => addChallengeBonus(d, ch.id, team, n))
        }
      />
    </div>
  );
}

function BonusDrawer({
  open,
  challenge,
  teams,
  onClose,
  onSave,
}: {
  open: boolean;
  challenge: ProChallenge;
  teams: string[];
  onClose: () => void;
  onSave: (team: string, n: number) => void;
}) {
  const [team, setTeam] = React.useState("");
  const [n, setN] = React.useState(1);
  React.useEffect(() => {
    if (open) {
      setTeam(teams[0] ?? "");
      setN(1);
    }
  }, [open, teams]);
  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Sumar asistencias"
      description={`Para lo que no pasa por el horario: una quedada, una clase especial. Reto: ${challenge.title}.`}
      footer={
        <Button
          variant="dark"
          disabled={!team.trim()}
          onClick={() => {
            onSave(team.trim(), n);
            onClose();
          }}
        >
          Sumar {n}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Carrera" htmlFor="bonus-team">
          <input
            id="bonus-team"
            className={inputClass}
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            list="bonus-teams"
          />
          <datalist id="bonus-teams">
            {teams.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Asistencias">
          <Stepper value={n} onChange={setN} min={1} max={60} label="Asistencias" />
        </FormField>
      </div>
    </Drawer>
  );
}

function ChallengeDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { now, update } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const [title, setTitle] = React.useState("");
  const [startsOn, setStartsOn] = React.useState(today);
  const [weeks, setWeeks] = React.useState(4);
  const [prize, setPrize] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setTitle("Reto entre carreras");
    setStartsOn(today);
    setWeeks(4);
    setPrize("");
  }, [open, today]);
  const endsOn = addDays(startsOn, weeks * 7 - 1);
  const valid = title.trim() && prize.trim() && /^\d{4}-\d{2}-\d{2}$/.test(startsOn);

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Nuevo reto"
      description="Cada asistencia a clase suma para la carrera del socio."
      footer={
        <Button
          variant="dark"
          disabled={!valid}
          onClick={() => {
            void update("challenge.create", (d) =>
              createChallenge(d, { title, startsOn, endsOn, prize }, localId("rt")),
            );
            toast.success("Reto creado", "Compártelo el primer día en tus stories.");
            onClose();
          }}
        >
          Crear reto
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Nombre" htmlFor="ch-title">
          <input
            id="ch-title"
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </FormField>
        <FormField label="Empieza" htmlFor="ch-start">
          <input
            id="ch-start"
            type="date"
            className={inputClass}
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
        </FormField>
        <FormField
          label="Duración"
          hint={`Termina el ${dayLabel(`${endsOn}T12:00:00Z`, { weekday: true })}.`}
        >
          <ChoiceChips
            value={String(weeks)}
            onChange={(v) => setWeeks(Number(v))}
            options={[
              { value: "2", label: "2 semanas" },
              { value: "4", label: "4 semanas" },
              { value: "6", label: "6 semanas" },
            ]}
          />
        </FormField>
        <FormField
          label="Premio para la carrera ganadora"
          htmlFor="ch-prize"
          hint="Lo decides tú: camisetas, una clase especial, una foto en la pared."
        >
          <input
            id="ch-prize"
            className={inputClass}
            value={prize}
            onChange={(e) => setPrize(e.target.value)}
            placeholder="Camiseta del box para toda la carrera"
          />
        </FormField>
      </div>
    </Drawer>
  );
}

function ReferralsView() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const board = referralBoard(data);
  const reward = data.classExtras?.referralReward ?? "";
  const [prize, setPrize] = React.useState(reward);
  const [query, setQuery] = React.useState("");
  React.useEffect(() => setPrize(reward), [reward]);
  const sender = data.space.owner.firstName || data.space.name;
  const q = query.trim().toLowerCase();
  const members = data.members
    .filter((m) => m.status === "active")
    .filter((m) => !q || m.name.toLowerCase().includes(q))
    .slice(0, q ? 12 : 6);
  const invited = board.reduce((a, r) => a + r.invited, 0);
  const joined = board.reduce((a, r) => a + r.joined, 0);
  const pending = board.flatMap((r) => r.unrewarded.map((ref) => ({ ref, member: r.member })));

  return (
    <div className="flex flex-col gap-5">
      <KpiRow>
        <Kpi
          icon={Users}
          label="Amigos invitados"
          value={invited}
          hint="con el enlace de un socio"
        />
        <Kpi
          icon={Check}
          label="Se han apuntado"
          value={joined}
          hint={
            invited
              ? `${Math.round((joined / invited) * 100)} % de los invitados`
              : "todavía ninguno"
          }
        />
        <Kpi
          icon={Gift}
          label="Premios por dar"
          value={pending.length}
          emphasis={pending.length > 0}
          hint={pending.length ? "toca para verlos" : "todo entregado"}
        />
        <Kpi
          icon={Trophy}
          label="Quien más trae"
          value={board[0]?.joined ? board[0].member.name.split(" ")[0] : "Nadie aún"}
          hint={board[0]?.joined ? plural(board[0].joined, "alta", "altas") : "invita a tus fijos"}
        />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Quién trae a quién" flush>
          {board.length ? (
            <ul className="divide-y divide-border-light">
              {board.map((row) => (
                <li key={row.member.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <Avatar
                    name={row.member.name}
                    size="sm"
                    tone={row.joined ? "emerald" : "slate"}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{row.member.name}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {plural(row.invited, "invitado", "invitados")},{" "}
                      {plural(row.trials, "en prueba", "en prueba")},{" "}
                      {plural(row.joined, "alta", "altas")}
                    </span>
                  </span>
                  {row.unrewarded.length ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        for (const ref of row.unrewarded)
                          void update("referral.reward", (d) => rewardReferral(d, ref.id, now));
                        toast.success(
                          "Premio entregado",
                          reward ? `${row.member.name.split(" ")[0]}: ${reward}.` : undefined,
                        );
                      }}
                    >
                      <Gift className="h-3.5 w-3.5" /> Dar premio
                    </Button>
                  ) : row.joined ? (
                    <Pill tone="success">Al día</Pill>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              icon={Users}
              title="Nadie ha invitado todavía"
              body="Pide a tus socios más fijos que traigan a alguien: cada uno tiene su enlace de clase de prueba."
            />
          )}
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel
            title="Premio por traer a un amigo"
            description="Se lo lleva quien invita cuando su amigo se apunta."
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className={inputClass}
                value={prize}
                onChange={(e) => setPrize(e.target.value)}
                placeholder="un mes de cuota a mitad de precio"
                aria-label="Premio"
              />
              <Button
                variant="outline"
                disabled={prize.trim() === reward}
                onClick={() => {
                  void update("referral.prize", (d) =>
                    withExtras(d, (x) => ({ ...x, referralReward: prize.trim() || undefined })),
                  );
                  toast.success("Premio guardado");
                }}
              >
                Guardar
              </Button>
            </div>
          </Panel>

          <Panel
            title="Pedir a un socio que invite"
            description="Le llega su enlace personal por WhatsApp."
            flush
          >
            <div className="border-b border-border-light px-4 py-3 sm:px-5">
              <SearchInput value={query} onChange={setQuery} placeholder="Buscar socio" />
            </div>
            <ul className="divide-y divide-border-light">
              {members.map((m) => {
                const url = referralUrl(data.space.slug, m.id);
                const link = customerWhatsApp(
                  m.phone,
                  askReferralMessage(m, sender, data.space.name, url, reward),
                );
                return (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                    <Avatar name={m.name} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Copiar el texto para ${m.name}`}
                      onClick={() =>
                        void shareOrCopy(
                          referralMessage(m, data.space.name, url),
                          () => toast.success("Texto copiado", "Para que lo reenvíe a su amigo."),
                          () => toast.info("No se ha podido copiar"),
                        )
                      }
                    >
                      <Link2 className="h-3.5 w-3.5" />
                    </Button>
                    {link ? (
                      <Button size="sm" variant="secondary" asChild>
                        <a href={link} target="_blank" rel="noreferrer">
                          <MessageCircle className="h-3.5 w-3.5" /> Pedir
                        </a>
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Escape room                                                         */
/* ------------------------------------------------------------------ */

type RoomTab = "ranking" | "universidades" | "siguiente";

function RoomRankingSection() {
  const { data, now } = usePro();
  const [tab, setTab] = React.useState<RoomTab>("ranking");
  const [adding, setAdding] = React.useState(false);
  const rooms = data.classTypes.filter((ct) => isRoomMode(data, ct));
  const month = roomRanking(data, "all", "month", now);
  const record = roomRanking(data, "all", "all", now)[0];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Ranking"
        title="A por el récord"
        description={
          record
            ? `Récord del local: ${record.team} en ${formatRecord(record.seconds ?? 0, "s")}. Este mes ${plural(month.length, "grupo ha escapado", "grupos han escapado")}.`
            : "Guarda el tiempo de cada partida al salir: el ranking de cada sala hace que vuelvan a por el récord."
        }
        actions={
          <Button variant="dark" onClick={() => setAdding(true)} disabled={!rooms.length}>
            <Timer className="h-4 w-4" /> Guardar resultado
          </Button>
        }
      />
      <Segmented
        label="Vista"
        value={tab}
        onChange={setTab}
        options={[
          { value: "ranking", label: "Ranking de salas" },
          { value: "universidades", label: "Universidades" },
          { value: "siguiente", label: "Su próxima sala" },
        ]}
      />
      {tab === "ranking" ? <RankingView /> : null}
      {tab === "universidades" ? <UniversitiesView /> : null}
      {tab === "siguiente" ? <NextRoomView /> : null}
      <RoomResultDrawer open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function RankingView() {
  const { data, now } = usePro();
  const toast = useToast();
  const rooms = data.classTypes.filter((ct) => isRoomMode(data, ct));
  const [room, setRoom] = React.useState<string>("all");
  const [scope, setScope] = React.useState<"month" | "all">("month");
  const list = roomRanking(data, room, scope, now).slice(0, 15);
  const roomName = (id: string) => data.classTypes.find((c) => c.id === id)?.name ?? "Sala";

  const share = () => {
    const title = room === "all" ? data.space.name : roomName(room);
    const text = `${title}, ${scope === "month" ? "ranking del mes" : "ranking histórico"}\n${list
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.team}: ${formatRecord(r.seconds ?? 0, "s")}`)
      .join("\n")}\n¿Os atrevéis a bajarlo?`;
    void shareOrCopy(
      text,
      () => toast.success("Ranking copiado", "Pégalo en tus stories."),
      () => toast.info("No se ha podido compartir"),
    );
  };

  return (
    <Panel
      title={room === "all" ? "Todas las salas" : roomName(room)}
      description="Solo los grupos que escaparon, del más rápido al más lento. A igual tiempo, menos pistas."
      action={
        <Button size="sm" variant="secondary" onClick={share} disabled={!list.length}>
          <Share2 className="h-3.5 w-3.5" /> Compartir
        </Button>
      }
      flush
    >
      <div className="flex flex-col gap-3 border-b border-border-light px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <ChoiceChips
          value={room}
          onChange={setRoom}
          options={[
            { value: "all", label: "Todas" },
            ...rooms.map((r) => ({ value: r.id, label: r.name })),
          ]}
        />
        <Segmented
          size="sm"
          value={scope}
          onChange={setScope}
          options={[
            { value: "month", label: "Este mes" },
            { value: "all", label: "Histórico" },
          ]}
        />
      </div>
      {list.length ? (
        <ol className="divide-y divide-border-light">
          {list.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <span
                className={cn(
                  "w-6 shrink-0 font-heading text-lg font-extrabold tabular",
                  i === 0 ? "text-violet" : "text-text-muted",
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{r.team}</span>
                <span className="block truncate text-xs text-text-muted">
                  {room === "all" ? `${roomName(r.classTypeId)} · ` : ""}
                  {plural(r.players, "jugador", "jugadores")} · {plural(r.hints, "pista", "pistas")}
                  {r.university ? ` · ${shortUni(r.university)}` : ""}
                </span>
              </span>
              <span className="w-14 shrink-0 text-right font-heading font-bold tabular">
                {formatRecord(r.seconds ?? 0, "s")}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <Empty
          icon={Trophy}
          title="Sin tiempos todavía"
          body="Al terminar una partida, guarda si escaparon, el tiempo y las pistas. Desde la reserva o con el botón de arriba."
        />
      )}
    </Panel>
  );
}

function UniversitiesView() {
  const { data } = usePro();
  const [by, setBy] = React.useState<"university" | "faculty">("university");
  const rows = rankingByUniversity(data, by);
  const top = Math.max(1, ...rows.map((r) => r.games));
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel
        title={by === "university" ? "Partidas por universidad" : "Partidas por facultad"}
        action={
          <Segmented
            size="sm"
            value={by}
            onChange={setBy}
            options={[
              { value: "university", label: "Universidad" },
              { value: "faculty", label: "Facultad" },
            ]}
          />
        }
        flush
      >
        {rows.length ? (
          <ul className="divide-y divide-border-light">
            {rows.map((r) => (
              <li key={r.label} className="px-4 py-3 sm:px-5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-semibold">{r.label}</span>
                  <span className="shrink-0 tabular text-text-muted">
                    {r.escapes}/{r.games} escaparon
                    {r.bestSeconds ? ` · mejor ${formatRecord(r.bestSeconds, "s")}` : ""}
                  </span>
                </div>
                <Meter value={r.games} max={top} className="mt-2" />
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            icon={Users}
            title="Aún no hay datos"
            body="Al guardar un resultado, apunta la universidad o la facultad del grupo."
          />
        )}
      </Panel>
      <Tip title="Torneo entre delegaciones">
        Con esta tabla tienes el gancho: invita a las delegaciones de las facultades que más juegan
        a un torneo de un mes, con el mejor tiempo de cada una en el ranking. Los grupos llegan
        hechos.
      </Tip>
    </div>
  );
}

/** Grupos que jugaron hace poco y la sala que les queda por descubrir. */
function NextRoomView() {
  const { data, now } = usePro();
  const from = addDays(localDate(now), -30);
  const played = data.bookings
    .filter((b) => b.sessionId && (b.status === "arrived" || b.status === "done"))
    .map((b) => ({ b, s: data.sessions.find((x) => x.id === b.sessionId) }))
    .filter((x): x is { b: ProBooking; s: ProClassSession } => Boolean(x.s))
    .filter(({ s }) => localDate(s.start) >= from && new Date(s.end).getTime() <= now.getTime())
    .filter(({ s }) =>
      isRoomMode(
        data,
        data.classTypes.find((c) => c.id === s.classTypeId),
      ),
    )
    .sort((a, b) => b.s.start.localeCompare(a.s.start));
  const seen = new Set<string>();
  const unique = played.filter(({ b }) => {
    const key = b.clientId ?? b.clientName;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <Panel
      title="Su próxima sala"
      description="Quien sale contento de una sala vuelve a por la siguiente si se lo propones en los días siguientes."
      flush
    >
      {unique.length ? (
        <ul className="divide-y divide-border-light">
          {unique.slice(0, 20).map(({ b, s }) => (
            <NextRoomRow key={b.id} booking={b} session={s} />
          ))}
        </ul>
      ) : (
        <Empty
          icon={Gift}
          title="Nadie ha jugado este mes"
          body="Aquí aparecerán los grupos que terminen una partida, con la sala que les queda."
        />
      )}
    </Panel>
  );
}

function NextRoomRow({ booking, session }: { booking: ProBooking; session: ProClassSession }) {
  const { data, now } = usePro();
  const collection = playerCollection(
    data,
    { id: booking.clientId, name: booking.clientName },
    now,
  );
  const playedType = data.classTypes.find((c) => c.id === session.classTypeId);
  const next = collection.next[0];
  const free = next ? nextFreeSession(data, next.id, now) : undefined;
  const phone =
    data.classExtras?.roomBookings[booking.id]?.phone ??
    data.clients.find((c) => c.id === booking.clientId)?.phone;
  const link =
    next && playedType
      ? customerWhatsApp(
          phone,
          nextRoomMessage(
            booking.clientName,
            playedType,
            next,
            data.space.name,
            `https://franky.es/n/${data.space.slug}`,
          ),
        )
      : undefined;
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <Avatar name={booking.clientName} size="sm" tone="violet" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{booking.clientName}</span>
        <span className="block truncate text-xs text-text-muted">
          {collection.played.length}/{collection.played.length + collection.next.length} salas
          {next ? ` · le queda ${next.name}` : " · las ha jugado todas"}
          {free
            ? `, libre el ${dayLabel(free.start, { weekday: true }).split(",")[0]} a las ${time(free.start)}`
            : ""}
        </span>
      </span>
      {link ? (
        <Button size="sm" variant="secondary" asChild>
          <a href={link} target="_blank" rel="noreferrer">
            <MessageCircle className="h-3.5 w-3.5" /> Proponer
          </a>
        </Button>
      ) : collection.next.length === 0 ? (
        <Pill tone="success">Colección completa</Pill>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Guardar el resultado de una partida                                 */
/* ------------------------------------------------------------------ */

export function RoomResultForm({
  booking,
  session,
  onSaved,
}: {
  booking?: ProBooking;
  session?: ProClassSession;
  onSaved?: () => void;
}) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const rooms = data.classTypes.filter((ct) => isRoomMode(data, ct));
  const saved = booking ? resultForBooking(data, booking.id) : undefined;
  const client = data.clients.find((c) => c.id === booking?.clientId);
  const [room, setRoom] = React.useState(session?.classTypeId ?? rooms[0]?.id ?? "");
  const [team, setTeam] = React.useState(saved?.team ?? booking?.clientName ?? "");
  const [players, setPlayers] = React.useState(saved?.players ?? booking?.partySize ?? 4);
  const [escaped, setEscaped] = React.useState(saved?.escaped ?? true);
  const [clock, setClock] = React.useState(saved?.seconds ? formatRecord(saved.seconds, "s") : "");
  const [hints, setHints] = React.useState(saved?.hints ?? 0);
  const [uni, setUni] = React.useState(saved?.university ?? client?.student?.university ?? "");
  const seconds = parseRecordValue(clock, "s");
  const valid =
    room && team.trim() && (!escaped || (seconds !== null && seconds > 0 && seconds < 3 * 3600));
  const position = escaped && seconds ? rankFor(data, room, seconds) : null;

  const save = () => {
    if (!valid) return;
    const result: ProRoomResult = {
      id: saved?.id ?? localId("rr"),
      classTypeId: room,
      bookingId: booking?.id,
      team: team.trim(),
      players,
      escaped,
      seconds: escaped && seconds ? seconds : undefined,
      hints,
      on: session ? localDate(session.start) : localDate(now),
      university: uni || undefined,
      faculty: client?.student?.faculty,
    };
    void update("room.result", (d) => saveRoomResult(d, result));
    toast.success(
      escaped ? `Escaparon en ${formatRecord(seconds ?? 0, "s")}` : "Resultado guardado",
      position ? `Puesto ${position} del histórico de la sala.` : undefined,
    );
    onSaved?.();
  };

  return (
    <div className="flex flex-col gap-4">
      {!session && rooms.length > 1 ? (
        <FormField label="Sala">
          <ChoiceChips
            value={room}
            onChange={setRoom}
            options={rooms.map((r) => ({ value: r.id, label: r.name }))}
          />
        </FormField>
      ) : null}
      <FormField label="Nombre del equipo" htmlFor="rr-team">
        <input
          id="rr-team"
          className={inputClass}
          value={team}
          onChange={(e) => setTeam(e.target.value)}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Jugadores">
          <Stepper value={players} onChange={setPlayers} min={1} max={12} label="Jugadores" />
        </FormField>
        <FormField label="Pistas">
          <Stepper value={hints} onChange={setHints} min={0} max={20} label="Pistas" />
        </FormField>
      </div>
      <FormField label="¿Escaparon?">
        <ChoiceChips
          value={escaped ? "yes" : "no"}
          onChange={(v) => setEscaped(v === "yes")}
          options={[
            { value: "yes", label: "Sí" },
            { value: "no", label: "No, se acabó el tiempo" },
          ]}
        />
      </FormField>
      {escaped ? (
        <FormField
          label="Tiempo (minutos:segundos)"
          htmlFor="rr-time"
          hint={
            position
              ? `Quedaría en el puesto ${position} del histórico.`
              : clock && seconds === null
                ? "Ejemplo: 47:12"
                : undefined
          }
        >
          <input
            id="rr-time"
            className={inputClass}
            value={clock}
            onChange={(e) => setClock(e.target.value)}
            placeholder="47:12"
            inputMode="text"
            aria-invalid={Boolean(clock && seconds === null)}
          />
        </FormField>
      ) : null}
      <FormField label="Universidad del grupo" hint="Para el ranking por universidades. Opcional.">
        <ChoiceChips
          value={uni}
          onChange={setUni}
          options={[
            { value: "", label: "No lo sé" },
            ...UNIVERSITIES.map((u) => ({ value: u, label: shortUni(u) })),
          ]}
        />
      </FormField>
      <Button variant="dark" onClick={save} disabled={!valid}>
        {saved ? "Actualizar resultado" : "Guardar resultado"}
      </Button>
    </div>
  );
}

function RoomResultDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [key, setKey] = React.useState(0);
  React.useEffect(() => {
    if (open) setKey((k) => k + 1);
  }, [open]);
  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Guardar resultado"
      description="Escaparon o no, en cuánto tiempo y con cuántas pistas."
    >
      <RoomResultForm key={key} onSaved={onClose} />
    </Drawer>
  );
}
