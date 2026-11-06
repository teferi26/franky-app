"use client";

import * as React from "react";
import { Check, Globe2, Pause, Play, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localId, usePro } from "@/lib/pro/store";
import { relative } from "@/lib/pro/format";
import {
  MENTOR_YEAR_LABEL,
  assignMentor,
  hasRoom,
  mentorLoad,
  mentorsOf,
  pauseMentor,
  waitingDays,
  withMentors,
} from "@/lib/pro/university-mentors";
import type { ProUniMentor } from "@/lib/pro/university-types";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Detail, Drawer, FormField, Pill, inputClass } from "../../kit";
import { facultyOptions, useUniAction } from "./ui";

const CAPACITY = ["1", "2", "3", "4", "5"];

/* ------------------------------------------------------------------ */
/* Alta de mentor                                                      */
/* ------------------------------------------------------------------ */

export function NewMentorDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const faculties = facultyOptions(data);
  const [name, setName] = React.useState("");
  const [faculty, setFaculty] = React.useState("");
  const [year, setYear] = React.useState("3");
  const [capacity, setCapacity] = React.useState("3");

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setFaculty(faculties[0] ?? "");
    setYear("3");
    setCapacity("3");
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valid = name.trim().length > 2 && faculty.trim().length > 1;

  const save = async () => {
    if (!valid) return;
    const mentor: ProUniMentor = {
      id: localId("me"),
      name: name.trim(),
      faculty: faculty.trim(),
      year: Number(year),
      capacity: Number(capacity),
      active: true,
      since: now.toISOString(),
    };
    const ok = await run(
      "mentors.create",
      (d) => withMentors(d, (m) => ({ mentors: [...m.mentors, mentor] })),
      "Mentor dado de alta",
      `${mentor.name} ya puede acompañar a ${capacity === "1" ? "1 persona" : `${capacity} personas`} de primero de ${mentor.faculty}.`,
    );
    if (ok) onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Nuevo mentor"
      description="Estudiante de segundo en adelante que acompaña a quien llega."
      footer={
        <Button variant="dark" onClick={save} disabled={!valid}>
          <UserPlus className="h-4 w-4" /> Dar de alta
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Nombre" htmlFor="me-name">
          <input id="me-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
        </FormField>
        <FormField label="Facultad" htmlFor="me-faculty">
          {faculties.length ? (
            <select id="me-faculty" className={inputClass} value={faculty} onChange={(e) => setFaculty(e.target.value)}>
              {faculties.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          ) : (
            <input id="me-faculty" className={inputClass} value={faculty} onChange={(e) => setFaculty(e.target.value)} placeholder="Derecho" />
          )}
        </FormField>
        <FormField label="Curso">
          <ChoiceChips
            value={year}
            onChange={setYear}
            options={[2, 3, 4, 5].map((y) => ({ value: String(y), label: MENTOR_YEAR_LABEL[y] }))}
          />
        </FormField>
        <FormField label="Puede acompañar a" hint="Personas de primero a la vez. Tres suele ser un buen número.">
          <ChoiceChips value={capacity} onChange={setCapacity} options={CAPACITY.map((c) => ({ value: c, label: c }))} />
        </FormField>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Ficha del mentor                                                    */
/* ------------------------------------------------------------------ */

export function MentorDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const m = mentorsOf(data);
  const mentor = m.mentors.find((x) => x.id === id);
  const [pausing, setPausing] = React.useState(false);

  React.useEffect(() => setPausing(false), [id]);

  if (!mentor) {
    return (
      <Drawer open={false} onOpenChange={(o) => !o && onClose()} title="Mentor">
        <span />
      </Drawer>
    );
  }

  const load = mentorLoad(mentor, m.requests);
  const own = m.requests.filter((r) => r.status === "matched" && r.mentorId === mentor.id);
  const talked = own.filter((r) => r.talked).length;

  const setCapacity = (value: string) =>
    run(
      "mentors.update",
      (d) => withMentors(d, (x) => ({ mentors: x.mentors.map((y) => (y.id === mentor.id ? { ...y, capacity: Number(value) } : y)) })),
      "Plazas actualizadas",
    );

  const pause = async (release: boolean) => {
    const ok = await run(
      "mentors.pause",
      (d) => withMentors(d, (x) => pauseMentor(x, mentor.id, release)),
      `${mentor.name} en pausa`,
      release && load ? `${load === 1 ? "La persona que acompañaba vuelve" : `Las ${load} personas que acompañaba vuelven`} a la cola para darles otro mentor.` : "No recibirá a nadie nuevo.",
    );
    if (ok) onClose();
  };

  const resume = () =>
    run(
      "mentors.resume",
      (d) => withMentors(d, (x) => ({ mentors: x.mentors.map((y) => (y.id === mentor.id ? { ...y, active: true } : y)) })),
      `${mentor.name} vuelve a estar activo`,
    );

  return (
    <Drawer
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      title={mentor.name}
      description={`${mentor.faculty} · ${MENTOR_YEAR_LABEL[mentor.year] ?? `${mentor.year}º`}`}
      footer={
        !mentor.active ? (
          <Button variant="dark" onClick={resume}>
            <Play className="h-4 w-4" /> Reactivar
          </Button>
        ) : pausing ? (
          <>
            <Button variant="ghost" onClick={() => setPausing(false)}>
              Volver
            </Button>
            {load ? (
              <Button variant="outline" onClick={() => pause(false)}>
                Mantener a su gente
              </Button>
            ) : null}
            <Button variant="dark" onClick={() => pause(true)}>
              {load ? "Pasar a su gente a otro" : "Pausar"}
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => setPausing(true)}>
            <Pause className="h-4 w-4" /> Pausar
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Avatar name={mentor.name} size="lg" tone={mentor.active ? "violet" : "slate"} />
          <div className="min-w-0">
            <p className="font-heading text-2xl font-extrabold tabular">
              {load} <span className="text-base font-semibold text-text-muted">de {mentor.capacity}</span>
            </p>
            <p className="text-xs text-text-muted">personas de primero ahora mismo</p>
          </div>
          {!mentor.active ? <Pill className="ml-auto">En pausa</Pill> : null}
        </div>

        <div className="divide-y divide-border-light">
          <Detail label="Mentor desde">{relative(mentor.since, now.getTime())}</Detail>
          <Detail label="Ya se han escrito">
            {own.length ? `${talked} de ${own.length}` : "Aún no acompaña a nadie"}
          </Detail>
        </div>

        {mentor.active ? (
          <FormField label="Puede acompañar a">
            <ChoiceChips value={String(mentor.capacity)} onChange={setCapacity} options={CAPACITY.map((c) => ({ value: c, label: c }))} />
          </FormField>
        ) : null}

        {pausing ? (
          <p className="rounded-2xl bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
            {load
              ? "Deja de recibir gente nueva. Elige si sigue con quien ya acompaña o si pasan a la cola para darles otro mentor."
              : "Deja de recibir gente nueva hasta que lo reactives."}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Elegir mentor a mano para una petición                              */
/* ------------------------------------------------------------------ */

export function AssignDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const m = mentorsOf(data);
  const request = m.requests.find((r) => r.id === id);

  if (!request) {
    return (
      <Drawer open={false} onOpenChange={(o) => !o && onClose()} title="Elegir mentor">
        <span />
      </Drawer>
    );
  }

  // Primero los de su facultad con hueco, después los de otras con hueco.
  const options = m.mentors
    .filter((x) => x.active)
    .map((x) => ({ mentor: x, load: mentorLoad(x, m.requests), same: x.faculty === request.faculty, room: hasRoom(x, m.requests) }))
    .sort((a, b) => Number(b.room) - Number(a.room) || Number(b.same) - Number(a.same) || a.load - b.load);

  const assign = async (mentor: ProUniMentor) => {
    const ok = await run(
      "mentors.assign",
      (d) => withMentors(d, (x) => ({ requests: assignMentor(x.requests, request.id, mentor.id, now) })),
      `Emparejado con ${mentor.name}`,
      "Le llega un aviso para escribir primero.",
    );
    if (ok) onClose();
  };

  return (
    <Drawer
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      title="Elegir mentor"
      description={`Primero de ${request.faculty}, esperando ${waitingDays(request, now) === 0 ? "desde hoy" : `${waitingDays(request, now)} días`}`}
    >
      <div className="flex flex-col gap-3">
        {request.international ? (
          <p className="flex items-center gap-2 rounded-2xl bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
            <Globe2 className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} /> Llega de fuera: si alguien ha estado de Erasmus, mejor.
          </p>
        ) : null}
        {options.length ? (
          <ul className="flex flex-col gap-2">
            {options.map(({ mentor, load, same, room }) => (
              <li key={mentor.id}>
                <button
                  type="button"
                  disabled={!room}
                  onClick={() => assign(mentor)}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-left transition-colors",
                    room ? "hover:border-violet" : "cursor-not-allowed opacity-50",
                  )}
                >
                  <Avatar name={mentor.name} size="sm" tone="violet" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{mentor.name}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {mentor.faculty} · {load} de {mentor.capacity}
                    </span>
                  </span>
                  {!same ? <Pill>Otra facultad</Pill> : null}
                  {room ? <Check className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} /> : <Pill tone="warning">Completo</Pill>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">No hay mentores activos. Da de alta uno desde la página de mentores.</p>
        )}
      </div>
    </Drawer>
  );
}
