"use client";

import { useEffect, useState } from "react";
import { Home, Check, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useToast } from "@/components/ui/toast";

interface PendingInvite {
  id: string;
  room_label: string | null;
  accommodation_id: string;
  accommodation_title: string;
  accommodation_city: string | null;
}

export default function PendingTenancyInvites() {
  const toast = useToast();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoaded(true);
        return;
      }
      const { data: rows } = await supabase
        .from("tenancies")
        .select("id, room_label, accommodation_id")
        .eq("tenant_id", user.id)
        .eq("status", "pending_confirmation");

      if (!rows || rows.length === 0) {
        setLoaded(true);
        return;
      }

      const accIds = [...new Set(rows.map((r) => r.accommodation_id))];
      const { data: accs } = await supabase
        .from("accommodations")
        .select("id, title, city")
        .in("id", accIds);
      const accById = new Map((accs ?? []).map((a) => [a.id as string, a]));

      setInvites(
        rows.map((r) => {
          const a = accById.get(r.accommodation_id);
          return {
            id: r.id,
            room_label: r.room_label,
            accommodation_id: r.accommodation_id,
            accommodation_title: (a?.title as string) ?? "un piso",
            accommodation_city: (a?.city as string) ?? null,
          };
        })
      );
      setLoaded(true);
    })();
  }, []);

  const respond = async (tenancyId: string, accept: boolean) => {
    setActing(tenancyId);
    try {
      const res = await fetch("/api/tenancies/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenancy_id: tenancyId, accept }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error("No se pudo responder", json.error);
        return;
      }
      setInvites((prev) => prev.filter((i) => i.id !== tenancyId));
      toast.success(accept ? "Confirmado" : "Invitación rechazada");
    } finally {
      setActing(null);
    }
  };

  if (!loaded || invites.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
      <h2 className="mb-1 flex items-center gap-2 font-heading text-base font-extrabold text-text-primary">
        <Home className="h-4 w-4 text-violet" />
        Invitaciones de piso
      </h2>
      <p className="mb-4 text-xs leading-relaxed text-text-muted">
        Un propietario quiere marcarte como inquilino. Si aceptas, aparecerás como compañero
        en la página del piso.
      </p>
      <div className="space-y-2">
        {invites.map((inv) => (
          <div
            key={inv.id}
            className="flex items-center gap-3 p-3 rounded-xl border border-border-light"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">{inv.accommodation_title}</p>
              <p className="text-xs text-text-muted truncate">
                {[inv.accommodation_city, inv.room_label].filter(Boolean).join(" · ")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => respond(inv.id, true)}
              disabled={acting === inv.id}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {acting === inv.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Aceptar
            </button>
            <button
              type="button"
              onClick={() => respond(inv.id, false)}
              disabled={acting === inv.id}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-text-muted text-xs font-semibold hover:bg-bg-secondary disabled:opacity-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Rechazar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
