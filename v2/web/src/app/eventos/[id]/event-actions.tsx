"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarCheck, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import EventShirtSize from "../components/event-shirt-size";
import EventShirtOptions from '../components/event-shirt-options';
import { shirtChoiceReady, type ShirtChoice, type ShirtPrices } from '@/lib/event-shirt-pricing';
import { EVENT_ADMISSION_REJECTED } from '../../../../../shared/event-admission';

export default function EventActions({
  eventId,
  isLoggedIn,
  isRegistered,
  isPast,
  isFull,
  // El evento reparte camisetas (164): al inscrito se le pregunta la talla aquí
  // mismo, justo después de apuntarse.
  shirtsEnabled = false,
  prices = null,
}: {
  eventId: string;
  isLoggedIn: boolean;
  isRegistered: boolean;
  isPast: boolean;
  isFull: boolean;
  shirtsEnabled?: boolean;
  prices?: ShirtPrices | null;
}) {
  const [registered, setRegistered] = useState(isRegistered);
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const [choice, setChoice] = useState<ShirtChoice>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (isPast) {
    return (
      <p className="py-2 text-center text-sm text-text-muted">
        Este evento ya ha finalizado
      </p>
    );
  }

  if (!isLoggedIn) {
    return (
      <Button asChild className="w-full" size="lg">
        <Link href="/login">
          <LogIn className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Inicia sesión para inscribirte
        </Link>
      </Button>
    );
  }

  const handleRegister = async () => {
    if (pending.current || isFull || (prices && !shirtChoiceReady(choice))) return;
    pending.current = true;
    setLoading(true);
    setError(null);
    try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Vuelve a iniciar sesión para inscribirte.');
      return;
    }

    // Upsert participation so retries / re-registrations after cancellation work
    const { error: insertErr } = prices ? await supabase.rpc('register_event_shirt_option', { p_event_id: eventId, p_size: choice }) : await supabase
      .from("event_participants")
      .upsert(
        { event_id: eventId, user_id: user.id, status: "registered" },
        { onConflict: "event_id,user_id" }
      );

    if (insertErr) {
      setError(insertErr.message?.includes('event_audience_forbidden') ? EVENT_ADMISSION_REJECTED : /Aforo completo|event_full/.test(insertErr.message ?? '') ? 'Aforo completo. No se ha guardado la inscripción.' : 'No se pudo guardar tu inscripción. Revisa la opción elegida e inténtalo de nuevo.');
      console.error("[event-actions] register error:", insertErr);
      setLoading(false);
      return;
    }

    // Auto-join the event group chat so the user is in the conversation
    // immediately after inscription. Non-blocking: inscription still succeeds
    // even if the chat join fails.
    try { const { error: joinErr } = await supabase.rpc("join_event_chat", {
      p_event_id: eventId,
      p_user_id: user.id,
    });
    if (joinErr) {
      console.error("[event-actions] join_event_chat error:", joinErr);
    } } catch { /* La inscripción ya está confirmada. */ }

    setRegistered(true);
    setLoading(false);
    router.refresh();
    } catch { setError('No se pudo confirmar la inscripción. Revisa tu conexión e inténtalo de nuevo.'); }
    finally { pending.current = false; setLoading(false); }
  };

  const handleCancel = async () => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError(null);
    try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Vuelve a iniciar sesión para cancelar tu inscripción.'); return; }

    const { data, error: cancelError } = await supabase
      .from("event_participants")
      .update({ status: "cancelled" })
      .eq("event_id", eventId)
      .eq("user_id", user.id).select('id').single();
    if (cancelError || !data) { setError('No se pudo cancelar. Tu inscripción sigue activa.'); return; }

    setRegistered(false);
    setLoading(false);
    router.refresh();
    } catch { setError('No se pudo confirmar la cancelación. Revisa tu conexión.'); }
    finally { pending.current = false; setLoading(false); }
  };

  if (registered) {
    return (
      <div className="space-y-3">
        {/* Confirmación como rótulo con icono suelto: sin caja tintada. */}
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <CalendarCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Estás inscrito
        </p>
        {shirtsEnabled && <EventShirtSize eventId={eventId} prices={prices} />}
        {error && <p role="alert" className="text-sm font-medium text-error">{error}</p>}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          loading={loading}
          className="w-full text-text-muted"
        >
          {loading ? "Cancelando" : "Cancelar inscripción"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
    {prices && <EventShirtOptions prices={prices} value={choice} onChange={setChoice} disabled={loading} />}
    {error && <p role="alert" className="text-sm font-medium text-error">{error}</p>}
    <Button
      onClick={handleRegister}
      loading={loading}
      disabled={isFull || !!(prices && !shirtChoiceReady(choice))}
      className="w-full"
      size="lg"
    >
      {loading ? "Inscribiendo" : isFull ? "Aforo completo" : "Inscribirme"}
    </Button>
    </div>
  );
}
