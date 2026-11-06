"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Loader2, Home, Save, Eye, Euro, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase-client";
import { formatEur } from "@/lib/pricing";
import { Reveal } from "@/components/motion";
import { cn } from "@/lib/utils";
import { Notice, Panel, PanelBody, PanelHeader, SectionTitle, controlClass, labelClass } from "../panel-ui";

/** Control compacto para las filas del editor semanal (misma familia que controlClass). */
const smallControl =
  "mt-1 block h-9 rounded-lg border border-border bg-bg-primary px-2.5 text-sm text-text-primary transition-[border-color,box-shadow] duration-200 hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15";

interface Accommodation {
  id: string;
  title: string;
  city: string | null;
}

interface DayState {
  id: string | null;
  active: boolean;
  start: string; // HH:MM
  end: string; // HH:MM
  slotMinutes: number;
  capacity: string;
  price: string; // euros, texto del input
}

interface PreviewSlot {
  slot_id: string | null;
  slot_date: string;
  start_time: string;
  end_time: string;
  price_cents: number;
  available: number;
}

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

const SLOT_OPTIONS = [15, 20, 30, 45, 60];

function defaultDay(): DayState {
  return {
    id: null,
    active: false,
    start: "10:00",
    end: "13:00",
    slotMinutes: 30,
    capacity: "1",
    price: "0",
  };
}

function emptyDays(): Record<number, DayState> {
  const map: Record<number, DayState> = {};
  WEEKDAYS.forEach(({ value }) => {
    map[value] = defaultDay();
  });
  return map;
}

function hhmm(t: string) {
  return t.slice(0, 5);
}

export default function HorarioClient({
  accommodations,
}: {
  accommodations: Accommodation[];
}) {
  const toast = useToast();

  // "all" = horario general (accommodation_id NULL); si no, id del piso.
  const [scope, setScope] = useState<string>("all");
  const [days, setDays] = useState<Record<number, DayState>>(emptyDays());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Vista previa
  const [previewAcc, setPreviewAcc] = useState<string>(accommodations[0]?.id ?? "");
  const [previewSlots, setPreviewSlots] = useState<PreviewSlot[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadSchedules = useCallback(async (currentScope: string) => {
    setLoading(true);
    try {
      const supabase = createClient();
      let query = supabase
        .from("visit_schedules")
        .select("id, accommodation_id, weekday, start_time, end_time, slot_minutes, capacity, price_cents, active")
        .order("created_at", { ascending: true });
      query =
        currentScope === "all"
          ? query.is("accommodation_id", null)
          : query.eq("accommodation_id", currentScope);
      const { data, error } = await query;
      if (error) {
        toast.error("No se pudo cargar el horario", error.message);
        return;
      }
      const next = emptyDays();
      (data ?? []).forEach((row) => {
        // Si hay varias filas para un mismo día, editamos la primera.
        if (next[row.weekday]?.id) return;
        next[row.weekday] = {
          id: row.id,
          active: row.active,
          start: hhmm(row.start_time),
          end: hhmm(row.end_time),
          slotMinutes: row.slot_minutes,
          capacity: String(row.capacity),
          price: (row.price_cents / 100).toFixed(2),
        };
      });
      setDays(next);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSchedules(scope);
  }, [scope, loadSchedules]);

  const setDay = (weekday: number, patch: Partial<DayState>) => {
    setDays((prev) => ({ ...prev, [weekday]: { ...prev[weekday], ...patch } }));
  };

  const saveAll = async () => {
    // Validación previa
    for (const { value, label } of WEEKDAYS) {
      const d = days[value];
      if (!d.active && !d.id) continue;
      if (!d.active) continue;
      if (!d.start || !d.end || d.end <= d.start) {
        toast.error(`${label}: la hora de fin debe ser posterior a la de inicio`);
        return;
      }
      const cap = parseInt(d.capacity, 10);
      if (!Number.isFinite(cap) || cap < 1) {
        toast.error(`${label}: el aforo debe ser al menos 1`);
        return;
      }
      const price = parseFloat(d.price.replace(",", ".") || "0");
      if (!Number.isFinite(price) || price < 0) {
        toast.error(`${label}: precio no válido`);
        return;
      }
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sesión expirada");
        return;
      }
      const accommodationId = scope === "all" ? null : scope;

      for (const { value, label } of WEEKDAYS) {
        const d = days[value];
        const priceCents = Math.round(
          parseFloat(d.price.replace(",", ".") || "0") * 100
        );
        const payload = {
          start_time: d.start,
          end_time: d.end,
          slot_minutes: d.slotMinutes,
          capacity: parseInt(d.capacity, 10) || 1,
          price_cents: priceCents,
          active: d.active,
        };

        if (d.id) {
          const { error } = await supabase
            .from("visit_schedules")
            .update(payload)
            .eq("id", d.id);
          if (error) {
            toast.error(`No se pudo guardar ${label}`, error.message);
            return;
          }
        } else if (d.active) {
          const { error } = await supabase.from("visit_schedules").insert({
            ...payload,
            owner_id: user.id,
            accommodation_id: accommodationId,
            weekday: value,
          });
          if (error) {
            toast.error(`No se pudo guardar ${label}`, error.message);
            return;
          }
        }
      }
      toast.success("Horario guardado");
      loadSchedules(scope);
    } finally {
      setSaving(false);
    }
  };

  const loadPreview = async () => {
    if (!previewAcc) {
      toast.error("Elige un piso para previsualizar");
      return;
    }
    setPreviewLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_bookable_visit_times", {
        p_accommodation_id: previewAcc,
        p_days: 7,
      });
      if (error) {
        toast.error("No se pudo cargar la vista previa", error.message);
        return;
      }
      setPreviewSlots((data ?? []) as PreviewSlot[]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const hasPaidDay = WEEKDAYS.some(({ value }) => {
    const d = days[value];
    return d.active && parseFloat(d.price.replace(",", ".") || "0") > 0;
  });

  const previewByDate = (previewSlots ?? []).reduce((map, s) => {
    const arr = map.get(s.slot_date) ?? [];
    arr.push(s);
    map.set(s.slot_date, arr);
    return map;
  }, new Map<string, PreviewSlot[]>());

  return (
    <div className="min-h-screen bg-bg-primary">
      <PanelHeader
        title="Horario de visitas"
        description="Define tu horario semanal y los huecos se generan solos cuando un estudiante reserva."
      />

      <PanelBody className="space-y-10">
        {accommodations.length === 0 ? (
          <Reveal className="rounded-3xl border border-dashed border-border px-6 py-16 text-center">
            <Home className="mx-auto h-8 w-8 text-text-muted" strokeWidth={1.5} />
            <p className="mt-4 font-heading text-lg font-bold text-text-primary">
              Aún no tienes pisos publicados
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-text-muted">
              Publica un piso para abrir visitas.
            </p>
            <Button asChild variant="dark" className="mt-6">
              <Link href="/propietario/dashboard">
                Publicar un piso
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </Link>
            </Button>
          </Reveal>
        ) : (
          <>
            {/* Ámbito del horario */}
            <Reveal>
              <label className="block sm:max-w-sm">
                <span className={labelClass}>Aplicar a</span>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className={controlClass}
                >
                  <option value="all">Todos mis pisos</option>
                  {accommodations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                      {a.city ? ` · ${a.city}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-2 text-xs text-text-muted">
                El horario de un piso concreto tiene prioridad sobre el horario
                general de todos tus pisos.
              </p>
            </Reveal>

            {/* Editor semanal */}
            <Reveal delay={60} className="space-y-5">
              <SectionTitle
                title="Horario semanal"
                description="Activa los días en los que recibes visitas y ajusta franja, duración, aforo y precio."
              />
              {loading ? (
                <p className="flex items-center gap-2 text-sm text-text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                </p>
              ) : (
                <div className="space-y-5">
                  <Panel className="divide-y divide-border-light">
                    {WEEKDAYS.map(({ value, label }, i) => {
                      const d = days[value];
                      return (
                        <div
                          key={value}
                          style={{ "--i": i } as CSSProperties}
                          className={cn(
                            "animate-list-in px-4 py-3.5 transition-colors sm:px-5",
                            d.active ? "bg-bg-primary" : "bg-bg-secondary/40"
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                            <label className="flex w-32 shrink-0 cursor-pointer items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={d.active}
                                onChange={(e) => setDay(value, { active: e.target.checked })}
                                className="h-4 w-4 rounded border-border accent-violet"
                              />
                              <span
                                className={cn(
                                  "text-sm font-semibold",
                                  d.active ? "text-text-primary" : "text-text-muted"
                                )}
                              >
                                {label}
                              </span>
                            </label>

                            {d.active ? (
                              <div className="flex flex-wrap items-end gap-3">
                                <label className="block text-xs font-medium text-text-muted">
                                  Desde
                                  <input
                                    type="time"
                                    value={d.start}
                                    onChange={(e) => setDay(value, { start: e.target.value })}
                                    className={cn(smallControl, "w-28")}
                                  />
                                </label>
                                <label className="block text-xs font-medium text-text-muted">
                                  Hasta
                                  <input
                                    type="time"
                                    value={d.end}
                                    onChange={(e) => setDay(value, { end: e.target.value })}
                                    className={cn(smallControl, "w-28")}
                                  />
                                </label>
                                <label className="block text-xs font-medium text-text-muted">
                                  Duración
                                  <select
                                    value={d.slotMinutes}
                                    onChange={(e) =>
                                      setDay(value, { slotMinutes: parseInt(e.target.value, 10) })
                                    }
                                    className={cn(smallControl, "w-28")}
                                  >
                                    {SLOT_OPTIONS.map((m) => (
                                      <option key={m} value={m}>
                                        {m} min
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block text-xs font-medium text-text-muted">
                                  Aforo
                                  <input
                                    type="number"
                                    min={1}
                                    value={d.capacity}
                                    onChange={(e) => setDay(value, { capacity: e.target.value })}
                                    className={cn(smallControl, "w-20 tabular")}
                                  />
                                </label>
                                <label className="block text-xs font-medium text-text-muted">
                                  Precio (€)
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.50"
                                    value={d.price}
                                    onChange={(e) => setDay(value, { price: e.target.value })}
                                    className={cn(smallControl, "w-24 tabular")}
                                  />
                                </label>
                              </div>
                            ) : (
                              <span className="text-xs text-text-muted">Sin visitas</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </Panel>

                  {hasPaidDay && (
                    <Notice tone="warning" icon={Euro}>
                      Cobrar la visita filtra curiosos y te llega el dinero por Stripe
                      con tu desglose en Cartera. Para recibirlo necesitas tener
                      activados los cobros en{" "}
                      <Link
                        href="/propietario/dashboard/pagos"
                        className="font-semibold text-text-primary link-underline"
                      >
                        Cobros (Stripe Connect)
                      </Link>
                      .
                    </Notice>
                  )}

                  <div className="flex justify-end">
                    <Button onClick={saveAll} loading={saving} variant="dark">
                      {!saving && <Save className="h-4 w-4" strokeWidth={1.75} />}
                      Guardar horario
                    </Button>
                  </div>
                </div>
              )}
            </Reveal>

            {/* Vista previa */}
            <Reveal delay={120} className="space-y-5">
              <SectionTitle
                title="Vista previa de huecos"
                description="Así verán los estudiantes los huecos reservables de los próximos 7 días (horario semanal más los huecos sueltos publicados en Visitas)."
              />
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={previewAcc}
                  onChange={(e) => setPreviewAcc(e.target.value)}
                  aria-label="Piso a previsualizar"
                  className={cn(controlClass, "w-auto min-w-[200px]")}
                >
                  {accommodations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
                <Button variant="outline" onClick={loadPreview} loading={previewLoading} className="h-11">
                  {!previewLoading && <Eye className="h-4 w-4" strokeWidth={1.75} />}
                  Ver huecos
                </Button>
              </div>

              {previewSlots !== null &&
                (previewSlots.length === 0 ? (
                  <Panel className="px-6 py-10 text-center">
                    <p className="text-sm text-text-muted">
                      No hay huecos reservables en los próximos 7 días. Activa algún
                      día del horario (y guárdalo) o publica huecos sueltos en
                      Visitas.
                    </p>
                  </Panel>
                ) : (
                  <dl className="divide-y divide-border-light border-y border-border-light">
                    {[...previewByDate.entries()].map(([date, slots]) => (
                      <div key={date} className="grid gap-2 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
                        <dt className="text-sm font-semibold capitalize text-text-primary">
                          {new Date(date + "T00:00:00").toLocaleDateString("es-ES", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })}
                        </dt>
                        <dd className="flex flex-wrap gap-1.5">
                          {slots.map((s, i) => (
                            <span
                              key={`${date}-${s.start_time}-${i}`}
                              className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary tabular"
                            >
                              {hhmm(s.start_time)} a {hhmm(s.end_time)}
                              {s.price_cents > 0 && (
                                <span className="font-semibold text-text-primary">
                                  {formatEur(s.price_cents / 100)}
                                </span>
                              )}
                            </span>
                          ))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ))}
            </Reveal>
          </>
        )}
      </PanelBody>
    </div>
  );
}
