"use client";

import { useState } from "react";
import { Ban, Info, Plus, Tag, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

// ─── Gestión de códigos (cliente) ─────────────────────────────────────────
// Recibe la lista inicial del servidor y la mantiene al día tras cada acción
// con el cliente de navegador (la RLS de event_discount_codes garantiza que
// solo el organizador puede tocar sus filas). "Desactivar" no borra: pone
// expires_at a ahora, que es exactamente lo que check_discount_code trata
// como caducado, y así se conserva cuántas veces se usó. "Borrar" sí elimina.

export type DiscountCode = {
  id: string;
  event_id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  created_at: string;
};

type Props = {
  eventId: string;
  initialCodes: DiscountCode[];
  available: boolean;
  paidViaApp: boolean;
};

// Mismo acabado que ui/input.tsx: borde hairline, foco violeta con anillo.
const inputCls =
  "flex h-11 w-full rounded-xl border border-border bg-bg-primary px-3.5 py-2 text-[15px] text-text-primary transition-[border-color,box-shadow] duration-200 placeholder:text-text-muted hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15";

/** 'percent' guarda puntos porcentuales; 'fixed' guarda céntimos (RPC 136). */
function valueLabel(c: DiscountCode): string {
  return c.kind === "percent"
    ? `${c.value} % de descuento`
    : `${(c.value / 100).toLocaleString("es-ES", { minimumFractionDigits: 2 })} € de descuento`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

/** Fecha mínima para el selector de caducidad: mañana en local. */
function tomorrowInput(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function statusOf(c: DiscountCode): { label: string; cls: string } | null {
  const exhausted = c.max_uses != null && c.used_count >= c.max_uses;
  const expired = c.expires_at != null && new Date(c.expires_at).getTime() < Date.now();
  if (expired) return { label: "Desactivado", cls: "text-text-muted" };
  if (exhausted) return { label: "Usos agotados", cls: "text-amber-700" };
  return null;
}

export default function CodigosClient({ eventId, initialCodes, available, paidViaApp }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const [codes, setCodes] = useState<DiscountCode[]>(initialCodes);
  const [busyId, setBusyId] = useState<string | null>(null);

  // ── Formulario ──
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expires, setExpires] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reload = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("event_discount_codes")
      .select("id, event_id, code, kind, value, max_uses, used_count, expires_at, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    if (data) setCodes(data as DiscountCode[]);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 3) return setError("Usa al menos 3 caracteres, por ejemplo BIENVENIDA10.");
    if (!/^[A-Z0-9_-]+$/.test(trimmed)) return setError("Solo letras, números, guion y guion bajo, sin espacios.");
    const num = Number(value.replace(",", "."));
    if (!num || num <= 0) return setError("Indica cuánto descuenta el código.");
    if (kind === "percent" && num > 100) return setError("Un descuento por porcentaje no puede superar el 100 %.");
    const maxUsesNum = maxUses.trim() ? parseInt(maxUses, 10) : null;
    if (maxUses.trim() && (!maxUsesNum || maxUsesNum <= 0))
      return setError("Pon un número de usos mayor que 0, o deja el campo vacío para usos ilimitados.");
    let expiresIso: string | null = null;
    if (expires) {
      // Fin del día elegido, en hora local: el código vale ese día entero.
      const d = new Date(`${expires}T23:59:59`);
      if (Number.isNaN(d.getTime())) return setError("La fecha de caducidad no es válida.");
      if (d.getTime() < Date.now()) return setError("La caducidad tiene que ser una fecha futura.");
      expiresIso = d.toISOString();
    }

    setSaving(true);
    const supabase = createClient();
    const { error: err } = await supabase.from("event_discount_codes").insert({
      event_id: eventId,
      code: trimmed,
      kind,
      value: kind === "percent" ? Math.round(num) : Math.round(num * 100),
      max_uses: maxUsesNum,
      expires_at: expiresIso,
    });
    setSaving(false);
    if (err) {
      const dup = err.code === "23505" || /duplicate/i.test(err.message ?? "");
      setError(dup ? "Ya existe un código igual para este evento." : "No se pudo crear. Inténtalo de nuevo en unos segundos.");
      return;
    }
    setCode("");
    setKind("percent");
    setValue("");
    setMaxUses("");
    setExpires("");
    toast.success("Código creado", `${trimmed} ya funciona al comprar entradas.`);
    await reload();
  };

  const deactivate = async (c: DiscountCode) => {
    const ok = await confirm({
      title: `¿Desactivar ${c.code}?`,
      description: "Dejará de funcionar al momento. Se conserva cuántas veces se usó.",
      confirmText: "Desactivar",
    });
    if (!ok) return;
    setBusyId(c.id);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("event_discount_codes")
      .update({ expires_at: new Date().toISOString() })
      .eq("id", c.id);
    setBusyId(null);
    if (err) {
      toast.error("No se pudo desactivar", "Inténtalo de nuevo en unos segundos.");
      return;
    }
    toast.success("Código desactivado");
    await reload();
  };

  const remove = async (c: DiscountCode) => {
    const ok = await confirm({
      title: `¿Borrar ${c.code}?`,
      description: "Se elimina del todo, con su contador de usos. No se puede deshacer.",
      confirmText: "Borrar",
      variant: "danger",
    });
    if (!ok) return;
    setBusyId(c.id);
    const supabase = createClient();
    const { error: err } = await supabase.from("event_discount_codes").delete().eq("id", c.id);
    setBusyId(null);
    if (err) {
      toast.error("No se pudo borrar", "Inténtalo de nuevo en unos segundos.");
      return;
    }
    toast.success("Código borrado");
    await reload();
  };

  if (!available) {
    return (
      <EmptyState
        icon={Tag}
        title="Aún no disponible"
        description="Los códigos de descuento llegarán muy pronto a tu evento."
      />
    );
  }

  return (
    <div className="space-y-6">
      {!paidViaApp && (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-bg-secondary/60 p-4 text-sm leading-relaxed text-text-secondary">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet" strokeWidth={1.75} aria-hidden="true" />
          <p>
            Los códigos se aplican al comprar entradas por la app. Este evento no cobra por la app ahora
            mismo, así que puedes prepararlos, pero no tendrán efecto hasta que actives las entradas de pago.
          </p>
        </div>
      )}

      {/* ── Crear ────────────────────────────────────────────────────── */}
      <form onSubmit={create} className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card sm:p-6">
        <h2 className="mb-5 font-heading text-lg font-bold text-text-primary">Crear código</h2>
        {error && (
          <p role="alert" className="mb-4 text-sm font-medium text-error">
            {error}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="dc-code" className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">
              Código
            </label>
            <input
              id="dc-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="BIENVENIDA10"
              maxLength={30}
              autoCapitalize="characters"
              autoComplete="off"
              className={`${inputCls} font-mono uppercase tracking-wide`}
            />
          </div>
          <fieldset>
            <legend className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">Tipo de descuento</legend>
            <div className="flex gap-2">
              {(
                [
                  { v: "percent", label: "Porcentaje" },
                  { v: "fixed", label: "Importe fijo" },
                ] as { v: "percent" | "fixed"; label: string }[]
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  aria-pressed={kind === o.v}
                  onClick={() => setKind(o.v)}
                  className={`rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors duration-200 ${
                    kind === o.v
                      ? "border-violet bg-violet-50/70 text-violet-deep"
                      : "border-border text-text-secondary hover:border-text-primary/25"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="dc-value" className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">
              {kind === "percent" ? "Porcentaje (1 a 100)" : "Importe en euros"}
            </label>
            <input
              id="dc-value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === "percent" ? "10" : "5,00"}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="dc-max" className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">
              Usos máximos (opcional)
            </label>
            <input
              id="dc-max"
              inputMode="numeric"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Ilimitados"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="dc-expires" className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">
              Caducidad (opcional)
            </label>
            <input
              id="dc-expires"
              type="date"
              min={tomorrowInput()}
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button type="submit" loading={saving}>
            {!saving && <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
            Crear código
          </Button>
        </div>
      </form>

      {/* ── Lista ────────────────────────────────────────────────────── */}
      <section aria-labelledby="codes-title">
        <p className="eyebrow text-text-muted">Tus códigos</p>
        <h2 id="codes-title" className="mb-4 mt-1 font-heading text-lg font-bold text-text-primary">
          {codes.length} {codes.length === 1 ? "código creado" : "códigos creados"}
        </h2>
        {codes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
            <Tag className="mx-auto h-6 w-6 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
            <p className="mt-3 font-heading font-semibold text-text-primary">Sin códigos todavía</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
              Crea uno arriba: por ejemplo, un 10 % para los primeros que compren.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border-light border-y border-border-light">
            {codes.map((c) => {
              const status = statusOf(c);
              const inactive = status !== null;
              const busy = busyId === c.id;
              return (
                <li key={c.id} className={`flex flex-wrap items-center gap-3 px-2 py-4 transition-colors hover:bg-bg-secondary ${inactive ? "opacity-70" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-base font-bold tracking-wide text-text-primary">{c.code}</p>
                      {status && (
                        <span className={`text-[10px] font-bold uppercase tracking-[0.1em] ${status.cls}`}>
                          {status.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-text-secondary">{valueLabel(c)}</p>
                    <p className="mt-0.5 text-xs text-text-muted tabular">
                      {c.used_count} {c.used_count === 1 ? "uso" : "usos"}
                      {c.max_uses != null ? ` de ${c.max_uses}` : " · sin límite"}
                      {c.expires_at && !inactive ? ` · caduca el ${fmtDate(c.expires_at)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {!inactive && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void deactivate(c)}
                        aria-label={`Desactivar el código ${c.code}`}
                      >
                        <Ban className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" /> Desactivar
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      loading={busy}
                      onClick={() => void remove(c)}
                      aria-label={`Borrar el código ${c.code}`}
                      className="text-text-muted hover:text-error"
                    >
                      {!busy && <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
