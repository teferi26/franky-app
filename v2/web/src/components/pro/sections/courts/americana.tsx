"use client";

import * as React from "react";
import { Check, Share2, Trash2, Trophy, UserPlus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProAmericana } from "@/lib/pro/courts-types";
import { addDays, dayLabel, localDate, money, plural } from "@/lib/pro/format";
import { hoursFor } from "@/lib/pro/courts";
import { clockLabel, courtsOps, patchCourts } from "@/lib/pro/courts-base";
import { levelLabel, levelOf, levelValue } from "@/lib/pro/courts-ops";
import {
  americanaCourtsNeeded,
  americanaEnd,
  americanaProgress,
  americanaShareText,
  americanaStandings,
  setAmericanaScore,
  startAmericana,
} from "@/lib/pro/courts-compete";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Drawer, FormField, Meter, Pill, inputClass } from "../../kit";

/**
 * Americanas en diez minutos: se crea, se llena, se cierra y las rondas con
 * rotación de parejas salen solas. Los resultados se apuntan desde el móvil y
 * la clasificación se comparte al acabar.
 */

export function shareHref(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function americanaWhen(a: ProAmericana) {
  return `${dayLabel(`${a.date}T12:00:00Z`)}, de ${clockLabel(a.from)} a ${clockLabel(americanaEnd(a))}`;
}

/* ------------------------------------------------------------------ */
/* Nueva americana                                                     */
/* ------------------------------------------------------------------ */

export function NewAmericanaDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const courts = data.resources.filter((r) => r.kind === "court");
  const [name, setName] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [from, setFrom] = React.useState(19 * 60);
  const [players, setPlayers] = React.useState(12);
  const [level, setLevel] = React.useState("2,5 a 3,5");
  const [price, setPrice] = React.useState("10");
  const [rounds, setRounds] = React.useState(6);
  const [studentsOnly, setStudentsOnly] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    let friday = today;
    while (new Date(`${friday}T12:00:00Z`).getUTCDay() !== 5) friday = addDays(friday, 1);
    setName("Americana universitaria");
    setDate(friday);
    setFrom(19 * 60);
    setPlayers(12);
    setLevel("2,5 a 3,5");
    setPrice("10");
    setRounds(6);
    setStudentsOnly(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const needed = americanaCourtsNeeded(players);
  const hours = hoursFor(data, date);
  const minutes = rounds * 20;
  const fits = hours ? from >= hours.open && from + minutes <= hours.close : false;
  const chosen = courts.slice(0, needed).map((r) => r.id);
  const valid = name.trim().length >= 3 && fits && courts.length >= needed;
  const times: number[] = [];
  if (hours) for (let m = hours.open; m + minutes <= hours.close; m += 30) times.push(m);

  const save = () => {
    if (!valid) return;
    const cents = Math.round(Number(price.replace(",", ".")) * 100) || 0;
    const a: ProAmericana = {
      id: localId("am"),
      name: name.trim(),
      date,
      from,
      roundMinutes: 20,
      roundsPlanned: rounds,
      resourceIds: chosen,
      level,
      maxPlayers: players,
      pricePerPlayerCents: cents,
      status: "open",
      players: [],
      rounds: [],
      studentsOnly,
      createdAt: new Date().toISOString(),
    };
    update("court.americana.create", (d) =>
      patchCourts(d, (ops) => ({
        americanas: [...ops.americanas, a],
        blocks: [
          ...ops.blocks,
          {
            id: localId("blk"),
            resourceIds: chosen,
            date,
            from,
            to: from + minutes,
            reason: "tournament",
            note: a.name,
            sourceId: a.id,
          },
        ],
      })),
    );
    toast.success(
      "Americana creada",
      `${plural(needed, "pista bloqueada", "pistas bloqueadas")} el ${dayLabel(`${date}T12:00:00Z`)}. Comparte la invitación para llenarla.`,
    );
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Nueva americana"
      description="Parejas que rotan cada ronda. Las pistas se bloquean solas."
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={save} disabled={!valid}>
            Crear y bloquear pistas
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Nombre" htmlFor="am-name">
          <input id="am-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Día" htmlFor="am-date">
            <input id="am-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Empieza" htmlFor="am-from">
            <select id="am-from" value={from} onChange={(e) => setFrom(Number(e.target.value))} className={inputClass}>
              {times.map((m) => (
                <option key={m} value={m}>
                  {clockLabel(m)}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="Jugadores" hint={`Necesita ${plural(needed, "pista", "pistas")}. Siempre múltiplo de cuatro.`}>
          <ChoiceChips
            value={String(players)}
            onChange={(v) => setPlayers(Number(v))}
            options={[8, 12, 16, 20, 24]
              .filter((n) => americanaCourtsNeeded(n) <= courts.length)
              .map((n) => ({ value: String(n), label: String(n) }))}
          />
        </FormField>
        <FormField label="Rondas de 20 minutos" hint={`Dura ${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}. Nadie repite pareja.`}>
          <ChoiceChips
            value={String(rounds)}
            onChange={(v) => setRounds(Number(v))}
            options={[4, 5, 6, 7]
              .filter((n) => n <= players - 1)
              .map((n) => ({ value: String(n), label: String(n) }))}
          />
        </FormField>
        <FormField label="Nivel">
          <ChoiceChips
            value={level}
            onChange={setLevel}
            options={["Iniciación", "2,5 a 3,5", "3,5 a 4,5", "Todos los niveles"].map((l) => ({ value: l, label: l }))}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Precio por jugador (€)" htmlFor="am-price">
            <input id="am-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
          </FormField>
          <label className="flex items-end gap-2.5 pb-2.5 text-sm">
            <input
              type="checkbox"
              checked={studentsOnly}
              onChange={(e) => setStudentsOnly(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-violet)]"
            />
            Solo estudiantes
          </label>
        </div>
        {!fits ? <p className="text-sm text-rose-600">No cabe en tu horario de ese día.</p> : null}
        <p className="rounded-2xl bg-bg-secondary p-4 text-sm text-text-muted">
          Se bloquean {courts.slice(0, needed).map((r) => r.name).join(", ")} de {clockLabel(from)} a {clockLabel(from + minutes)}.
          {studentsOnly ? " Franky la enseña a estudiantes de nivel parecido cerca de ti." : ""}
        </p>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Ficha de la americana                                               */
/* ------------------------------------------------------------------ */

export function AmericanaDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, update } = usePro();
  const toast = useToast();
  const a = courtsOps(data).americanas.find((x) => x.id === id) ?? null;
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [clientId, setClientId] = React.useState<string | undefined>();

  React.useEffect(() => {
    setName("");
    setPhone("");
    setClientId(undefined);
  }, [id]);

  if (!a) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;

  const courtName = (rid: string) => data.resources.find((r) => r.id === rid)?.name ?? "";
  const standings = americanaStandings(a);
  const progress = americanaProgress(a);
  const usable = Math.floor(a.players.length / 4) * 4;
  const patch = (fn: (x: ProAmericana) => ProAmericana, label: string) =>
    update(label, (d) =>
      patchCourts(d, (ops) => ({ americanas: ops.americanas.map((x) => (x.id === a.id ? fn(x) : x)) })),
    );

  const q = name.trim().toLowerCase();
  const suggestions =
    q.length >= 2 && !clientId
      ? data.clients.filter((c) => c.name.toLowerCase().includes(q) && !a.players.some((p) => p.name === c.name)).slice(0, 4)
      : [];

  const addPlayer = () => {
    if (name.trim().length < 2 || a.players.length >= a.maxPlayers) return;
    const level = levelOf(data, clientId)?.level;
    patch(
      (x) => ({
        ...x,
        players: [
          ...x.players,
          { id: localId("ap"), name: name.trim(), phone: phone.trim() || undefined, clientId, level, paid: false },
        ],
      }),
      "court.americana.player",
    );
    setName("");
    setPhone("");
    setClientId(undefined);
  };

  const markPaid = (playerId: string) => {
    const player = a.players.find((p) => p.id === playerId);
    if (!player || player.paid) return;
    update("court.americana.paid", (d) => {
      const next = patchCourts(d, (ops) => ({
        americanas: ops.americanas.map((x) =>
          x.id === a.id ? { ...x, players: x.players.map((p) => (p.id === playerId ? { ...p, paid: true } : p)) } : x,
        ),
      }));
      if (!a.pricePerPlayerCents) return next;
      return {
        ...next,
        payments: [
          ...next.payments,
          {
            id: localId("p"),
            at: new Date().toISOString(),
            clientName: player.name,
            concept: `Inscripción ${a.name}`,
            amountCents: a.pricePerPlayerCents,
            tipCents: 0,
            method: "bizum",
          },
        ],
      };
    });
  };

  const start = () => {
    update("court.americana.start", (d) => startAmericana(d, a.id, localId("blk")));
    toast.success("Rondas listas", `${a.roundsPlanned} rondas con ${usable} jugadores. Nadie repite pareja.`);
  };

  const finish = () => {
    patch((x) => ({ ...x, status: "done" }), "court.americana.finish");
    toast.success("Americana terminada", `Gana ${standings[0]?.name ?? ""}. Comparte la clasificación.`);
  };

  const share =
    a.status === "open"
      ? `${a.name} en ${data.space.name}: ${americanaWhen(a)}. Nivel ${a.level}${a.pricePerPlayerCents ? `, ${money(a.pricePerPlayerCents)} por jugador` : ""}. Quedan ${a.maxPlayers - a.players.length} plazas. ¡Apúntate respondiendo a este mensaje!`
      : americanaShareText(a, data.space.name);

  const footer =
    a.status === "open" ? (
      <>
        <a href={shareHref(share)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
          <Share2 className="h-4 w-4" /> Invitar
        </a>
        <Button variant="dark" onClick={start} disabled={usable < 8}>
          Cerrar y generar rondas
        </Button>
      </>
    ) : a.status === "playing" ? (
      <>
        <Button variant="dark" onClick={finish} disabled={progress.played === 0}>
          Terminar americana
        </Button>
      </>
    ) : (
      <a href={shareHref(share)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "dark" })}>
        <Share2 className="h-4 w-4" /> Compartir clasificación
      </a>
    );

  return (
    <Drawer open onOpenChange={(v) => !v && onClose()} title={a.name} description={americanaWhen(a)} footer={footer} wide>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone={a.status === "open" ? "violet" : a.status === "playing" ? "info" : "success"}>
            {a.status === "open" ? "Inscripción abierta" : a.status === "playing" ? "Jugando" : "Terminada"}
          </Pill>
          <Pill>Nivel {a.level}</Pill>
          <Pill>{a.resourceIds.map(courtName).join(", ")}</Pill>
          {a.studentsOnly ? <Pill tone="violet">Solo estudiantes</Pill> : null}
        </div>

        {a.status === "open" ? (
          <>
            <div>
              <div className="flex items-baseline justify-between">
                <p className="font-heading text-2xl font-extrabold tabular">
                  {a.players.length}
                  <span className="text-base text-text-muted">/{a.maxPlayers}</span>
                </p>
                <p className="text-sm text-text-muted">
                  {a.players.filter((p) => p.paid).length} han pagado
                </p>
              </div>
              <Meter value={a.players.length} max={a.maxPlayers} className="mt-2" />
              {a.players.length % 4 ? (
                <p className="mt-1.5 text-xs text-text-muted">
                  Con {a.players.length} se juega con {usable}; faltan {4 - (a.players.length % 4)} para cuadrar otra pista.
                </p>
              ) : null}
            </div>
            <ul className="flex flex-col divide-y divide-border-light rounded-2xl border border-border px-3">
              {a.players.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5 py-2">
                  <Avatar name={p.name} size="sm" tone={p.paid ? "emerald" : "slate"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-text-muted">
                      {p.level ? `Nivel ${levelLabel(p.level)}` : "Sin nivel"}
                    </span>
                  </span>
                  {p.paid ? (
                    <Pill tone="success">
                      <Check className="h-3 w-3" /> Pagado
                    </Pill>
                  ) : (
                    <Button size="sm" variant="outline" className="min-h-10" onClick={() => markPaid(p.id)}>
                      Cobrar {a.pricePerPlayerCents ? money(a.pricePerPlayerCents) : ""}
                    </Button>
                  )}
                  <button
                    type="button"
                    aria-label={`Quitar a ${p.name}`}
                    onClick={() => patch((x) => ({ ...x, players: x.players.filter((y) => y.id !== p.id) }), "court.americana.remove")}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-text-muted hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.9} />
                  </button>
                </li>
              ))}
              {!a.players.length ? <li className="py-4 text-center text-sm text-text-muted">Aún no hay nadie apuntado.</li> : null}
            </ul>
            {a.players.length < a.maxPlayers ? (
              <FormField label="Apuntar a alguien" htmlFor="am-player">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input
                    id="am-player"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setClientId(undefined);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                    placeholder="Nombre"
                    autoComplete="off"
                    className={inputClass}
                  />
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Móvil" inputMode="tel" aria-label="Móvil" className={inputClass} />
                  <Button variant="outline" className="min-h-10" onClick={addPlayer} disabled={name.trim().length < 2}>
                    <UserPlus className="h-4 w-4" /> Apuntar
                  </Button>
                </div>
                {suggestions.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setName(c.name);
                          setPhone(c.phone ?? "");
                          setClientId(c.id);
                        }}
                        className="inline-flex min-h-10 items-center gap-1 rounded-full border border-border px-3 text-xs font-semibold text-text-secondary hover:border-violet/40 hover:text-violet"
                      >
                        {c.name}
                        {levelOf(data, c.id) ? (
                          <span className="font-normal text-text-muted">· {levelLabel(levelOf(data, c.id)!.level)}</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </FormField>
            ) : null}
            <p className="text-xs text-text-muted">
              Nivel medio de los apuntados:{" "}
              {a.players.some((p) => p.level)
                ? levelLabel(
                    Math.round(
                      (a.players.filter((p) => p.level).reduce((s, p) => s + (p.level ?? 0), 0) /
                        a.players.filter((p) => p.level).length) *
                        4,
                    ) / 4,
                  )
                : levelLabel(levelValue(a.level))}
              .
            </p>
          </>
        ) : (
          <>
            <Standings americana={a} />
            <div className="flex flex-col gap-4">
              {a.rounds.map((r) => (
                <section key={r.index}>
                  <p className="eyebrow mb-2">
                    Ronda {r.index} · {clockLabel(a.from + (r.index - 1) * a.roundMinutes)}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {r.games.map((g, gi) => (
                      <li key={gi} className="rounded-xl border border-border p-3">
                        <p className="text-xs font-semibold text-text-muted">{courtName(g.resourceId)}</p>
                        <div className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 text-sm">
                          <span className="truncate">{g.teamA.map((pid) => playerName(a, pid)).join(" y ")}</span>
                          <ScoreInput
                            label={`Juegos de ${g.teamA.map((pid) => playerName(a, pid)).join(" y ")}`}
                            value={g.scoreA}
                            disabled={a.status === "done"}
                            onChange={(v) =>
                              update("court.americana.score", (d) =>
                                setAmericanaScore(d, { id: a.id, round: r.index, game: gi, scoreA: v, scoreB: g.scoreB }),
                              )
                            }
                          />
                          <span className="truncate">{g.teamB.map((pid) => playerName(a, pid)).join(" y ")}</span>
                          <ScoreInput
                            label={`Juegos de ${g.teamB.map((pid) => playerName(a, pid)).join(" y ")}`}
                            value={g.scoreB}
                            disabled={a.status === "done"}
                            onChange={(v) =>
                              update("court.americana.score", (d) =>
                                setAmericanaScore(d, { id: a.id, round: r.index, game: gi, scoreA: g.scoreA, scoreB: v }),
                              )
                            }
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}

function playerName(a: ProAmericana, id: string) {
  const p = a.players.find((x) => x.id === id);
  return p ? p.name.split(" ")[0] + (p.name.split(" ")[1] ? ` ${p.name.split(" ")[1][0]}.` : "") : "";
}

function ScoreInput({
  value,
  onChange,
  label,
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={9}
      aria-label={label}
      disabled={disabled}
      value={value ?? ""}
      onChange={(e) => {
        const n = e.target.value === "" ? null : Math.max(0, Math.min(9, Number(e.target.value)));
        onChange(Number.isFinite(n as number) || n === null ? n : null);
      }}
      className="h-10 w-14 rounded-xl border border-border bg-bg-primary text-center font-heading text-lg font-bold tabular focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/20 disabled:opacity-70"
    />
  );
}

export function Standings({ americana: a, limit }: { americana: ProAmericana; limit?: number }) {
  const rows = americanaStandings(a).slice(0, limit ?? 99);
  const progress = americanaProgress(a);
  return (
    <div className="rounded-2xl border border-border">
      <div className="flex items-center justify-between border-b border-border-light px-4 py-2.5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Trophy className="h-4 w-4 text-violet" strokeWidth={1.9} /> Clasificación
        </p>
        <p className="text-xs text-text-muted tabular">
          {progress.played} de {progress.total} partidos
        </p>
      </div>
      <ol className="divide-y divide-border-light">
        {rows.map((s, i) => (
          <li key={s.playerId} className={cn("flex items-center gap-3 px-4 py-2 text-sm", i === 0 && s.games > 0 && "bg-violet-50/60")}>
            <span className="w-5 text-right font-heading font-bold tabular">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
            <span className="text-xs text-text-muted tabular">{s.wins} ganados</span>
            <span className="w-16 text-right font-heading font-bold tabular">{s.games} juegos</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
