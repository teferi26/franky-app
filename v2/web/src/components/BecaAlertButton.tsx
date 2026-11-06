"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useSession } from "@/components/SessionProvider";
import { trackFire } from "@/lib/analytics";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Avísame antes de que cierre" en la ficha de beca (migración 146).
 *
 * Un toque suscribe, otro desuscribe. El aviso llega por email vía el cron
 * diario cuando queden 7 días o menos de plazo. Para anónimos, el botón lleva
 * al login con vuelta a la ficha: es una de las mejores razones para
 * registrarse que tiene el catálogo.
 */
export default function BecaAlertButton({
  scholarshipId,
  className = "",
}: {
  scholarshipId: string;
  className?: string;
}) {
  const { user, loading } = useSession();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setSubscribed(false);
      return;
    }
    let mounted = true;
    createClient()
      .from("scholarship_alerts")
      .select("scholarship_id")
      .eq("user_id", user.id)
      .eq("scholarship_id", scholarshipId)
      .maybeSingle()
      .then(({ data, error }) => {
        // Migración 146 sin aplicar: el botón se comporta como no suscrito y
        // el intento de alta enseñará el error genérico.
        if (mounted) setSubscribed(error ? false : !!data);
      });
    return () => {
      mounted = false;
    };
  }, [user, loading, scholarshipId]);

  if (loading || subscribed === null) {
    // Misma altura que el botón para que la cabecera no salte al resolver.
    return (
      <div
        className={cn("inline-flex h-12 w-64 items-center justify-center rounded-xl border border-border", className)}
        aria-hidden="true"
      >
        <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!user) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/becas/${scholarshipId}`)}`}
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), className)}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        Avísame antes de que cierre
      </Link>
    );
  }

  const toggle = async () => {
    setBusy(true);
    const supabase = createClient();
    if (subscribed) {
      const { error } = await supabase
        .from("scholarship_alerts")
        .delete()
        .eq("user_id", user.id)
        .eq("scholarship_id", scholarshipId);
      if (!error) setSubscribed(false);
    } else {
      const { error } = await supabase
        .from("scholarship_alerts")
        .insert({ user_id: user.id, scholarship_id: scholarshipId });
      if (!error) {
        setSubscribed(true);
        trackFire("cta_clicked", { action: "beca_alert_on" });
      }
    }
    setBusy(false);
  };

  return (
    <Button
      onClick={toggle}
      loading={busy}
      aria-pressed={subscribed}
      variant={subscribed ? "secondary" : "outline"}
      size="lg"
      className={className}
    >
      {!busy && (subscribed ? <BellOff className="h-4 w-4" aria-hidden="true" /> : <Bell className="h-4 w-4" aria-hidden="true" />)}
      {subscribed ? "Aviso activado · quitar" : "Avísame antes de que cierre"}
    </Button>
  );
}
