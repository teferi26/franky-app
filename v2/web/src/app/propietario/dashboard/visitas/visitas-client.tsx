"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Plus, Loader2, Home, Clock, Users, Euro, Trash2, X, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase-client";
import { Reveal } from "@/components/motion";
import { cn } from "@/lib/utils";
import { Panel, PanelBody, PanelHeader, PisoChips, SectionTitle, controlClass, labelClass } from "../panel-ui";

interface Accommodation {
  id: string;
  title: string;
  city: string | null;
  images: string[] | null;
}

interface Booking {
  id: string;
  visitor_id: string;
  status: string;
  payment_status: string;
  price_cents: number;
  visitor_name: string | null;
}

interface Slot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  price_cents: number;
  status: string;
  notes: string | null;
  bookings: Booking[];
}

const LIVE = ["pending", "confirmed"];

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2 });
}

function hhmm(t: string) {
  return t.slice(0, 5);
}

export default function VisitasClient({ accommodations }: { accommodations: Accommodation[] }) {
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(accommodations[0]?.id ?? null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);

  // Formulario de nuevo hueco
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("17:30");
  const [capacity, setCapacity] = useState("1");
  const [price, setPrice] = useState("0");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const loadSlots = useCallback(async (accId: string) => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: slotRows } = await supabase
        .from("visit_slots")
        .select("id, slot_date, start_time, end_time, capacity, price_cents, status, notes")
        .eq("accommodation_id", accId)
        .neq("status", "cancelled")
        .order("slot_date", { ascending: true })
        .order("start_time", { ascending: true });

      const ids = (slotRows ?? []).map((s) => s.id);
      let bookingsBySlot = new Map<string, Booking[]>();
      if (ids.length > 0) {
        const { data: bRows } = await supabase
          .from("visit_bookings")
          .select("id, slot_id, visitor_id, status, payment_status, price_cents")
          .in("slot_id", ids);

        const visitorIds = [...new Set((bRows ?? []).map((b) => b.visitor_id))];
        const nameById = new Map<string, string | null>();
        if (visitorIds.length > 0) {
          const { data: profs } = await supabase
            .from("public_profiles")
            .select("id, full_name")
            .in("id", visitorIds);
          (profs ?? []).forEach((p) => nameById.set(p.id as string, (p.full_name as string) ?? null));
        }
        bookingsBySlot = (bRows ?? []).reduce((map, b) => {
          const arr = map.get(b.slot_id) ?? [];
          arr.push({
            id: b.id,
            visitor_id: b.visitor_id,
            status: b.status,
            payment_status: b.payment_status,
            price_cents: b.price_cents,
            visitor_name: nameById.get(b.visitor_id) ?? null,
          });
          map.set(b.slot_id, arr);
          return map;
        }, new Map<string, Booking[]>());
      }

      setSlots(
        (slotRows ?? []).map((s) => ({
          ...s,
          bookings: bookingsBySlot.get(s.id) ?? [],
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) loadSlots(selected);
    else setSlots([]);
  }, [selected, loadSlots]);

  const createSlot = async () => {
    if (!selected || !date) {
      toast.error("Falta la fecha");
      return;
    }
    const cap = parseInt(capacity, 10);
    const priceCents = Math.round(parseFloat(price.replace(",", ".") || "0") * 100);
    if (!Number.isFinite(cap) || cap < 1) {
      toast.error("El aforo debe ser al menos 1");
      return;
    }
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      toast.error("Precio no válido");
      return;
    }
    if (endTime <= startTime) {
      toast.error("La hora de fin debe ser posterior a la de inicio");
      return;
    }
    setCreating(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sesión expirada");
        return;
      }
      const { error } = await supabase.from("visit_slots").insert({
        accommodation_id: selected,
        owner_id: user.id,
        slot_date: date,
        start_time: startTime,
        end_time: endTime,
        capacity: cap,
        price_cents: priceCents,
        notes: notes.trim() || null,
      });
      if (error) {
        toast.error("No se pudo crear el hueco", error.message);
        return;
      }
      toast.success("Hueco publicado");
      setNotes("");
      loadSlots(selected);
    } finally {
      setCreating(false);
    }
  };

  const deleteSlot = async (slotId: string, hasLive: boolean) => {
    setActing(slotId);
    try {
      const supabase = createClient();
      if (hasLive) {
        // Hay reservas vivas → marca cancelado en vez de borrar (conserva histórico).
        const { error } = await supabase
          .from("visit_slots")
          .update({ status: "cancelled" })
          .eq("id", slotId);
        if (error) {
          toast.error("No se pudo cancelar", error.message);
          return;
        }
        toast.success("Hueco cancelado");
      } else {
        const { error } = await supabase.from("visit_slots").delete().eq("id", slotId);
        if (error) {
          toast.error("No se pudo borrar", error.message);
          return;
        }
        toast.success("Hueco eliminado");
      }
      if (selected) loadSlots(selected);
    } finally {
      setActing(null);
    }
  };

  const cancelBooking = async (bookingId: string) => {
    setActing(bookingId);
    try {
      const response = await fetch('/api/visits/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ booking_id: bookingId }) });
      const result = await response.json();
      if (!response.ok) {
        if (typeof result.refund_url === 'string' && result.refund_url.startsWith('/') && !result.refund_url.startsWith('//')) { window.location.assign(result.refund_url); return; }
        toast.error("No se pudo cancelar", result.error ?? 'Vuelve a intentarlo.');
        return;
      }
      toast.success("Reserva cancelada");
      if (selected) loadSlots(selected);
    } catch {
      toast.error('No se pudo confirmar la cancelación', 'Comprueba tu conexión y vuelve a intentarlo.');
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <PanelHeader
        title="Visitas"
        description="Publica huecos de visita (gratis o de pago) y gestiona las reservas de cada piso."
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
            <Reveal>
              <PisoChips items={accommodations} selected={selected} onSelect={setSelected} />
            </Reveal>

            {/* Nuevo hueco */}
            <Reveal delay={60} className="space-y-5">
              <SectionTitle
                title="Nuevo hueco de visita"
                description="Fecha, franja y aforo. Si le pones precio, el estudiante paga al reservar."
              />
              <Panel className="p-5 sm:p-6">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <label className="block">
                    <span className={labelClass}>Fecha</span>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className={controlClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Desde</span>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className={controlClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Hasta</span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className={controlClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Aforo</span>
                    <input
                      type="number"
                      min={1}
                      value={capacity}
                      onChange={(e) => setCapacity(e.target.value)}
                      className={cn(controlClass, "tabular")}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Precio (€)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.50"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className={cn(controlClass, "tabular")}
                    />
                    <span className="mt-1.5 block text-xs text-text-muted">0 = gratis</span>
                  </label>
                  <label className="col-span-2 block sm:col-span-1">
                    <span className={labelClass}>Nota (opcional)</span>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Portal, llamar al…"
                      className={controlClass}
                    />
                  </label>
                </div>
                <div className="mt-5 flex justify-end">
                  <Button onClick={createSlot} loading={creating} variant="dark">
                    {!creating && <Plus className="h-4 w-4" strokeWidth={1.75} />}
                    Publicar hueco
                  </Button>
                </div>
              </Panel>
            </Reveal>

            {/* Huecos publicados */}
            <Reveal delay={120} className="space-y-5">
              <SectionTitle
                title="Huecos publicados"
                aside={
                  !loading && slots.length > 0 ? (
                    <span className="text-sm text-text-muted tabular">
                      {slots.length} {slots.length === 1 ? "hueco" : "huecos"}
                    </span>
                  ) : undefined
                }
              />
              {loading ? (
                <p className="flex items-center gap-2 text-sm text-text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                </p>
              ) : slots.length === 0 ? (
                <Panel className="px-6 py-10 text-center">
                  <p className="text-sm text-text-muted">
                    Todavía no has publicado huecos para este piso.
                  </p>
                </Panel>
              ) : (
                <ul className="space-y-3">
                  {slots.map((s, i) => {
                    const live = s.bookings.filter((b) => LIVE.includes(b.status));
                    const hasLive = live.length > 0;
                    const full = live.length >= s.capacity;
                    return (
                      <li
                        key={s.id}
                        style={{ "--i": i } as CSSProperties}
                        className="animate-list-in hover-lift rounded-2xl border border-border bg-bg-primary p-4 shadow-card sm:p-5"
                      >
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <span className="font-heading text-base font-bold capitalize text-text-primary">
                            {new Date(s.slot_date + "T00:00:00").toLocaleDateString("es-ES", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary tabular">
                            <Clock className="h-4 w-4 text-text-muted" strokeWidth={1.75} />
                            {hhmm(s.start_time)} a {hhmm(s.end_time)}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 text-sm tabular",
                              full ? "text-text-primary" : "text-text-secondary"
                            )}
                          >
                            <Users className="h-4 w-4 text-text-muted" strokeWidth={1.75} />
                            {live.length}/{s.capacity}
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary tabular">
                            <Euro className="h-4 w-4 text-text-muted" strokeWidth={1.75} />
                            {s.price_cents > 0 ? euros(s.price_cents) : "Gratis"}
                          </span>
                          <div className="ml-auto">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              loading={acting === s.id}
                              onClick={() => deleteSlot(s.id, hasLive)}
                              title={hasLive ? "Cancelar hueco" : "Eliminar hueco"}
                              aria-label={hasLive ? "Cancelar hueco" : "Eliminar hueco"}
                            >
                              {acting !== s.id && <Trash2 className="h-4 w-4" strokeWidth={1.75} />}
                            </Button>
                          </div>
                        </div>
                        {s.notes && <p className="mt-1.5 text-xs text-text-muted">{s.notes}</p>}

                        {live.length > 0 && (
                          <ul className="mt-3 divide-y divide-border-light border-t border-border-light">
                            {live.map((b) => (
                              <li key={b.id} className="flex items-center gap-2.5 py-2 text-sm">
                                <CheckCircle className="h-4 w-4 shrink-0 text-success" strokeWidth={1.75} />
                                <span className="truncate font-medium text-text-primary">
                                  {b.visitor_name ?? "Estudiante"}
                                </span>
                                {b.price_cents > 0 && (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                                    <span
                                      aria-hidden="true"
                                      className={cn(
                                        "h-1.5 w-1.5 rounded-full",
                                        b.payment_status === "paid" ? "bg-success" : "bg-warning"
                                      )}
                                    />
                                    {b.payment_status === "paid" ? "Pagado" : "Pago pendiente"}
                                  </span>
                                )}
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  className="ml-auto"
                                  loading={acting === b.id}
                                  onClick={() => cancelBooking(b.id)}
                                  title="Cancelar esta reserva"
                                  aria-label="Cancelar esta reserva"
                                >
                                  {acting !== b.id && <X className="h-3.5 w-3.5" strokeWidth={1.75} />}
                                </Button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Reveal>
          </>
        )}
      </PanelBody>
    </div>
  );
}
