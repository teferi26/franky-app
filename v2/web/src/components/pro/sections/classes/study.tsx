"use client";

import * as React from "react";
import QRCode from "qrcode";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Link2,
  MessageCircle,
  Plus,
  Printer,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProClassSession } from "@/lib/pro/types";
import type { ProCefrLevel, ProGrade } from "@/lib/pro/classes-types";
import { dayLabel, localDate, money, plural, time } from "@/lib/pro/format";
import { careOf, extrasOf, monthLabel } from "@/lib/pro/classes-care";
import { typeExtra } from "@/lib/pro/classes-ops";
import { groupStudents } from "@/lib/pro/classes-play";
import {
  CEFR_LEVELS,
  GRADE_KIND_LABEL,
  REINFORCE_BELOW,
  addGrade,
  addMaterial,
  continuityDue,
  continuityFor,
  continuityMessage,
  courseForecast,
  formatGrade,
  gradeTrend,
  groupLevel,
  groupsForLevel,
  hasLevelGroups,
  markContinuityOffered,
  materialsMessage,
  materialsOf,
  memberGrades,
  needsReinforcement,
  nextLevel,
  noticeboard,
  parseGrade,
  recoveryRulesOf,
  reinforcementMessage,
  removeGrade,
  removeMaterial,
  setGroupLevel,
  setMemberLevel,
  setNextGroup,
  setRecoveryRules,
  type ContinuityItem,
  type GradeTrend,
} from "@/lib/pro/classes-study";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Drawer, FormField, Panel, Pill, inputClass } from "../../kit";
import { Stepper, escapeHtml, printSheet } from "./ui";

/**
 * Lo propio de una academia, tercera ola: notas de simulacros con quién
 * necesita refuerzo, niveles de idiomas, el grupo que sigue al acabar una
 * asignatura, el material de cada grupo, el tablón imprimible, la norma de
 * recuperaciones y la previsión del curso entero.
 */

function senderOf(data: { space: { name: string; owner: { firstName?: string } } }) {
  return data.space.owner.firstName || data.space.name;
}

function whenLabel(startIso: string): string {
  const day = dayLabel(startIso, { weekday: true }).split(",")[0].toLowerCase();
  return `el ${day} a las ${time(startIso)}`;
}

/** Abre WhatsApp sin destinatario para pegar el texto en el grupo de clase. */
function shareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/* ------------------------------------------------------------------ */
/* Notas: tendencia y gráfico pequeño                                  */
/* ------------------------------------------------------------------ */

function TrendPill({ trend }: { trend: GradeTrend }) {
  if (trend.last === null) return null;
  const low = (trend.average ?? 10) < REINFORCE_BELOW;
  if (trend.direction === "up") {
    return (
      <Pill tone="success">
        <TrendingUp className="h-3 w-3" /> Mejora
      </Pill>
    );
  }
  if (trend.direction === "down") {
    return (
      <Pill tone={low ? "danger" : "warning"}>
        <TrendingDown className="h-3 w-3" /> Baja
      </Pill>
    );
  }
  return low ? <Pill tone="danger">Necesita refuerzo</Pill> : null;
}

/** Barras de 0 a 10, una por nota, con la raya del cinco. */
function GradeBars({ grades }: { grades: ProGrade[] }) {
  const last = grades.slice(-8);
  return (
    <div
      className="relative flex h-20 items-end gap-1.5 rounded-xl bg-bg-secondary px-3 pb-2 pt-3"
      role="img"
      aria-label={`Notas: ${last.map((g) => formatGrade(g.grade)).join(", ")}`}
    >
      <span
        className="pointer-events-none absolute inset-x-3 border-t border-dashed border-border"
        style={{ bottom: `calc(0.5rem + ${(REINFORCE_BELOW / 10) * 3.75}rem)` }}
        aria-hidden
      />
      {last.map((g) => (
        <span key={g.id} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="text-[0.65rem] font-semibold tabular text-text-muted">{formatGrade(g.grade)}</span>
          <span
            className={cn(
              "w-full max-w-7 rounded-md",
              g.grade < REINFORCE_BELOW ? "bg-rose-400 dark:bg-rose-500" : "bg-violet",
            )}
            style={{ height: `${Math.max(0.25, (g.grade / 10) * 3.75)}rem` }}
          />
        </span>
      ))}
    </div>
  );
}

/** Notas de un alumno en su ficha, con el botón para apuntar la siguiente. */
export function MemberGrades({ memberId }: { memberId: string }) {
  const { data, update } = usePro();
  const [adding, setAdding] = React.useState(false);
  const grades = memberGrades(data, memberId);
  const trend = gradeTrend(grades);
  const typeName = (id?: string) => data.classTypes.find((c) => c.id === id)?.name;
  const recent = [...grades].reverse().slice(0, 3);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[0.82rem] font-semibold">
          Notas y simulacros <TrendPill trend={trend} />
        </h3>
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Apuntar nota
        </Button>
      </div>
      {grades.length ? (
        <>
          <GradeBars grades={grades} />
          <ul className="flex flex-col gap-1">
            {recent.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {g.topic}
                  <span className="text-text-muted">
                    {" "}
                    · {typeName(g.classTypeId) ?? GRADE_KIND_LABEL[g.kind]} ·{" "}
                    {dayLabel(`${g.on}T12:00:00Z`, { weekday: false })}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span
                    className={cn(
                      "font-heading font-bold tabular",
                      g.grade < REINFORCE_BELOW && "text-rose-700 dark:text-rose-300",
                    )}
                  >
                    {formatGrade(g.grade)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Borrar la nota de ${g.topic}`}
                    onClick={() => void update("grade.remove", (d) => removeGrade(d, g.id))}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-text-muted hover:bg-bg-secondary hover:text-rose-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="rounded-xl bg-bg-secondary px-3 py-2.5 text-sm text-text-muted">
          Sin notas todavía. Apunta la de su próximo simulacro y verás si va a mejor antes del examen.
        </p>
      )}
      <GradeDrawer open={adding} memberId={memberId} onClose={() => setAdding(false)} />
    </section>
  );
}

/** Apuntar una nota: alumno (si no viene dado), grupo, tema y nota. */
export function GradeDrawer({
  open,
  memberId,
  classTypeId,
  onClose,
}: {
  open: boolean;
  memberId?: string;
  classTypeId?: string;
  onClose: () => void;
}) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [who, setWho] = React.useState(memberId ?? "");
  const [group, setGroup] = React.useState(classTypeId ?? "");
  const [topic, setTopic] = React.useState("");
  const [value, setValue] = React.useState("");
  const [kind, setKind] = React.useState<ProGrade["kind"]>("mock");

  React.useEffect(() => {
    if (!open) return;
    setWho(memberId ?? "");
    setGroup(classTypeId ?? "");
    setTopic("");
    setValue("");
    setKind("mock");
  }, [open, memberId, classTypeId]);

  const parsed = parseGrade(value);
  // Los grupos a los que va el alumno, o todos si todavía no ha reservado.
  const groups = data.classTypes.filter(
    (c) => !who || groupStudents(data, c.id).some((m) => m.id === who),
  );
  const people = classTypeId ? groupStudents(data, classTypeId) : [];
  const ready = Boolean(who && topic.trim() && parsed !== null);

  const save = () => {
    if (!ready || parsed === null) return;
    const grade: ProGrade = {
      id: localId("gr"),
      memberId: who,
      classTypeId: group || undefined,
      on: localDate(now),
      topic: topic.trim(),
      grade: parsed,
      kind,
    };
    void update("grade.add", (d) => addGrade(d, grade));
    toast.success(
      "Nota apuntada",
      parsed < REINFORCE_BELOW ? "Por debajo del cinco: aparece en Necesitan refuerzo." : undefined,
    );
    // Si viene de un grupo, deja el formulario listo para el siguiente alumno.
    if (classTypeId) {
      setWho("");
      setValue("");
      return;
    }
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Apuntar nota"
      description="Simulacro, parcial o prueba de clase. Nota sobre 10."
      footer={
        <Button variant="dark" onClick={save} disabled={!ready}>
          Guardar nota
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {classTypeId ? (
          <FormField label="Alumno">
            <div className="flex flex-wrap gap-2">
              {people.map((m) => (
                <Button
                  key={m.id}
                  size="sm"
                  variant={who === m.id ? "dark" : "outline"}
                  onClick={() => setWho(m.id)}
                >
                  {m.name}
                </Button>
              ))}
            </div>
          </FormField>
        ) : null}
        {!classTypeId && groups.length ? (
          <FormField label="Grupo">
            <ChoiceChips
              value={group}
              onChange={setGroup}
              options={groups.map((c) => ({ value: c.id, label: c.name }))}
            />
          </FormField>
        ) : null}
        <FormField label="Qué ha sido">
          <ChoiceChips
            value={kind}
            onChange={setKind}
            options={(Object.keys(GRADE_KIND_LABEL) as ProGrade["kind"][]).map((k) => ({
              value: k,
              label: GRADE_KIND_LABEL[k],
            }))}
          />
        </FormField>
        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
          <FormField label="Tema" htmlFor="gr-topic">
            <input
              id="gr-topic"
              className={inputClass}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Derivadas, listening..."
            />
          </FormField>
          <FormField label="Nota" htmlFor="gr-value">
            <input
              id="gr-value"
              inputMode="decimal"
              className={inputClass}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="6,5"
            />
          </FormField>
        </div>
        {value && parsed === null ? (
          <p className="text-sm text-rose-700 dark:text-rose-300">Escribe una nota de 0 a 10, por ejemplo 6,5.</p>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Nivel de idiomas en la ficha                                        */
/* ------------------------------------------------------------------ */

export function MemberLevel({ memberId }: { memberId: string }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  if (!hasLevelGroups(data)) return null;
  const level = careOf(data, memberId).level;
  const groups = level ? groupsForLevel(data, level, now) : [];
  const up = level ? nextLevel(level) : null;
  const upGroups = up ? groupsForLevel(data, up, now) : [];
  const member = data.members.find((m) => m.id === memberId);
  const first = member?.name.split(" ")[0] ?? "";

  const set = (next: ProCefrLevel, promoted = false) => {
    void update("member.level", (d) => setMemberLevel(d, memberId, next));
    if (promoted) toast.success(`${first} pasa a ${next}`, "Apúntale en su nuevo grupo desde la lista de la clase.");
  };

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[0.82rem] font-semibold">Nivel de idioma</h3>
      <ChoiceChips
        value={level ?? ("" as ProCefrLevel)}
        onChange={(v) => set(v)}
        options={CEFR_LEVELS.map((l) => ({ value: l, label: l }))}
      />
      {level ? (
        groups.length ? (
          <ul className="flex flex-col gap-1.5">
            {groups.map((g) => (
              <li key={g.classType.id} className="flex items-center justify-between gap-3 rounded-xl bg-bg-secondary px-3 py-2 text-sm">
                <span className="min-w-0 truncate font-semibold">{g.classType.name}</span>
                <span className="shrink-0 text-xs text-text-muted">
                  {g.nextSession ? `${whenLabel(g.nextSession.start)}, ${plural(g.free, "plaza", "plazas")}` : "Sin clases programadas"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">No tienes grupos de {level}. Créalo en Grupos con {level} en el nombre.</p>
        )
      ) : (
        <p className="text-sm text-text-muted">Tras su prueba de nivel, márcalo y te enseñamos los grupos con plaza.</p>
      )}
      {up ? (
        <Button size="sm" variant="outline" className="self-start" onClick={() => set(up, true)}>
          <ArrowRight className="h-3.5 w-3.5" /> Pasar a {up}
          {upGroups.length ? ` (${upGroups[0].classType.name})` : ""}
        </Button>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pestaña Grupo de la clase: refuerzo, material, continuidad, nivel    */
/* ------------------------------------------------------------------ */

export function GroupStudy({ session }: { session: ProClassSession }) {
  const { data, now, can } = usePro();
  const ct = data.classTypes.find((c) => c.id === session.classTypeId);
  if (!ct) return null;
  const manage = can("class.material");
  return (
    <div className="flex flex-col gap-5">
      <Reinforcement typeId={ct.id} />
      <Materials typeId={ct.id} editable={manage} />
      <NextGroup typeId={ct.id} editable={can("class.next")} />
      {groupLevel(data, ct) !== null || typeExtra(data, ct.id).cefr ? (
        <GroupLevel typeId={ct.id} editable={can("class.level")} />
      ) : null}
      <p className="text-xs text-text-muted">
        {plural(groupStudents(data, ct.id).length, "alumno en el grupo", "alumnos en el grupo")} ·{" "}
        {extrasOf(data).grades?.filter((g) => g.classTypeId === ct.id && g.on <= localDate(now)).length ?? 0} notas
        apuntadas
      </p>
    </div>
  );
}

function Reinforcement({ typeId }: { typeId: string }) {
  const { data, now } = usePro();
  const [adding, setAdding] = React.useState(false);
  const ct = data.classTypes.find((c) => c.id === typeId)!;
  const weak = needsReinforcement(data, typeId);
  const examOn = typeExtra(data, typeId).examOn;
  const today = localDate(now);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[0.82rem] font-semibold">
          Necesitan refuerzo
          {examOn && examOn >= today ? (
            <span className="font-normal text-text-muted">
              {" "}
              · examen el {dayLabel(`${examOn}T12:00:00Z`, { weekday: false })}
            </span>
          ) : null}
        </h3>
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Notas del simulacro
        </Button>
      </div>
      {weak.length ? (
        <ul className="flex flex-col divide-y divide-border-light rounded-2xl border border-border">
          {weak.map(({ member, trend }) => {
            const link = customerWhatsApp(
              member.phone,
              reinforcementMessage(member, ct.name, examOn, today, senderOf(data), data.space.name),
            );
            return (
              <li key={member.id} className="flex items-center gap-3 px-3 py-2">
                <Avatar name={member.name} size="sm" tone="rose" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{member.name}</span>
                  <span className="block truncate text-xs text-text-muted">
                    Media {formatGrade(trend.average ?? 0)}, última {formatGrade(trend.last ?? 0)}
                  </span>
                </span>
                <TrendPill trend={trend} />
                {link ? (
                  <Button size="sm" variant="secondary" asChild>
                    <a href={link} target="_blank" rel="noreferrer" aria-label={`Escribir a ${member.name}`}>
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl bg-bg-secondary px-3 py-2.5 text-sm text-text-muted">
          Nadie por debajo del cinco. Apunta las notas de cada simulacro y aquí verás quién va flojo antes del examen.
        </p>
      )}
      <GradeDrawer open={adding} classTypeId={typeId} onClose={() => setAdding(false)} />
    </section>
  );
}

function Materials({ typeId, editable }: { typeId: string; editable: boolean }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const ct = data.classTypes.find((c) => c.id === typeId)!;
  const list = materialsOf(data, typeId);
  const text = materialsMessage(ct.name, list, senderOf(data), data.space.name);

  const add = () => {
    const next = addMaterial(data, typeId, { title, url }, "check", now);
    if (next === data) {
      toast.info("Revisa el enlace", "Pon un nombre y un enlace completo, por ejemplo drive.google.com/...");
      return;
    }
    void update("class.material", (d) => addMaterial(d, typeId, { title, url }, localId("mt"), now));
    setTitle("");
    setUrl("");
    setAdding(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado", "Pégalo en el grupo de la clase.");
    } catch {
      toast.info("No se pudo copiar", "Tu navegador no deja copiar desde aquí.");
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[0.82rem] font-semibold">Material del grupo</h3>
        {editable ? (
          <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-3.5 w-3.5" /> Añadir enlace
          </Button>
        ) : null}
      </div>
      {list.length ? (
        <ul className="flex flex-col divide-y divide-border-light rounded-2xl border border-border">
          {list.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2">
              <Link2 className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.8} />
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-violet"
              >
                {m.title}
              </a>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.8} />
              {editable ? (
                <button
                  type="button"
                  aria-label={`Quitar ${m.title}`}
                  onClick={() => void update("class.material", (d) => removeMaterial(d, typeId, m.id))}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-muted hover:bg-bg-secondary hover:text-rose-600"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : !adding ? (
        <p className="rounded-xl bg-bg-secondary px-3 py-2.5 text-sm text-text-muted">
          Apuntes, temario o tu carpeta de Drive. Los compartes con el grupo por WhatsApp en un toque, sin campus
          virtual.
        </p>
      ) : null}
      {adding ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-bg-secondary p-3">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nombre: Apuntes del tema 3"
            aria-label="Nombre del material"
          />
          <input
            className={inputClass}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enlace: drive.google.com/..."
            aria-label="Enlace"
            inputMode="url"
          />
          <Button size="sm" variant="dark" className="self-end" onClick={add} disabled={!title.trim() || !url.trim()}>
            Guardar
          </Button>
        </div>
      ) : null}
      {list.length ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" asChild>
            <a href={shareLink(text)} target="_blank" rel="noreferrer">
              <MessageCircle className="h-3.5 w-3.5" /> Enviar al grupo
            </a>
          </Button>
          <Button size="sm" variant="ghost" onClick={copy}>
            <Copy className="h-3.5 w-3.5" /> Copiar
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function NextGroup({ typeId, editable }: { typeId: string; editable: boolean }) {
  const { data, now, update } = usePro();
  const nextId = typeExtra(data, typeId).nextTypeId;
  const item = continuityFor(data, typeId, now);
  const others = data.classTypes.filter((c) => c.id !== typeId && c.active !== false);
  const [choosing, setChoosing] = React.useState(false);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[0.82rem] font-semibold">Al acabar, siguen en</h3>
        {editable ? (
          <Button size="sm" variant="ghost" onClick={() => setChoosing((v) => !v)}>
            {nextId ? "Cambiar" : "Elegir grupo"}
          </Button>
        ) : null}
      </div>
      {choosing ? (
        <ChoiceChips
          value={nextId ?? ""}
          onChange={(v) => {
            void update("class.next", (d) => setNextGroup(d, typeId, v || undefined));
            setChoosing(false);
          }}
          options={[
            { value: "", label: "Ninguno" },
            ...others.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      ) : null}
      {item ? (
        <ContinuityList item={item} />
      ) : !choosing ? (
        <p className="rounded-xl bg-bg-secondary px-3 py-2.5 text-sm text-text-muted">
          Elige el grupo que va después (de Cálculo I a Cálculo II) y te preparamos el mensaje para cada alumno
          cuando acabe.
        </p>
      ) : null}
    </section>
  );
}

/** Alumnos a los que proponer el grupo siguiente, con su mensaje listo. */
function ContinuityList({ item, compact }: { item: ContinuityItem; compact?: boolean }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const when = item.nextSession ? whenLabel(item.nextSession.start) : "";
  const people = compact ? item.students.slice(0, 4) : item.students;
  if (!item.students.length) {
    return (
      <p className="flex items-center gap-1.5 rounded-xl bg-bg-secondary px-3 py-2.5 text-sm text-text-muted">
        <Check className="h-4 w-4 text-emerald-600" /> {item.to.name}: todos avisados o ya apuntados.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-border-light rounded-2xl border border-border">
        {people.map((m) => {
          const link = customerWhatsApp(
            m.phone,
            continuityMessage(m, item, when, senderOf(data), data.space.name),
          );
          return (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2">
              <Avatar name={m.name} size="sm" tone="violet" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}</span>
              {link ? (
                <Button size="sm" variant="secondary" asChild>
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => void update("member.continuity", (d) => markContinuityOffered(d, [m.id], now))}
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> Proponer
                  </a>
                </Button>
              ) : (
                <span className="text-xs text-text-muted">Sin móvil</span>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="min-h-10 self-start text-sm font-semibold text-violet"
        onClick={() => {
          void update("member.continuity", (d) =>
            markContinuityOffered(d, item.students.map((m) => m.id), now),
          );
          toast.success("Hecho", `${plural(item.students.length, "alumno avisado", "alumnos avisados")} de ${item.to.name}.`);
        }}
      >
        Ya se lo he dicho a todos
      </button>
    </div>
  );
}

function GroupLevel({ typeId, editable }: { typeId: string; editable: boolean }) {
  const { data, update } = usePro();
  const ct = data.classTypes.find((c) => c.id === typeId)!;
  const level = groupLevel(data, ct);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[0.82rem] font-semibold">Nivel del grupo</h3>
      {editable ? (
        <ChoiceChips
          value={level ?? ("" as ProCefrLevel)}
          onChange={(v) => void update("class.level", (d) => setGroupLevel(d, typeId, v))}
          options={CEFR_LEVELS.map((l) => ({ value: l, label: l }))}
        />
      ) : (
        <p className="text-sm">{level ?? "Sin nivel"}</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Hoy: grupos que acaban y quién sigue                                */
/* ------------------------------------------------------------------ */

export function ContinuityToday() {
  const { data, now } = usePro();
  const due = continuityDue(data, now);
  if (!due.length) return null;
  return (
    <Panel
      title="Siguiente asignatura"
      description="Sus grupos acaban ahora. Guárdales sitio en el siguiente antes de que busquen otra academia."
    >
      <div className="flex flex-col gap-4">
        {due.map((item) => (
          <div key={item.from.id} className="flex flex-col gap-2">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
              {item.from.name} <ArrowRight className="h-3.5 w-3.5 text-text-muted" /> {item.to.name}
              <span className="font-normal text-text-muted">
                · {plural(item.students.length, "alumno", "alumnos")}
              </span>
            </p>
            <ContinuityList item={item} compact />
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** En Hoy: quién va flojo en el grupo con el examen más cercano. */
export function ReinforcementToday() {
  const { data, now } = usePro();
  const today = localDate(now);
  const soon = data.classTypes
    .map((ct) => ({ ct, examOn: typeExtra(data, ct.id).examOn }))
    .filter((x): x is { ct: (typeof data.classTypes)[number]; examOn: string } =>
      Boolean(x.examOn && x.examOn >= today),
    )
    .sort((a, b) => a.examOn.localeCompare(b.examOn))
    .map((x) => ({ ...x, weak: needsReinforcement(data, x.ct.id) }))
    .filter((x) => x.weak.length)[0];
  if (!soon) return null;
  return (
    <Panel
      title="Van flojos antes del examen"
      description={`${soon.ct.name}, examen el ${dayLabel(`${soon.examOn}T12:00:00Z`, { weekday: false })}. Media reciente por debajo del cinco o bajando.`}
      flush
    >
      <ul className="divide-y divide-border-light">
        {soon.weak.slice(0, 4).map(({ member, trend }) => {
          const link = customerWhatsApp(
            member.phone,
            reinforcementMessage(member, soon.ct.name, soon.examOn, today, senderOf(data), data.space.name),
          );
          return (
            <li key={member.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar name={member.name} size="sm" tone="rose" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{member.name}</span>
                <span className="block truncate text-xs text-text-muted">
                  Última nota {formatGrade(trend.last ?? 0)}, media {formatGrade(trend.average ?? 0)}
                </span>
              </span>
              {link ? (
                <Button size="sm" variant="secondary" asChild>
                  <a href={link} target="_blank" rel="noreferrer">
                    Refuerzo
                  </a>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Tablón del centro                                                   */
/* ------------------------------------------------------------------ */

export function NoticeboardButton() {
  const { data, now } = usePro();
  const toast = useToast();
  const ficha = `https://franky.es/n/${data.space.slug}`;
  const [qr, setQr] = React.useState("");
  // El QR se prepara antes: abrir la ventana tras esperar lo bloquea el navegador.
  React.useEffect(() => {
    let alive = true;
    QRCode.toDataURL(ficha, { margin: 1, width: 360, color: { dark: "#121019", light: "#ffffff" } })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(""));
    return () => {
      alive = false;
    };
  }, [ficha]);

  const print = () => {
    const board = noticeboard(data, now);
    const groups = board.groups
      .map(
        (g) => `<tr><td><b>${escapeHtml(g.name)}</b><br><span>${escapeHtml(g.category)}${
          g.level ? `, ${escapeHtml(g.level)}` : ""
        }</span></td><td>${g.slots.map(escapeHtml).join("<br>")}</td><td>${escapeHtml(g.teacher)}</td><td>${g.capacity}</td></tr>`,
      )
      .join("");
    const plans = board.plans
      .map(
        (p) => `<tr><td><b>${escapeHtml(p.name)}</b></td><td>${escapeHtml(money(p.price))} ${escapeHtml(p.period)}${
          p.studentPrice ? `<br><span>Estudiantes: ${escapeHtml(money(p.studentPrice))}</span>` : ""
        }</td><td>${p.enrollment ? escapeHtml(money(p.enrollment)) : "Sin matrícula"}</td></tr>`,
      )
      .join("");
    const ok = printSheet(
      `Tablón de ${data.space.name}`,
      `h1{font-size:28px;margin:0}h2{font-size:15px;text-transform:uppercase;letter-spacing:.12em;color:#6b6878;margin:28px 0 8px}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{border-bottom:1px solid #e6e4ec;padding:8px 6px;text-align:left;vertical-align:top}
th{font-size:12px;color:#6b6878}span{color:#6b6878;font-size:12px}.foot{display:flex;gap:24px;align-items:center;margin-top:28px}`,
      `<h1>${escapeHtml(data.space.name)}</h1><p>${escapeHtml(data.space.address)}, ${escapeHtml(data.space.city)}</p>
<h2>Grupos y horarios</h2><table><tr><th>Grupo</th><th>Días y hora</th><th>Profesor</th><th>Plazas</th></tr>${groups}</table>
<h2>Precios</h2><table><tr><th>Plan</th><th>Precio</th><th>Matrícula</th></tr>${plans}</table>
<p>Formas de pago: tarjeta, Bizum, efectivo, transferencia o domiciliación bancaria.</p>
<div class="foot">${qr ? `<img src="${qr}" width="140" height="140" alt="">` : ""}<p>Reserva tu clase de prueba y mira las plazas libres en Franky:<br><b>${escapeHtml(ficha)}</b></p></div>`,
    );
    if (!ok) toast.info("Permite las ventanas", "Tu navegador ha bloqueado la hoja para imprimir.");
  };
  return (
    <Button variant="outline" onClick={print}>
      <Printer className="h-4 w-4" /> Tablón
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* Norma de recuperaciones                                             */
/* ------------------------------------------------------------------ */

export function RecoveryRulesCard() {
  const { data, update, can } = usePro();
  const toast = useToast();
  const rules = recoveryRulesOf(data);
  const [editing, setEditing] = React.useState(false);
  const [max, setMax] = React.useState(rules.maxPending);
  const [days, setDays] = React.useState(extrasOf(data).recoveryDays);

  React.useEffect(() => {
    if (!editing) return;
    setMax(rules.maxPending);
    setDays(extrasOf(data).recoveryDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  return (
    <section className="rounded-2xl border border-border bg-bg-primary p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Tu norma</p>
          <p className="mt-1 text-sm text-text-secondary">
            Cada falta se puede recuperar en {extrasOf(data).recoveryDays} días en cualquier grupo con hueco de la
            misma asignatura, con un máximo de {plural(rules.maxPending, "clase pendiente", "clases pendientes")} a
            la vez. Al pasar el plazo, caduca sola.
          </p>
        </div>
        {can("recovery.rules") ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cerrar" : "Cambiar"}
          </Button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-4 flex flex-wrap items-end gap-5">
          <div>
            <p className="text-xs font-medium text-text-muted">Días para recuperar</p>
            <Stepper value={days} onChange={setDays} min={7} max={120} label="Días" />
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">Máximo pendientes</p>
            <Stepper value={max} onChange={setMax} min={1} max={20} label="Clases" />
          </div>
          <Button
            variant="dark"
            onClick={() => {
              void update("recovery.rules", (d) => setRecoveryRules(d, { maxPending: max }, days));
              toast.success("Norma guardada", "Se aplica a las próximas faltas.");
              setEditing(false);
            }}
          >
            Guardar
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Previsión del curso entero                                          */
/* ------------------------------------------------------------------ */

export function CourseForecastPanel() {
  const { data, now } = usePro();
  const { months, totalCents } = courseForecast(data, now);
  if (!months.length) return null;
  const max = Math.max(1, ...months.map((m) => m.totalCents));
  const lowest = months.reduce((a, m) => (m.totalCents < a.totalCents ? m : a), months[0]);
  const leaving = Math.max(...months.map((m) => m.leaving));
  return (
    <Panel
      title="El curso entero"
      description={`${money(totalCents, { round: true })} de aquí a agosto con las cuotas de hoy, las pausas con su vuelta y los intensivos ya reservados.${
        leaving ? ` En verano dejan de contar ${plural(leaving, "alumno que ya ha dicho", "alumnos que ya han dicho")} que no sigue.` : ""
      }`}
    >
      <div className="-mx-1 overflow-x-auto px-1 pb-1 pro-scroll">
        <ol className="flex h-44 min-w-[520px] items-end gap-2" aria-label="Previsión por meses">
          {months.map((m) => {
            const h = Math.max(4, Math.round((m.totalCents / max) * 120));
            const ih = m.totalCents ? Math.round((m.intensiveCents / m.totalCents) * h) : 0;
            const low = m.period === lowest.period && months.length > 1;
            return (
              <li key={m.period} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="text-[0.65rem] font-semibold tabular text-text-muted">
                  {money(m.totalCents, { round: true }).replace(/\s?€/, "")}
                </span>
                <span
                  className={cn(
                    "flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-lg",
                    low ? "bg-amber-400 dark:bg-amber-500" : "bg-violet/80",
                  )}
                  style={{ height: `${h}px` }}
                  title={`${monthLabel(m.period)}: ${money(m.totalCents)}`}
                >
                  {ih ? <span className="w-full bg-violet-deep" style={{ height: `${ih}px` }} /> : null}
                </span>
                <span className="text-xs capitalize text-text-muted">{monthLabel(m.period).slice(0, 3)}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-violet/80" /> Cuotas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-violet-deep" /> Intensivos reservados
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> El mes más flojo ({monthLabel(lowest.period)})
        </span>
      </div>
    </Panel>
  );
}
