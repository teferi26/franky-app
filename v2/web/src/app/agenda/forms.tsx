"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DAY_LABELS,
  fromLocalInputValue,
  newId,
  toLocalInputValue,
  type ClassItem,
  type ExamItem,
  type TaskItem,
  type TaskPriority,
} from "@/lib/agenda-types";

// ─── Formularios de la agenda (clase, examen, entrega) ────────────────────
// Tres diálogos pequeños con el mismo esqueleto: reciben el elemento a editar
// (o null para crear), validan lo mínimo y devuelven el elemento completo.
// El guardado en la nube lo hace el padre (client.tsx), aquí solo se recogen
// datos. Las horas y fechas se manejan en hora local del navegador, igual que
// la app usa la del móvil: el ISO que viaja al JSON ya lleva la zona.

// Mismo acabado que ui/input.tsx: alto de 44 px, borde hairline y foco violeta
// con anillo de 3 px. Aquí se repite como clase porque los campos nativos de
// fecha y hora no pasan por el componente.
const inputCls =
  "flex h-11 w-full rounded-xl border border-border bg-bg-primary px-3.5 py-2 text-[15px] text-text-primary transition-[border-color,box-shadow] duration-200 placeholder:text-text-muted hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15";
const labelCls = "mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary";

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ErrorLine({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <p role="alert" className="rounded-xl bg-error/5 p-3 text-sm text-error">
      {msg}
    </p>
  );
}

// ── Clase ──────────────────────────────────────────────────────────────────
export function ClassDialog({
  open,
  item,
  defaultDay,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  item: ClassItem | null;
  /** Día preseleccionado al crear desde una columna de la rejilla. */
  defaultDay?: number;
  onClose: () => void;
  onSave: (c: ClassItem) => void;
  onDelete?: (id: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [day, setDay] = useState(1);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [room, setRoom] = useState("");
  const [teacher, setTeacher] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setSubject(item?.subject ?? "");
    setDay(item?.dayOfWeek ?? defaultDay ?? 1);
    setStart(item?.startTime ?? "09:00");
    setEnd(item?.endTime ?? "10:00");
    setRoom(item?.room ?? "");
    setTeacher(item?.teacher ?? "");
  }, [open, item, defaultDay]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = subject.trim();
    if (!s) return setError("Pon el nombre de la asignatura.");
    if (!start || !end) return setError("Indica la hora de inicio y la de fin.");
    if (end <= start) return setError("La hora de fin tiene que ser posterior a la de inicio.");
    onSave({
      id: item?.id ?? newId(),
      subject: s,
      dayOfWeek: day,
      startTime: start,
      endTime: end,
      room: room.trim() || null,
      teacher: teacher.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{item ? "Editar clase" : "Nueva clase"}</DialogTitle>
            <DialogDescription>Se repite cada semana el día que elijas.</DialogDescription>
          </DialogHeader>
          <ErrorLine msg={error} />
          <Field id="cl-subject" label="Asignatura">
            <input id="cl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Cálculo I" className={inputCls} autoFocus />
          </Field>
          <Field id="cl-day" label="Día">
            <select id="cl-day" value={day} onChange={(e) => setDay(Number(e.target.value))} className={inputCls}>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <option key={d} value={d}>{DAY_LABELS[d]}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="cl-start" label="Empieza">
              <input id="cl-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} required />
            </Field>
            <Field id="cl-end" label="Termina">
              <input id="cl-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} required />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="cl-room" label="Aula (opcional)">
              <input id="cl-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="A2.3" className={inputCls} />
            </Field>
            <Field id="cl-teacher" label="Profesor/a (opcional)">
              <input id="cl-teacher" value={teacher} onChange={(e) => setTeacher(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {item && onDelete ? (
              <Button type="button" variant="ghost" className="text-error hover:bg-error/5 hover:text-error" onClick={() => onDelete(item.id)}>
                <Trash2 className="h-4 w-4" /> Borrar
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Examen ─────────────────────────────────────────────────────────────────
export function ExamDialog({
  open,
  item,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  item: ExamItem | null;
  onClose: () => void;
  onSave: (e: ExamItem) => void;
  onDelete?: (id: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [when, setWhen] = useState("");
  const [room, setRoom] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setSubject(item?.subject ?? "");
    setWhen(toLocalInputValue(item?.date ?? null));
    setRoom(item?.room ?? "");
  }, [open, item]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = subject.trim();
    if (!s) return setError("Pon el nombre de la asignatura.");
    const iso = fromLocalInputValue(when);
    if (!iso) return setError("Indica la fecha y la hora del examen.");
    onSave({ id: item?.id ?? newId(), subject: s, date: iso, room: room.trim() || null });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{item ? "Editar examen" : "Nuevo examen"}</DialogTitle>
            <DialogDescription>Verás la cuenta atrás en &quot;Hoy&quot; y en la lista de exámenes.</DialogDescription>
          </DialogHeader>
          <ErrorLine msg={error} />
          <Field id="ex-subject" label="Asignatura">
            <input id="ex-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Álgebra" className={inputCls} autoFocus />
          </Field>
          <Field id="ex-when" label="Fecha y hora">
            <input id="ex-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} required />
          </Field>
          <Field id="ex-room" label="Aula (opcional)">
            <input id="ex-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Aula magna" className={inputCls} />
          </Field>
          <DialogFooter className="gap-2 sm:justify-between">
            {item && onDelete ? (
              <Button type="button" variant="ghost" className="text-error hover:bg-error/5 hover:text-error" onClick={() => onDelete(item.id)}>
                <Trash2 className="h-4 w-4" /> Borrar
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Entrega ────────────────────────────────────────────────────────────────
const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "alta", label: "Alta" },
  { value: "normal", label: "Normal" },
  { value: "baja", label: "Baja" },
];

export function TaskDialog({
  open,
  item,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  item: TaskItem | null;
  onClose: () => void;
  onSave: (t: TaskItem) => void;
  onDelete?: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setTitle(item?.title ?? "");
    setSubject(item?.subject ?? "");
    setDue(toLocalInputValue(item?.due ?? null));
    setPriority(item?.priority ?? "normal");
  }, [open, item]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return setError("Pon un título a la entrega.");
    onSave({
      id: item?.id ?? newId(),
      title: t,
      subject: subject.trim() || null,
      due: fromLocalInputValue(due),
      priority,
      done: item?.done ?? false,
      doneAt: item?.doneAt ?? null,
      createdAt: item?.createdAt ?? new Date().toISOString(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{item ? "Editar entrega" : "Nueva entrega"}</DialogTitle>
            <DialogDescription>Trabajos, prácticas o tareas con fecha límite.</DialogDescription>
          </DialogHeader>
          <ErrorLine msg={error} />
          <Field id="tk-title" label="Título">
            <input id="tk-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Práctica 2 de Bases de Datos" className={inputCls} autoFocus />
          </Field>
          <Field id="tk-subject" label="Asignatura (opcional)">
            <input id="tk-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
          </Field>
          <Field id="tk-due" label="Fecha límite (opcional)">
            <input id="tk-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
          </Field>
          <fieldset>
            <legend className={labelCls}>Prioridad</legend>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={priority === p.value}
                  onClick={() => setPriority(p.value)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    priority === p.value
                      ? "border-text-primary bg-text-primary text-bg-primary"
                      : "border-border text-text-muted hover:border-text-primary/40 hover:text-text-primary"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </fieldset>
          <DialogFooter className="gap-2 sm:justify-between">
            {item && onDelete ? (
              <Button type="button" variant="ghost" className="text-error hover:bg-error/5 hover:text-error" onClick={() => onDelete(item.id)}>
                <Trash2 className="h-4 w-4" /> Borrar
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
