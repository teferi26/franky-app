"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Home, Eye, EyeOff, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { Switch } from "@/components/ui/switch";

interface CurrentTenancy {
  tenancy_id: string;
  is_public: boolean;
  room_label: string | null;
  accommodation: {
    id: string;
    title: string;
    city: string | null;
    image: string | null;
  };
}

export default function HousingStatusCard() {
  const [tenancy, setTenancy] = useState<CurrentTenancy | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("get_my_current_tenancy").then(({ data }) => {
      if (data) setTenancy(data as CurrentTenancy);
      setLoaded(true);
    });
  }, []);

  if (!loaded || !tenancy) return null;

  const toggleVisibility = async (next: boolean) => {
    setSaving(true);
    const prev = tenancy.is_public;
    setTenancy({ ...tenancy, is_public: next });
    try {
      const res = await fetch("/api/tenancies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenancy_id: tenancy.tenancy_id, is_public: next }),
      });
      if (!res.ok) setTenancy({ ...tenancy, is_public: prev });
    } catch {
      setTenancy({ ...tenancy, is_public: prev });
    } finally {
      setSaving(false);
    }
  };

  const acc = tenancy.accommodation;

  // Superficie blanca limpia: miniatura del piso en marco redondeado (o el
  // icono de casa suelto en violeta si no hay foto), y el interruptor de
  // visibilidad debajo de una línea fina.
  return (
    <div className="animate-fade-in mb-6 rounded-2xl border border-border bg-bg-primary p-4 shadow-card">
      <div className="flex items-center gap-3">
        {acc.image ? (
          <div className="img-zoom relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-bg-secondary">
            {/* Miniatura de 56 px: sin `sizes` se descargaba la foto del piso a
                tamano completo para una caja del tamano de un icono. */}
            <Image src={acc.image} alt={acc.title} fill className="object-cover" sizes="56px" />
          </div>
        ) : (
          <Home className="h-7 w-7 shrink-0 text-violet" strokeWidth={1.75} aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Ya vives en un piso</p>
          <Link
            href={`/alojamiento/${acc.id}`}
            className="group mt-0.5 inline-flex items-center gap-1 font-heading text-[15px] font-bold text-text-primary transition-colors hover:text-violet"
          >
            <span className="truncate">{acc.title}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 arrow-nudge" aria-hidden="true" />
          </Link>
          {acc.city && <p className="text-xs text-text-muted">{acc.city}</p>}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-light pt-3">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          {tenancy.is_public ? (
            <Eye className="h-4 w-4 text-violet" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <EyeOff className="h-4 w-4 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
          )}
          <span>Mostrar mi perfil a quien visita el piso</span>
        </div>
        <Switch
          checked={tenancy.is_public}
          onCheckedChange={toggleVisibility}
          disabled={saving}
          aria-label="Mostrar mi perfil en el piso"
        />
      </div>
    </div>
  );
}
