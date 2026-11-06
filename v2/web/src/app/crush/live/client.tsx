"use client";

import Link from "next/link";
import { withAccountScope, useAccountGuard } from "@/components/AccountScope";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  Ban,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  HeartCrack,
  History,
  Flag,
  ImageOff,
  Info,
  Loader2,
  MessageCircle,
  PartyPopper,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { trackFire } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  actionLabel,
  ANSWER_QUESTIONS,
  candidatePhotos,
  classifySwipeError,
  GENDER_OPTIONS,
  GOAL_OPTIONS,
  isUuid,
  profileToDraft,
  rpcErrorCopy,
  statePresentation,
  validateProfileDraft,
  type CrushLiveAction,
  type CrushLiveCandidate,
  type CrushLiveEvent,
  type CrushLiveMatch,
  type CrushLiveProfile,
  type CrushLiveProfileDraft,
  type CrushLiveState,
  type CrushLiveSwipeResult,
} from "./model";

type Section = "discover" | "matches" | "profile";

const REPORT_REASONS = [
  { label: "Spam o publicidad", value: "spam" },
  { label: "Contenido inapropiado", value: "contenido_ofensivo" },
  { label: "Acoso o comportamiento abusivo", value: "acoso" },
  { label: "Suplantación de identidad", value: "suplantacion" },
  { label: "Otro motivo", value: "otro" },
] as const;

// Los textos de error viven en model.ts (rpcErrorCopy) para poder testearlos.
const errorCopy = rpcErrorCopy;

/**
 * Respeta "reducir movimiento" del sistema. Con esa preferencia la tarjeta no
 * se inclina ni vuelve animada a su sitio: cambia de estado sin transición.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function eventDate(event: CrushLiveEvent): string {
  const start = new Date(event.start_date);
  const date = start.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = start.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

function matchedDate(value: string): string {
  return new Date(value).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function affinityBand(score: number): "80_100" | "60_79" | "below_60" {
  if (score >= 80) return "80_100";
  if (score >= 60) return "60_79";
  return "below_60";
}

function candidateBand(count: number): "0" | "1_4" | "5_14" | "15_plus" {
  if (count === 0) return "0";
  if (count < 5) return "1_4";
  if (count < 15) return "5_14";
  return "15_plus";
}

function LoadingPanel({ label = "Cargando Crush Live" }: { label?: string }) {
  return (
    <div
      role="status"
      className="rounded-3xl border border-border-light bg-white p-8 shadow-card"
    >
      <div className="mx-auto flex max-w-sm flex-col items-center text-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold text-text-primary">{label}</p>
      </div>
    </div>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Heart;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border-light bg-white px-6 py-12 text-center shadow-card">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50 text-violet">
        <Icon className="h-8 w-8" aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-xl font-extrabold font-heading text-text-primary">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">
        {description}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

function EventSelector({
  events,
  selectedId,
  disabled,
  onChange,
}: {
  events: CrushLiveEvent[];
  selectedId: string | null;
  disabled: boolean;
  onChange: (eventId: string) => void;
}) {
  const selected = events.find((event) => event.id === selectedId) ?? null;
  if (events.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border-light bg-white p-4 shadow-card">
      <label
        htmlFor="crush-live-event"
        className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-text-muted"
      >
        <CalendarDays className="h-4 w-4 text-violet" aria-hidden="true" />
        Evento
      </label>
      <select
        id="crush-live-event"
        value={selectedId ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-border bg-bg-primary px-3 py-2.5 text-sm font-semibold text-text-primary outline-none transition focus:border-violet focus:ring-2 focus:ring-violet/30 disabled:cursor-wait disabled:opacity-60"
      >
        {selectedId && !selected ? (
          // El eventId de la URL no está entre los Live accesibles (enlace
          // caducado o evento sin Live). Sin esta opción el <select> pintaría
          // el primer evento como elegido sin estarlo.
          <option value={selectedId} disabled>
            Evento no disponible
          </option>
        ) : null}
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.title}
          </option>
        ))}
      </select>
      {selected ? (
        <p className="mt-2 text-xs capitalize text-text-muted">{eventDate(selected)}</p>
      ) : null}
    </div>
  );
}

function SectionTabs({
  section,
  matchesCount,
  onChange,
}: {
  section: Section;
  matchesCount: number;
  onChange: (section: Section) => void;
}) {
  const items: Array<{
    key: Section;
    label: string;
    icon: typeof Heart;
  }> = [
    { key: "discover", label: "Descubrir", icon: Sparkles },
    { key: "matches", label: "Matches", icon: History },
    { key: "profile", label: "Ajustes", icon: Settings2 },
  ];

  return (
    <div
      role="tablist"
      aria-label="Secciones de Crush Live"
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          return;
        }
        const tabs = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
        );
        const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
        if (currentIndex < 0 || tabs.length === 0) return;
        event.preventDefault();
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        tabs[nextIndex]?.focus();
        tabs[nextIndex]?.click();
      }}
      className="flex gap-1 rounded-full bg-bg-secondary p-1"
    >
      {items.map(({ key, label, icon: Icon }) => {
        const active = section === key;
        return (
          <button
            key={key}
            id={`crush-live-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`crush-live-panel-${key}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(key)}
            className={cn(
              "relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2.5 text-xs font-semibold transition sm:text-sm",
              active
                ? "bg-white text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
            {key === "matches" && matchesCount > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-fuchsia px-1.5 py-0.5 text-[10px] font-bold text-white">
                {matchesCount > 99 ? "99+" : matchesCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function EligibilityPanel({
  state,
  onShowMatches,
}: {
  state: CrushLiveState;
  onShowMatches: () => void;
}) {
  const content = statePresentation(state.reason, state.event?.id ?? null);
  const isClosed = state.reason === "event_closed";

  return (
    <EmptyPanel
      icon={isClosed ? HeartCrack : ShieldCheck}
      title={content.title}
      description={content.description}
      action={
        isClosed ? (
          <Button onClick={onShowMatches} variant="gradient">
            <History className="h-4 w-4" aria-hidden="true" />
            Ver mis matches
          </Button>
        ) : content.ctaHref && content.ctaLabel ? (
          <Button asChild variant="gradient">
            <Link href={content.ctaHref}>{content.ctaLabel}</Link>
          </Button>
        ) : undefined
      }
    />
  );
}

function LiveProfileForm({
  event,
  profile,
  saving,
  error,
  onSave,
  onDeactivate,
}: {
  event: CrushLiveEvent;
  profile: CrushLiveProfile | null;
  saving: boolean;
  error: string | null;
  onSave: (draft: CrushLiveProfileDraft) => void;
  onDeactivate: () => void;
}) {
  const [draft, setDraft] = useState<CrushLiveProfileDraft>(() =>
    profileToDraft(profile)
  );
  // Los campos de edad se guardan como texto mientras se escriben: con
  // Number("") el campo mostraba un 0 en cuanto se borraba y no dejaba
  // teclear. El borrador numérico se actualiza a la vez y NaN lo detecta
  // validateProfileDraft.
  const [ageText, setAgeText] = useState(() => ({
    min: String(profileToDraft(profile).ageMin),
    max: String(profileToDraft(profile).ageMax),
  }));
  const [consented, setConsented] = useState(profile?.active ?? false);
  const [validation, setValidation] = useState<string | null>(null);

  useEffect(() => {
    const next = profileToDraft(profile);
    setDraft(next);
    setAgeText({ min: String(next.ageMin), max: String(next.ageMax) });
    setConsented(profile?.active ?? false);
    setValidation(null);
  }, [event.id, profile]);

  const updateAge = (field: "min" | "max", text: string) => {
    setAgeText((current) => ({ ...current, [field]: text }));
    const parsed = text.trim() === "" ? Number.NaN : Number(text);
    setDraft((current) => ({
      ...current,
      [field === "min" ? "ageMin" : "ageMax"]: parsed,
    }));
  };

  const toggleGender = (value: CrushLiveProfileDraft["preferredGenders"][number]) => {
    setDraft((current) => ({
      ...current,
      preferredGenders: current.preferredGenders.includes(value)
        ? current.preferredGenders.filter((gender) => gender !== value)
        : [...current.preferredGenders, value],
    }));
  };

  const submit = (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    const problem = validateProfileDraft(draft, consented);
    setValidation(problem);
    if (!problem) onSave(draft);
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-3xl border border-border-light bg-white p-5 shadow-card sm:p-7"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-bg-primary text-violet">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-extrabold font-heading text-text-primary">
            {profile?.active ? "Tu perfil Live" : "Prepara tu perfil Live"}
          </h2>
          <p className="mt-1 text-sm leading-5 text-text-muted">
            Estas preferencias son privadas y se aplican solo a {event.title}.
          </p>
        </div>
      </div>

      <fieldset className="mt-7">
        <legend className="text-sm font-bold text-text-primary">
          ¿Qué buscas en este evento?
        </legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {GOAL_OPTIONS.map((option) => {
            const active = draft.goal === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  "cursor-pointer rounded-2xl border p-3 transition focus-within:ring-2 focus-within:ring-violet/40",
                  active
                    ? "border-violet bg-violet-50"
                    : "border-border-light hover:border-violet/40"
                )}
              >
                <input
                  type="radio"
                  name="goal"
                  value={option.value}
                  checked={active}
                  onChange={() =>
                    setDraft((current) => ({
                      ...current,
                      goal: option.value,
                    }))
                  }
                  className="sr-only"
                />
                <span className="flex items-center gap-2 text-sm font-bold text-text-primary">
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full border",
                      active
                        ? "border-violet bg-violet text-white"
                        : "border-border"
                    )}
                  >
                    {active ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                  </span>
                  {option.label}
                </span>
                <span className="mt-1 block pl-7 text-xs leading-4 text-text-muted">
                  {option.description}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-7">
        <legend className="text-sm font-bold text-text-primary">
          ¿A quién te gustaría conocer?
        </legend>
        <p className="mt-1 text-xs text-text-muted">
          Solo aparecerán perfiles cuyas preferencias también encajen contigo.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {GENDER_OPTIONS.map((option) => {
            const active = draft.preferredGenders.includes(option.value);
            return (
              <label
                key={option.value}
                className={cn(
                  "cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold transition focus-within:ring-2 focus-within:ring-violet/40",
                  active
                    ? "border-violet bg-violet text-white"
                    : "border-border bg-white text-text-secondary hover:border-violet/40"
                )}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleGender(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-7">
        <legend className="text-sm font-bold text-text-primary">
          Rango de edad
        </legend>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-text-muted">
            Desde
            <input
              type="number"
              min={18}
              max={99}
              inputMode="numeric"
              value={ageText.min}
              onChange={(input) => updateAge("min", input.target.value)}
              className="mt-1 block w-full rounded-xl border border-border bg-bg-primary px-3 py-2.5 text-base font-semibold text-text-primary outline-none focus:border-violet focus:ring-2 focus:ring-violet/30"
            />
          </label>
          <label className="text-xs font-semibold text-text-muted">
            Hasta
            <input
              type="number"
              min={18}
              max={99}
              inputMode="numeric"
              value={ageText.max}
              onChange={(input) => updateAge("max", input.target.value)}
              className="mt-1 block w-full rounded-xl border border-border bg-bg-primary px-3 py-2.5 text-base font-semibold text-text-primary outline-none focus:border-violet focus:ring-2 focus:ring-violet/30"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="mt-7">
        <legend className="text-sm font-bold text-text-primary">
          Cinco preguntas para calcular vuestra afinidad
        </legend>
        <p className="mt-1 text-xs leading-5 text-text-muted">
          No hay respuestas buenas o malas. El porcentaje es orientativo: la
          química la decidís vosotros.
        </p>
        <div className="mt-4 space-y-5">
          {ANSWER_QUESTIONS.map((question) => (
            <label key={question.key} className="block">
              <span className="text-sm font-semibold text-text-primary">
                {question.question}
              </span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={draft.answers[question.key]}
                onChange={(input) =>
                  setDraft((current) => ({
                    ...current,
                    answers: {
                      ...current.answers,
                      [question.key]: Number(input.target.value),
                    },
                  }))
                }
                aria-valuetext={`${draft.answers[question.key]} de 5`}
                className="mt-3 h-2 w-full cursor-pointer accent-violet"
              />
              <span className="mt-1 flex justify-between gap-4 text-[11px] text-text-muted">
                <span>{question.low}</span>
                <span className="text-right">{question.high}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-7 flex cursor-pointer items-start gap-3 rounded-2xl border border-violet/20 bg-violet-50/60 p-4">
        <input
          type="checkbox"
          checked={consented}
          onChange={(input) => setConsented(input.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border text-violet focus:ring-violet/40"
        />
        <span className="text-xs leading-5 text-text-secondary">
          Quiero aparecer en Crush Live para {event.title}. Entiendo que solo me
          verán otras personas participantes y que puedo salir cuando quiera.
        </span>
      </label>

      {validation || error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600"
        >
          {validation ?? error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button
          type="submit"
          variant="gradient"
          size="lg"
          disabled={saving}
          aria-busy={saving}
          className="flex-1"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Heart className="h-4 w-4" aria-hidden="true" />
          )}
          {profile?.active ? "Guardar cambios" : "Participar en este Live"}
        </Button>
        {profile?.active ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={saving}
            onClick={onDeactivate}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            Salir de este Live
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function CandidateCard({
  candidate,
  sending,
  safetySending,
  onAction,
  onReport,
  onBlock,
}: {
  candidate: CrushLiveCandidate;
  sending: CrushLiveAction | null;
  safetySending: "report" | "block" | null;
  onAction: (action: CrushLiveAction) => void;
  onReport: (reason: string, label: string) => Promise<string | null>;
  onBlock: () => void;
}) {
  const photos = candidatePhotos(candidate);
  const reducedMotion = usePrefersReducedMotion();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  // Gesto de deslizar: desplazamiento horizontal actual y puntero agarrado.
  // La tarjeta NO se va sola al soltar: vuelve a su sitio y solo desaparece
  // cuando el servidor confirma la decisión (criterio del MVP).
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; pointerId: number } | null>(
    null
  );

  useEffect(() => {
    setPhotoIndex(0);
    setDetailsOpen(false);
    setReportOpen(false);
    setReportReason(null);
    setReportError(null);
    setDragX(0);
    setDragging(false);
    dragStart.current = null;
  }, [candidate.id]);

  // El efecto de arriba corre después de pintar: en el primer render de un
  // candidato nuevo el índice anterior puede quedar fuera de rango y
  // enseñaría un hueco sin foto durante un fotograma.
  const safeIndex = photoIndex < photos.length ? photoIndex : 0;
  const photo = photos[safeIndex] ?? null;
  const person = candidate.full_name ?? "Estudiante";
  const busy = sending !== null || safetySending !== null;
  const selectedReason = REPORT_REASONS.find(
    (reason) => reason.value === reportReason
  );

  // Umbral de decisión: un tercio del ancho de la tarjeta o 110 px, lo que
  // sea menor, para que en móviles estrechos no haya que cruzar la pantalla.
  const decideFromDrag = (deltaX: number, width: number): CrushLiveAction | null => {
    const threshold = Math.min(110, width / 3);
    if (deltaX > threshold) return "like";
    if (deltaX < -threshold) return "pass";
    return null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (busy) return;
    // Los botones de foto siguen siendo pulsables sin iniciar un arrastre.
    if ((event.target as Element).closest("button, a")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    // touch-action: pan-y deja el scroll vertical al navegador. Si el gesto
    // es claramente vertical no movemos la tarjeta para no pelear con él.
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaX) < 12) {
      setDragX(0);
      return;
    }
    setDragX(deltaX);
  };

  const finishDrag = (
    event: React.PointerEvent<HTMLElement>,
    cancelled: boolean
  ) => {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    dragStart.current = null;
    const width = event.currentTarget.getBoundingClientRect().width || 1;
    const action = cancelled
      ? null
      : decideFromDrag(event.clientX - start.x, width);
    setDragging(false);
    setDragX(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (action) onAction(action);
  };

  // Con movimiento reducido la tarjeta se desplaza con el dedo (es
  // manipulación directa) pero no se inclina ni vuelve animada.
  const rotation = reducedMotion ? 0 : Math.max(-12, Math.min(12, dragX / 18));
  const stampOpacity = Math.min(1, Math.abs(dragX) / 110);
  const dragIntent: CrushLiveAction | null =
    dragX > 24 ? "like" : dragX < -24 ? "pass" : null;

  return (
    <div>
      <article
        aria-label={`${person}${candidate.age ? `, ${candidate.age} años` : ""}, ${candidate.compatibility}% de afinidad`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => finishDrag(event, false)}
        onPointerCancel={(event) => finishDrag(event, true)}
        style={{
          touchAction: "pan-y",
          transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
          transition:
            dragging || reducedMotion
              ? "none"
              : "transform 240ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        className={cn(
          "relative mx-auto min-h-[520px] w-full max-w-xl select-none overflow-hidden rounded-[28px] border border-border-light bg-bg-secondary shadow-card-hover sm:min-h-[610px]",
          busy ? "cursor-default" : dragging ? "cursor-grabbing" : "cursor-grab"
        )}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={`Foto de ${person}`}
            draggable={false}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-violet/35">
            <ImageOff className="h-20 w-20" aria-hidden="true" />
          </div>
        )}

        {photos.length > 1 ? (
          <>
            <div className="absolute left-4 right-4 top-3 z-10 flex gap-1.5">
              {photos.map((item, index) => (
                <span
                  key={`${item}-${index}`}
                  className={cn(
                    "h-1 flex-1 rounded-full shadow-sm",
                    index === photoIndex ? "bg-white" : "bg-white/45"
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setPhotoIndex((current) =>
                  current === 0 ? photos.length - 1 : current - 1
                )
              }
              aria-label="Foto anterior"
              className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() =>
                setPhotoIndex((current) => (current + 1) % photos.length)
              }
              aria-label="Foto siguiente"
              className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : null}

        {/* Sellos del gesto: solo decoración, el lector ya conoce la acción
            por los botones y el aria-live. */}
        <span
          aria-hidden="true"
          style={{ opacity: dragIntent === "like" ? stampOpacity : 0 }}
          className="pointer-events-none absolute left-5 top-16 z-20 -rotate-12 rounded-xl border-4 border-fuchsia bg-white/85 px-3 py-1 text-2xl font-extrabold uppercase tracking-wider text-fuchsia"
        >
          Me gusta
        </span>
        <span
          aria-hidden="true"
          style={{ opacity: dragIntent === "pass" ? stampOpacity : 0 }}
          className="pointer-events-none absolute right-5 top-16 z-20 rotate-12 rounded-xl border-4 border-red-500 bg-white/85 px-3 py-1 text-2xl font-extrabold uppercase tracking-wider text-red-500"
        >
          Paso
        </span>

        <div className="absolute right-4 top-5 z-10 rounded-full bg-black/60 px-3 py-2 text-white shadow-sm backdrop-blur-sm">
          <span className="text-lg font-extrabold">{candidate.compatibility}%</span>
          <span className="ml-1 text-[11px] font-semibold text-white/85">afinidad</span>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/65 to-transparent px-5 pb-6 pt-32 text-white sm:px-7">
          <h2 className="text-3xl font-extrabold font-heading">
            {person}
            {candidate.age ? `, ${candidate.age}` : ""}
          </h2>
          {candidate.career ? (
            <p className="mt-1 text-sm font-medium text-white/85">
              {candidate.career}
            </p>
          ) : null}
          {candidate.bio ? (
            <p className="mt-3 line-clamp-2 max-w-lg text-sm leading-5 text-white/85">
              {candidate.bio}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            Ver detalles
          </button>
          {candidate.interests && candidate.interests.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {candidate.interests.slice(0, 4).map((interest) => (
                <span
                  key={interest}
                  className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm"
                >
                  {interest}
                </span>
              ))}
            </div>
          ) : null}
          {candidate.compatibility_reasons.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {candidate.compatibility_reasons.map((reason) => (
                <span
                  key={reason}
                  className="inline-flex items-center gap-1 rounded-full bg-violet/80 px-3 py-1 text-xs font-bold text-white"
                >
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  {reason}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </article>

      <div className="mt-5 flex items-start justify-center gap-8">
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAction("pass")}
            disabled={busy}
            aria-busy={sending === "pass"}
            aria-label={`Pasar el perfil de ${person}`}
            className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-white text-red-500 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:pointer-events-none disabled:opacity-50"
          >
            {sending === "pass" ? (
              <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
            ) : (
              <X className="h-8 w-8" strokeWidth={2.5} aria-hidden="true" />
            )}
          </button>
          <span aria-hidden="true" className="text-xs font-semibold text-text-muted">
            Paso
          </span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAction("like")}
            disabled={busy}
            aria-busy={sending === "like"}
            aria-label={`Me gusta el perfil de ${person}`}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-text-primary text-bg-primary shadow-card-hover transition hover:-translate-y-0.5 hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            {sending === "like" ? (
              <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
            ) : (
              <Heart className="h-8 w-8 fill-current" strokeWidth={2} aria-hidden="true" />
            )}
          </button>
          <span aria-hidden="true" className="text-xs font-semibold text-text-muted">
            Me gusta
          </span>
        </div>
      </div>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-text-muted">
        <ShieldCheck className="h-4 w-4 text-violet" aria-hidden="true" />
        Tu like es privado. Solo os avisamos si es mutuo.
      </p>
      <p className="mt-1 hidden text-center text-[11px] text-text-muted sm:block">
        También puedes arrastrar la tarjeta: a la derecha para Me gusta, a la
        izquierda para Paso.
      </p>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {person}
              {candidate.age ? `, ${candidate.age}` : ""}
            </DialogTitle>
            <DialogDescription>
              {candidate.career ?? "Estudiante"} · {candidate.compatibility}% de
              afinidad
            </DialogDescription>
          </DialogHeader>
          {/* Solo la información admitida en Live: ni enlace al perfil
              público ni mensajes antes del match. */}
          {candidate.bio ? (
            <p className="whitespace-pre-line text-sm leading-6 text-text-secondary">
              {candidate.bio}
            </p>
          ) : (
            <p className="text-sm text-text-muted">
              Esta persona todavía no ha escrito una descripción.
            </p>
          )}
          {candidate.interests && candidate.interests.length > 0 ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-text-muted">
                Intereses
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {candidate.interests.map((interest) => (
                  <li
                    key={interest}
                    className="rounded-full bg-bg-secondary px-3 py-1 text-xs font-semibold text-text-secondary"
                  >
                    {interest}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {candidate.compatibility_reasons.length > 0 ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-text-muted">
                Por qué encajáis
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {candidate.compatibility_reasons.map((reason) => (
                  <li
                    key={reason}
                    className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet"
                  >
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs leading-5 text-text-muted">
            La afinidad es orientativa: ordena perfiles compatibles, no predice
            nada. Las respuestas del cuestionario nunca se muestran.
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setDetailsOpen(false)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="mt-3 flex items-center justify-center gap-4 text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setReportError(null);
            setReportOpen(true);
          }}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-text-muted transition hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:pointer-events-none disabled:opacity-50"
        >
          <Flag className="h-4 w-4" aria-hidden="true" />
          Denunciar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onBlock}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-text-muted transition hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:pointer-events-none disabled:opacity-50"
        >
          {safetySending === "block" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Ban className="h-4 w-4" aria-hidden="true" />
          )}
          Bloquear
        </button>
      </div>

      <Dialog open={reportOpen} onOpenChange={(open) => !busy && setReportOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Denunciar a {person}</DialogTitle>
            <DialogDescription>
              Elige el motivo. La otra persona no sabrá quién envió la denuncia.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-2">
            {REPORT_REASONS.map((reason) => (
              <button
                key={reason.value}
                type="button"
                disabled={busy}
                onClick={() => setReportReason(reason.value)}
                aria-pressed={reportReason === reason.value}
                className={cn(
                  "min-h-11 w-full rounded-xl border px-4 py-2.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet",
                  reportReason === reason.value
                    ? "border-violet bg-violet-50 font-semibold text-violet"
                    : "border-border-light text-text-primary hover:bg-bg-secondary"
                )}
              >
                {reason.label}
              </button>
            ))}
          </div>
          {reportError ? (
            <p
              role="alert"
              className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {reportError}
            </p>
          ) : null}
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setReportOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !selectedReason}
              onClick={async () => {
                if (!selectedReason) return;
                setReportError(null);
                const submitError = await onReport(
                  selectedReason.value,
                  selectedReason.label
                );
                if (submitError) {
                  setReportError(submitError);
                } else {
                  setReportOpen(false);
                  setReportReason(null);
                }
              }}
            >
              {safetySending === "report" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Flag className="h-4 w-4" aria-hidden="true" />
              )}
              Enviar denuncia
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MatchesPanel({
  matches,
  loading,
  error,
  eventId,
  eventTitle,
  onReload,
}: {
  matches: CrushLiveMatch[];
  loading: boolean;
  error: string | null;
  eventId: string | null;
  eventTitle: string | null;
  onReload: () => void;
}) {
  // El historial es global (se conserva entre eventos); el filtro por el
  // evento actual es solo una vista y por defecto no oculta nada.
  const [scope, setScope] = useState<"all" | "event">("all");
  const canFilter = Boolean(eventId) && matches.length > 0;
  const visible =
    scope === "event" && eventId
      ? matches.filter((match) => match.event.id === eventId)
      : matches;

  if (loading) return <LoadingPanel label="Cargando tus matches" />;
  if (error) {
    return (
      <EmptyPanel
        icon={Info}
        title="No pudimos cargar tus matches"
        description={error}
        action={
          <Button onClick={onReload} variant="outline">
            <RefreshCw className="h-4 w-4" /> Reintentar
          </Button>
        }
      />
    );
  }
  if (matches.length === 0) {
    return (
      <EmptyPanel
        icon={HeartCrack}
        title="Aún no tienes matches en Live"
        description="Cuando un like sea mutuo, la persona aparecerá aquí y podréis hablar por Franky."
      />
    );
  }

  return (
    <div>
      {canFilter ? (
        <div
          role="group"
          aria-label="Filtrar matches"
          className="mb-4 flex flex-wrap gap-2"
        >
          {(
            [
              { key: "all", label: "Todos los eventos" },
              { key: "event", label: eventTitle ?? "Este evento" },
            ] as const
          ).map((option) => {
            const active = scope === option.key;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                onClick={() => setScope(option.key)}
                className={cn(
                  "min-h-10 max-w-full truncate rounded-full border px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet",
                  active
                    ? "border-violet bg-violet text-white"
                    : "border-border bg-white text-text-secondary hover:border-violet/40"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {visible.length === 0 ? (
        <EmptyPanel
          icon={HeartCrack}
          title="Todavía no hay matches en este evento"
          description="Tus matches de otros eventos siguen en la vista de todos los eventos."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visible.map((match) => {
        const photo = candidatePhotos({
          ...match.user,
          bio: null,
          interests: null,
          compatibility: match.compatibility,
          compatibility_reasons: match.compatibility_reasons,
        })[0];
        const name = match.user.full_name ?? "Estudiante";
        return (
          <article
            key={match.id}
            className="rounded-2xl border border-border-light bg-white p-4 shadow-card"
          >
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-violet-50">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo}
                    alt={`Foto de ${name}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-violet">
                    <Heart className="h-6 w-6" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-bold text-text-primary">
                  {name}
                  {match.user.age ? `, ${match.user.age}` : ""}
                </h3>
                <p className="truncate text-xs text-text-muted">{match.event.title}</p>
                <p className="mt-1 text-xs font-bold text-fuchsia">
                  {match.compatibility}% afinidad · {matchedDate(match.matched_at)}
                </p>
              </div>
            </div>
            {match.compatibility_reasons.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {match.compatibility_reasons.map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet"
                  >
                    {reason}
                  </span>
                ))}
              </div>
            ) : null}
            {match.conversation_id ? (
              <Button asChild variant="outline" className="mt-4 w-full">
                <Link
                  href={`/chats?chat=${match.conversation_id}`}
                  onClick={() =>
                    trackFire("crush_live_chat_started", {
                      event_id: match.event.id,
                    })
                  }
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Enviar mensaje
                </Link>
              </Button>
            ) : null}
          </article>
        );
      })}
        </div>
      )}
    </div>
  );
}

function MatchDialog({
  match,
  eventId,
  onClose,
  onCloseAutoFocus,
}: {
  match: { candidate: CrushLiveCandidate; result: CrushLiveSwipeResult } | null;
  eventId: string | null;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const candidate = match?.candidate ?? null;
  const result = match?.result ?? null;
  const photo = candidate ? candidatePhotos(candidate)[0] : null;
  const name = candidate?.full_name ?? "Esta persona";

  return (
    <Dialog open={!!match} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        className="max-w-sm overflow-hidden p-0 text-center sm:rounded-3xl"
      >
        <div className="bg-bg-primary px-6 pb-7 pt-9">
          <PartyPopper className="mx-auto h-10 w-10 text-violet" aria-hidden="true" />
          <DialogHeader className="mt-4 text-center sm:text-center">
            <DialogTitle className="text-2xl font-extrabold">
              ¡Es un match!
            </DialogTitle>
            <DialogDescription className="leading-5">
              {name} también te ha dado like. Ya podéis hablar por Franky.
            </DialogDescription>
          </DialogHeader>

          <div className="mx-auto mt-5 h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-violet-50 shadow-lg">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt={`Foto de ${name}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-violet">
                <Heart className="h-9 w-9" />
              </span>
            )}
          </div>

          {result?.compatibility != null ? (
            <p className="mt-4 text-lg font-extrabold text-fuchsia">
              {result.compatibility}% de afinidad
            </p>
          ) : null}
          {result?.compatibility_reasons.length ? (
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {result.compatibility_reasons.map((reason) => (
                <span
                  key={reason}
                  className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-violet"
                >
                  {reason}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-6 grid gap-2">
            {result?.conversation_id ? (
              <Button asChild variant="gradient" size="lg">
                <Link
                  href={`/chats?chat=${result.conversation_id}`}
                  onClick={() =>
                    trackFire("crush_live_chat_started", { event_id: eventId })
                  }
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Enviar mensaje
                </Link>
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onClose}>
              Seguir viendo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CrushLiveClient({
  initialEventId,
}: {
  initialEventId: string | null;
}) {
  const { owner, isCurrent } = useAccountGuard();
  const router = useRouter();
  const confirmDialog = useConfirm();
  const supabase = useMemo(() => createClient(), []);
  const swipeKeys = useRef(
    new Map<string, { key: string; action: CrushLiveAction }>()
  );
  const stateRequest = useRef(0);
  const feedRequest = useRef(0);
  const matchesRequest = useRef(0);
  const mutationRequest = useRef(0);
  const safetyRequest = useRef(0);
  const eventEpoch = useRef(0);
  const swipeInFlight = useRef(false);
  const safetyInFlight = useRef(false);

  const [section, setSection] = useState<Section>("discover");
  const [events, setEvents] = useState<CrushLiveEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    initialEventId
  );
  const [liveState, setLiveState] = useState<CrushLiveState | null>(null);
  const [stateLoading, setStateLoading] = useState(false);
  const [stateError, setStateError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CrushLiveCandidate[] | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [sending, setSending] = useState<CrushLiveAction | null>(null);
  const [safetySending, setSafetySending] = useState<
    "report" | "block" | null
  >(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [matches, setMatches] = useState<CrushLiveMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [matchReveal, setMatchReveal] = useState<{
    candidate: CrushLiveCandidate;
    result: CrushLiveSwipeResult;
  } | null>(null);
  const [announcement, setAnnouncementText] = useState("");
  const announceTick = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const eventsRequest = useRef(0);

  // Una región aria-live solo se lee cuando cambia el DOM: "Perfil
  // descartado." dos veces seguidas no se anunciaba la segunda. Alternar un
  // espacio duro al final fuerza el cambio sin alterar lo que se oye.
  const announce = useCallback((text: string) => {
    announceTick.current += 1;
    setAnnouncementText(announceTick.current % 2 === 0 ? `${text} ` : text);
  }, []);

  const removeCandidate = useCallback((candidateId: string) => {
    setCandidates(
      (current) => current?.filter((item) => item.id !== candidateId) ?? []
    );
  }, []);

  useLayoutEffect(() => {
    eventEpoch.current += 1;
    stateRequest.current += 1;
    feedRequest.current += 1;
    mutationRequest.current += 1;
    safetyRequest.current += 1;
    swipeKeys.current.clear();
    swipeInFlight.current = false;
    safetyInFlight.current = false;
    setLiveState(null);
    setStateLoading(Boolean(selectedEventId));
    setStateError(null);
    setCandidates(selectedEventId ? null : []);
    setFeedError(null);
    setSending(null);
    setSafetySending(null);
    setProfileSaving(false);
    setProfileError(null);
    setMatchReveal(null);
    // Ajustes es por evento y debe cerrarse; Matches es global y se respeta
    // (si no, el autoseleccionar el primer evento sacaba de la pestaña).
    setSection((current) => (current === "profile" ? "discover" : current));
  }, [selectedEventId]);

  const loadMatches = useCallback(async () => {
    if (!isCurrent()) return;
    const request = ++matchesRequest.current;
    setMatchesLoading(true);
    setMatchesError(null);
    const { data, error } = await supabase.rpc("get_crush_live_matches", {
      p_event_id: null,
    });
    if (!isCurrent() || request !== matchesRequest.current) return;
    if (error) {
      setMatches([]);
      setMatchesError(
        errorCopy(error.message, "Revisa tu conexión e inténtalo de nuevo.")
      );
    } else {
      setMatches((data as unknown as CrushLiveMatch[]) ?? []);
    }
    setMatchesLoading(false);
  }, [supabase, isCurrent]);

  const loadEvents = useCallback(async () => {
    // Reintentar rápido dos veces no debe dejar que la respuesta más lenta
    // pise a la más reciente.
    if (!isCurrent()) return;
    const request = ++eventsRequest.current;
    setEventsLoading(true);
    setEventsError(null);
    const { data, error } = await supabase.rpc("get_crush_live_events");
    if (!isCurrent() || request !== eventsRequest.current) return;
    if (error) {
      setEvents([]);
      setEventsError(
        errorCopy(error.message, "No pudimos cargar tus eventos Live.")
      );
      setEventsLoading(false);
      return;
    }
    const rows = (data as unknown as CrushLiveEvent[]) ?? [];
    setEvents(rows);
    setSelectedEventId((current) => current ?? rows[0]?.id ?? null);
    setEventsLoading(false);
  }, [supabase, isCurrent]);

  const loadState = useCallback(
    async (eventId: string) => {
      if (!isCurrent()) return;
    const request = ++stateRequest.current;
      setStateLoading(true);
      setStateError(null);
      if (!isUuid(eventId)) {
        // Un eventId inventado en la URL haría que Postgres devolviera un
        // error de sintaxis y un "Reintentar" inútil. Mismo estado que un
        // evento inexistente, con su enlace a la lista de eventos.
        setLiveState({
          event: null,
          available: false,
          reason: "event_not_found",
          participant: false,
          eligible: false,
          age: null,
          student_verified: false,
          profile: null,
        });
        setStateLoading(false);
        return;
      }
      const { data, error } = await supabase.rpc("get_crush_live_state", {
        p_event_id: eventId,
      });
      if (!isCurrent() || request !== stateRequest.current) return;
      if (error) {
        setLiveState(null);
        setStateError(
          errorCopy(error.message, "No pudimos comprobar tu acceso a este Live.")
        );
      } else {
        setLiveState(data as unknown as CrushLiveState);
      }
      setStateLoading(false);
    },
    [supabase, isCurrent]
  );

  const loadFeed = useCallback(
    async (eventId: string) => {
      if (!isCurrent()) return;
    const request = ++feedRequest.current;
      setCandidates(null);
      setFeedError(null);
      const { data, error } = await supabase.rpc("get_crush_live_feed", {
        p_event_id: eventId,
        p_limit: 30,
      });
      if (!isCurrent() || request !== feedRequest.current) return;
      if (error) {
        setCandidates([]);
        setFeedError(
          errorCopy(error.message, "No pudimos cargar los perfiles de este Live.")
        );
      } else {
        const nextCandidates =
          (data as unknown as CrushLiveCandidate[]) ?? [];
        setCandidates(nextCandidates);
        trackFire("crush_live_deck_loaded", {
          event_id: eventId,
          candidate_band: candidateBand(nextCandidates.length),
        });
      }
    },
    [supabase, isCurrent]
  );

  useEffect(() => {
    loadEvents();
    loadMatches();
  }, [loadEvents, loadMatches]);

  useEffect(() => {
    trackFire("crush_live_entry_viewed", {
      event_id: selectedEventId,
    });
  }, [selectedEventId]);

  useEffect(() => {
    if (!isCurrent() || !selectedEventId) {
      stateRequest.current += 1;
      feedRequest.current += 1;
      setLiveState(null);
      setCandidates([]);
      return;
    }
    loadState(selectedEventId);
  }, [selectedEventId, loadState]);

  useEffect(() => {
    if (
      selectedEventId &&
      liveState?.available &&
      liveState.profile?.active
    ) {
      loadFeed(selectedEventId);
    } else {
      feedRequest.current += 1;
      setCandidates([]);
    }
  }, [selectedEventId, liveState, loadFeed]);

  // Precargar la primera foto de la siguiente persona: al confirmar un swipe
  // la tarjeta nueva aparece con la imagen ya en caché, sin parpadeo gris.
  useEffect(() => {
    const next = candidates?.[1];
    if (!next || typeof window === "undefined") return;
    const src = candidatePhotos(next)[0];
    if (!src) return;
    const image = new window.Image();
    image.decoding = "async";
    image.src = src;
  }, [candidates]);

  const selectableEvents = useMemo(() => {
    if (
      liveState?.event &&
      !events.some((event) => event.id === liveState.event?.id)
    ) {
      return [liveState.event, ...events];
    }
    return events;
  }, [events, liveState]);

  const selectEvent = (eventId: string) => {
    if (!isCurrent()) return;
    setSelectedEventId(eventId);
    router.replace(`/crush/live?eventId=${encodeURIComponent(eventId)}`, {
      scroll: false,
    });
  };

  const saveProfile = async (draft: CrushLiveProfileDraft) => {
    if (!isCurrent() || !selectedEventId) return;
    const eventId = selectedEventId;
    const epoch = eventEpoch.current;
    const mutation = ++mutationRequest.current;
    const wasActive = liveState?.profile?.active === true;
    setProfileSaving(true);
    setProfileError(null);
    const { data, error } = await supabase.rpc("set_crush_live_profile", {
      p_event_id: eventId,
      p_active: true,
      p_goal: draft.goal,
      p_preferred_genders: draft.preferredGenders,
      p_age_min: draft.ageMin,
      p_age_max: draft.ageMax,
      p_answers: draft.answers,
    });
    if (
      !isCurrent() || epoch !== eventEpoch.current ||
      mutation !== mutationRequest.current
    ) return;
    setProfileSaving(false);

    if (error) {
      setProfileError(
        errorCopy(error.message, "No pudimos guardar tu perfil Live.")
      );
      return;
    }

    const profile = data as unknown as CrushLiveProfile;
    setLiveState((current) => (current ? { ...current, profile } : current));
    trackFire(
      wasActive
        ? "crush_live_profile_completed"
        : "crush_live_event_opt_in",
      { event_id: eventId }
    );
    announce("Perfil Live guardado. Ya puedes descubrir personas.");
    setSection("discover");
  };

  const deactivateProfile = async () => {
    if (!isCurrent() || !selectedEventId || !liveState?.profile) return;
    const eventId = selectedEventId;
    const epoch = eventEpoch.current;
    const current = liveState.profile;
    const accepted = await confirmDialog({
      title: "¿Salir de este Live?",
      description:
        "Dejarás de aparecer y se eliminarán los likes pendientes. Tus matches se conservan.",
      confirmText: "Salir de este Live",
      variant: "danger",
    });
    if (!isCurrent() || !accepted) return;
    if (!isCurrent() || epoch !== eventEpoch.current) return;

    const mutation = ++mutationRequest.current;
    setProfileSaving(true);
    setProfileError(null);
    const { data, error } = await supabase.rpc("set_crush_live_profile", {
      p_event_id: eventId,
      p_active: false,
      p_goal: current.goal,
      p_preferred_genders: current.preferred_genders,
      p_age_min: current.age_min,
      p_age_max: current.age_max,
      p_answers: current.answers,
    });
    if (
      !isCurrent() || epoch !== eventEpoch.current ||
      mutation !== mutationRequest.current
    ) return;
    setProfileSaving(false);

    if (error) {
      setProfileError(
        errorCopy(error.message, "No pudimos desactivar tu perfil Live.")
      );
      return;
    }

    const profile = data as unknown as CrushLiveProfile;
    setLiveState((state) => (state ? { ...state, profile } : state));
    setCandidates([]);
    trackFire("crush_live_event_opt_out", { event_id: eventId });
    announce("Has salido de Crush Live para este evento.");
  };

  const swipe = async (action: CrushLiveAction) => {
    const candidate = candidates?.[0];
    if (
      !isCurrent() || !candidate ||
      !selectedEventId ||
      swipeInFlight.current ||
      safetyInFlight.current
    ) return;
    const eventId = selectedEventId;
    const epoch = eventEpoch.current;
    const keyName = `${eventId}:${candidate.id}`;
    const pending = swipeKeys.current.get(keyName);
    if (pending && pending.action !== action) {
      // La petición anterior pudo llegar al servidor aunque no viéramos la
      // respuesta. Repetirla con la misma clave devuelve el resultado
      // guardado (incluido un match); cambiar de acción a ciegas solo daría
      // un swipe_already_decided sin saber qué se guardó.
      setFeedError(
        `Tu ${actionLabel(pending.action)} anterior no llegó a confirmarse. Pulsa ${actionLabel(pending.action)} otra vez para comprobarlo antes de cambiar de decisión.`
      );
      announce("Confirma primero la decisión anterior.");
      return;
    }
    const idempotencyKey = pending?.key ?? window.crypto.randomUUID();
    swipeKeys.current.set(keyName, { key: idempotencyKey, action });
    swipeInFlight.current = true;
    setSending(action);
    setFeedError(null);

    let data: CrushLiveSwipeResult | null = null;
    let errorMessage: string | null = null;
    try {
      const response = await supabase.rpc("crush_live_swipe", {
        p_event_id: eventId,
        p_target_id: candidate.id,
        p_action: action,
        p_idempotency_key: idempotencyKey,
      });
      data = (response.data as unknown as CrushLiveSwipeResult | null) ?? null;
      errorMessage = response.error ? (response.error.message ?? "unknown") : null;
    } catch (caught) {
      // supabase-js devuelve los errores HTTP en `error`, pero un fetch
      // reventado (sin red, extensión que bloquea) puede lanzar. Se trata
      // igual que un fallo de red: la tarjeta se queda y la clave se guarda.
      errorMessage = caught instanceof Error ? caught.message : "failed to fetch";
    }
    if (!isCurrent() || epoch !== eventEpoch.current) {
      // Cambió de evento con la petición en vuelo: el layout effect ya limpió
      // el estado; solo refrescamos el historial si hubo match.
      if (!errorMessage && data?.match) void loadMatches();
      return;
    }
    swipeInFlight.current = false;
    setSending(null);

    if (errorMessage !== null) {
      switch (classifySwipeError(errorMessage)) {
        case "stale":
          swipeKeys.current.delete(keyName);
          setFeedError(
            "Tu participación cambió desde esa decisión. Hemos actualizado el mazo para que puedas elegir de nuevo."
          );
          await loadFeed(eventId);
          return;
        case "conflict":
          // Solo puede pasar si la clave se reutilizó con otros datos. Se
          // suelta para que el siguiente intento estrene una clave limpia.
          swipeKeys.current.delete(keyName);
          setFeedError(
            `No pudimos confirmar la decisión. Pulsa ${actionLabel(action)} de nuevo.`
          );
          return;
        case "target_gone":
          swipeKeys.current.delete(keyName);
          removeCandidate(candidate.id);
          setFeedError(
            "Esta persona ya no está disponible. Puedes continuar con el siguiente perfil."
          );
          announce("Perfil no disponible. Mostramos la siguiente persona.");
          if (errorMessage.toLowerCase().includes("swipe_already_decided")) {
            // La decisión anterior sí se guardó; si fue un match, aparecerá
            // en el historial.
            void loadMatches();
          }
          return;
        case "access_changed":
          setCandidates([]);
          announce("Tu acceso a este Live ha cambiado.");
          await loadState(eventId);
          return;
        case "rate_limited":
        case "auth":
          // La clave sigue siendo válida: al reintentar se reutiliza.
          setFeedError(errorCopy(errorMessage, "Inténtalo de nuevo en un momento."));
          return;
        default:
          setFeedError(
            errorCopy(
              errorMessage,
              `No pudimos confirmar la decisión. Repite ${actionLabel(action)} para comprobarla con seguridad.`
            )
          );
          return;
      }
    }

    swipeKeys.current.delete(keyName);
    const result: CrushLiveSwipeResult = data ?? {
      match: false,
      match_id: null,
      conversation_id: null,
      compatibility: null,
      compatibility_reasons: [],
    };
    const remaining = (candidates ?? []).filter(
      (item) => item.id !== candidate.id
    ).length;
    removeCandidate(candidate.id);
    if (remaining === 0 && !result.match) {
      // Los botones de acción desaparecen con la última tarjeta; sin esto el
      // foco de teclado caería al body.
      window.requestAnimationFrame(() => panelRef.current?.focus());
    }
    trackFire("crush_live_swipe", {
      event_id: eventId,
      action,
      affinity_band: affinityBand(candidate.compatibility),
    });

    if (result.match) {
      setMatchReveal({ candidate, result });
      trackFire("crush_live_match_created", {
        event_id: eventId,
        affinity_band: affinityBand(candidate.compatibility),
      });
      announce(`Has hecho match con ${candidate.full_name ?? "esta persona"}.`);
      loadMatches();
    } else if (action === "like") {
      announce("Like privado guardado. Solo se avisará si es mutuo.");
    } else {
      announce("Perfil descartado.");
    }
  };

  const reportCandidate = async (
    candidate: CrushLiveCandidate,
    reason: string,
    label: string
  ): Promise<string | null> => {
    if (
      !selectedEventId ||
      safetyInFlight.current ||
      swipeInFlight.current
    ) return "Espera a que termine la acción anterior.";
    const eventId = selectedEventId;
    const epoch = eventEpoch.current;
    if (!isCurrent()) return "Tu sesión ha cambiado. Vuelve a abrir el perfil.";
    const request = ++safetyRequest.current;
    safetyInFlight.current = true;
    setSafetySending("report");
    setFeedError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!isCurrent() || epoch !== eventEpoch.current || request !== safetyRequest.current) {
        return "Has cambiado de evento. Abre de nuevo el perfil si quieres denunciarlo.";
      }
      if (!isCurrent() || !user || user.id !== owner) {
        return "Tu sesión ha caducado. Vuelve a iniciar sesión para denunciar.";
      }
      const { error } = await supabase.from("user_reports").insert({
        reporter_id: user.id,
        reported_user_id: candidate.id,
        context: "profile",
        context_id: eventId,
        reason,
        description: `${label} · Crush Live`,
      });
      if (!isCurrent() || epoch !== eventEpoch.current || request !== safetyRequest.current) {
        return "Has cambiado de evento. Comprueba el historial antes de reintentarlo.";
      }
      if (error && error.code !== "23505") {
        // El trigger de user_reports corta a la sexta denuncia en 24 h.
        const message = error.message.toLowerCase();
        if (message.includes("rate limit") || message.includes("5 reportes")) {
          return "Has enviado muchas denuncias hoy. Si es urgente, escríbenos desde tu perfil.";
        }
        return "No pudimos enviar la denuncia. Inténtalo de nuevo.";
      }
      // Solo se retira la tarjeta denunciada; no cuenta como Paso y la
      // siguiente persona no se consume.
      removeCandidate(candidate.id);
      announce(
        "Denuncia enviada. La revisaremos y la otra persona no recibirá tu identidad."
      );
      return null;
    } catch {
      return "No pudimos enviar la denuncia. Inténtalo de nuevo.";
    } finally {
      if (epoch === eventEpoch.current && request === safetyRequest.current) {
        safetyInFlight.current = false;
        setSafetySending(null);
      }
    }
  };

  const blockCandidate = async (candidate: CrushLiveCandidate) => {
    if (
      !selectedEventId ||
      safetyInFlight.current ||
      swipeInFlight.current
    ) return;
    const eventId = selectedEventId;
    const epoch = eventEpoch.current;
    const person = candidate.full_name ?? "esta persona";
    safetyInFlight.current = true;
    setSafetySending("block");
    const accepted = await confirmDialog({
      title: `¿Bloquear a ${person}?`,
      description:
        "Dejaréis de veros en Franky y no podrá contactarte. Esta acción no cuenta como swipe.",
      confirmText: "Bloquear",
      variant: "danger",
    });
    if (!accepted || !isCurrent() || epoch !== eventEpoch.current) {
      if (epoch === eventEpoch.current) {
        safetyInFlight.current = false;
        setSafetySending(null);
      }
      return;
    }

    if (!isCurrent()) return;
    const request = ++safetyRequest.current;
    setFeedError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!isCurrent() || epoch !== eventEpoch.current || request !== safetyRequest.current) return;
      if (!isCurrent() || !user || user.id !== owner) {
        setFeedError("Tu sesión ha caducado. Vuelve a iniciar sesión para bloquear.");
        return;
      }
      const { error } = await supabase.from("user_blocks").insert({
        blocker_id: user.id,
        blocked_id: candidate.id,
      });
      if (!isCurrent() || epoch !== eventEpoch.current || request !== safetyRequest.current) return;
      if (error && error.code !== "23505") {
        setFeedError("No pudimos bloquear este perfil. Inténtalo de nuevo.");
        return;
      }
      swipeKeys.current.delete(`${eventId}:${candidate.id}`);
      removeCandidate(candidate.id);
      announce(`${person} ha sido bloqueado y ya no aparecerá en Franky.`);
    } catch {
      if (epoch === eventEpoch.current && request === safetyRequest.current) {
        setFeedError("No pudimos bloquear este perfil. Inténtalo de nuevo.");
      }
    } finally {
      if (epoch === eventEpoch.current && request === safetyRequest.current) {
        safetyInFlight.current = false;
        setSafetySending(null);
      }
    }
  };

  const currentEvent =
    liveState?.event ??
    selectableEvents.find((event) => event.id === selectedEventId) ??
    null;
  const currentCandidate = candidates?.[0] ?? null;

  let content: React.ReactNode;
  if (section === "matches") {
    content = (
      <MatchesPanel
        matches={matches}
        loading={matchesLoading}
        error={matchesError}
        eventId={selectedEventId}
        eventTitle={currentEvent?.title ?? null}
        onReload={loadMatches}
      />
    );
  } else if (eventsLoading && !selectedEventId) {
    content = <LoadingPanel />;
  } else if (eventsError && !selectedEventId) {
    content = (
      <EmptyPanel
        icon={Info}
        title="No pudimos cargar tus eventos"
        description={eventsError}
        action={
          <Button onClick={loadEvents} variant="outline">
            <RefreshCw className="h-4 w-4" /> Reintentar
          </Button>
        }
      />
    );
  } else if (!isCurrent() || !selectedEventId) {
    content = (
      <EmptyPanel
        icon={CalendarDays}
        title="No hay ningún Live activo ahora"
        description="Cuando estés apuntado a un evento oficial con Crush Live, aparecerá aquí. Tus matches anteriores siguen en el historial."
        action={
          <Button asChild variant="gradient">
            <Link href="/eventos">Ver eventos</Link>
          </Button>
        }
      />
    );
  } else if (stateLoading || !liveState) {
    content = stateError ? (
      <EmptyPanel
        icon={Info}
        title="No pudimos comprobar tu acceso"
        description={stateError}
        action={
          <Button onClick={() => loadState(selectedEventId)} variant="outline">
            <RefreshCw className="h-4 w-4" /> Reintentar
          </Button>
        }
      />
    ) : (
      <LoadingPanel label="Comprobando tu acceso" />
    );
  } else if (!liveState.available) {
    content = (
      <EligibilityPanel
        state={liveState}
        onShowMatches={() => setSection("matches")}
      />
    );
  } else if (!currentEvent) {
    content = (
      <EmptyPanel
        icon={Info}
        title="No encontramos el evento"
        description="Vuelve a la lista de eventos e inténtalo desde allí."
      />
    );
  } else if (section === "profile" || !liveState.profile?.active) {
    content = (
      <LiveProfileForm
        event={currentEvent}
        profile={liveState.profile}
        saving={profileSaving}
        error={profileError}
        onSave={saveProfile}
        onDeactivate={deactivateProfile}
      />
    );
  } else if (candidates === null) {
    content = <LoadingPanel label="Buscando gente afín en este evento" />;
  } else if (feedError && !currentCandidate) {
    content = (
      <EmptyPanel
        icon={Info}
        title="No pudimos cargar los perfiles"
        description={feedError}
        action={
          <Button onClick={() => loadFeed(selectedEventId)} variant="outline">
            <RefreshCw className="h-4 w-4" /> Reintentar
          </Button>
        }
      />
    );
  } else if (!currentCandidate) {
    content = (
      <EmptyPanel
        icon={UserRoundCheck}
        title="Ya has visto a todo el mundo por ahora"
        description="Vuelve más tarde: puede entrar más gente mientras el evento siga activo."
        action={
          <Button onClick={() => loadFeed(selectedEventId)} variant="outline">
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        }
      />
    );
  } else {
    content = (
      <div className="lg:grid lg:grid-cols-[minmax(0,620px)_300px] lg:items-start lg:gap-6">
        <div>
          {feedError ? (
            <p
              role="alert"
              className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600"
            >
              {feedError}
            </p>
          ) : null}
          <CandidateCard
            candidate={currentCandidate}
            sending={sending}
            safetySending={safetySending}
            onAction={swipe}
            onReport={(reason, label) =>
              reportCandidate(currentCandidate, reason, label)
            }
            onBlock={() => blockCandidate(currentCandidate)}
          />
        </div>
        <aside className="sticky top-20 mt-6 hidden space-y-4 lg:mt-0 lg:block">
          <div className="rounded-2xl border border-border-light bg-white p-5 shadow-card">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-text-muted">
              <CalendarDays className="h-4 w-4 text-violet" /> En este Live
            </p>
            <h2 className="mt-2 font-bold text-text-primary">{currentEvent.title}</h2>
            <p className="mt-1 text-xs capitalize text-text-muted">
              {eventDate(currentEvent)}
            </p>
            <p className="mt-4 flex items-start gap-2 border-t border-border-light pt-4 text-xs leading-5 text-text-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet" />
              Solo ves a personas participantes que han activado Live para este
              mismo evento.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSection("profile")}
            className="flex w-full items-center gap-3 rounded-2xl border border-border-light bg-white p-4 text-left shadow-card transition hover:border-violet/30"
          >
            <Settings2 className="h-5 w-5 text-violet" />
            <span>
              <span className="block text-sm font-bold text-text-primary">
                Ajustar preferencias
              </span>
              <span className="block text-xs text-text-muted">
                Cambia qué buscas o sal de este Live
              </span>
            </span>
          </button>
          <div className="rounded-2xl border border-border bg-bg-primary p-4 shadow-card">
            <p className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <Info className="h-4 w-4 text-violet" /> Sobre la afinidad
            </p>
            <p className="mt-2 text-xs leading-5 text-text-muted">
              Se calcula con lo que buscáis, vuestras respuestas e intereses.
              Es una orientación, no una promesa de química.
            </p>
          </div>
        </aside>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="border-b border-border-light py-9 sm:py-12">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <Link
            href="/crush"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver a Crush
          </Link>
          <div className="mt-5 flex items-center gap-4">
            <Heart className="h-8 w-8 shrink-0 fill-violet/10 text-violet" aria-hidden="true" />
            <div>
              <p className="eyebrow inline-flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-violet" aria-hidden="true" />
                Solo en eventos Franky
              </p>
              <h1 className="mt-2 text-fluid-h2 font-extrabold text-text-primary">
                Crush Live
              </h1>
              <p className="mt-1 text-sm text-text-secondary">
                Conoce gente que va a tu mismo evento. Likes privados, match mutuo.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(260px,360px)] md:items-start">
          <SectionTabs
            section={section}
            matchesCount={matches.length}
            onChange={setSection}
          />
          <EventSelector
            events={selectableEvents}
            selectedId={selectedEventId}
            disabled={
              sending !== null ||
              safetySending !== null ||
              profileSaving
            }
            onChange={selectEvent}
          />
        </div>

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>

        <div
          ref={panelRef}
          id={`crush-live-panel-${section}`}
          role="tabpanel"
          aria-labelledby={`crush-live-tab-${section}`}
          tabIndex={0}
          className="mt-5 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-violet/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
        >
          {content}
        </div>
      </div>

      <MatchDialog
        match={matchReveal}
        eventId={selectedEventId}
        onClose={() => setMatchReveal(null)}
        onCloseAutoFocus={(event) => {
          // Radix devuelve el foco al botón que abrió el diálogo, pero si el
          // match era la última tarjeta ese botón ya no existe y el foco
          // caería al body. Lo llevamos al panel para no perder a quien
          // navega con teclado o lector.
          if (!currentCandidate) {
            event.preventDefault();
            panelRef.current?.focus();
          }
        }}
      />
    </div>
  );
}

export default withAccountScope(CrushLiveClient);
