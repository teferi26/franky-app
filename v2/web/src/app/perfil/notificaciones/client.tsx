"use client";

// ─── Ajustes de notificaciones (cliente) ─────────────────────────────────
// Interruptor general + uno por categoría + franja "No molestar". Cada
// cambio se guarda al momento (sin botón de guardar, igual que en la app):
// optimista, y si el UPDATE falla se revierte y se avisa. Se escribe el
// objeto completo en profiles.push_prefs, que es exactamente lo que espera
// /api/internal/notify-push (ver src/lib/push-prefs.ts).

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BellRing, Loader2, Moon } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  PUSH_CATEGORIES, type PushPrefs,
  isAllOn, isCategoryOn, isDndOn, dndFrom, dndTo, isValidHHMM,
} from "@/lib/push-prefs";

export default function NotificacionesPrefsClient({
  userId,
  initial,
}: {
  userId: string;
  initial: PushPrefs;
}) {
  const [prefs, setPrefs] = useState<PushPrefs>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (next: PushPrefs) => {
    const prev = prefs;
    setPrefs(next);
    setSaving(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ push_prefs: next, updated_at: new Date().toISOString() })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      setPrefs(prev);
      setMsg({ ok: false, text: "No se pudo guardar. Inténtalo de nuevo en unos segundos." });
      return;
    }
    setMsg({ ok: true, text: "Guardado." });
  };

  const allOn = isAllOn(prefs);
  const dndOn = isDndOn(prefs);

  const onTime = (which: "dnd_from" | "dnd_to", value: string) => {
    // Un <input type="time"> vacío (el usuario borró la hora) no se guarda:
    // se mantiene la anterior para no dejar la franja a medias.
    if (!isValidHHMM(value)) return;
    save({ ...prefs, [which]: value });
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
          <Link
            href="/perfil"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Mi perfil
          </Link>
          <p className="eyebrow mt-6">Ajustes</p>
          <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
            Notificaciones
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-text-muted">
            Elige qué avisos te llegan al móvil. Lo que silencies deja de
            llegar como push al momento; lo seguirás viendo en la campana.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-2xl space-y-6 px-4 pb-20 pt-8">
        {/* Estado de guardado: una sola línea, accesible para lectores. */}
        <div aria-live="polite" className="min-h-5">
          {saving ? (
            <p className="text-xs text-text-muted inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando
            </p>
          ) : msg ? (
            <p className={cn("text-xs", msg.ok ? "text-success" : "text-error")}>{msg.text}</p>
          ) : null}
        </div>

        {/* Interruptor general + categorías */}
        <section
          aria-labelledby="prefs-categorias"
          className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card"
        >
          <div className="flex items-center gap-2.5 border-b border-border-light px-5 py-4">
            <BellRing className="h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
            <h2 id="prefs-categorias" className="font-heading text-base font-extrabold leading-tight text-text-primary">
              Qué te avisamos
            </h2>
          </div>

          <ToggleRow
            id="prefs-all"
            label="Permitir notificaciones"
            note="Interruptor general: apágalo para silenciarlo todo"
            checked={allOn}
            disabled={saving}
            onChange={(v) => save({ ...prefs, all: v })}
          />
          <div className="border-t border-border-light" />
          <ul>
            {PUSH_CATEGORIES.map((c) => (
              <li key={c.key}>
                <ToggleRow
                  id={`prefs-${c.key}`}
                  label={c.label}
                  note={c.note}
                  checked={isCategoryOn(prefs, c.key)}
                  // Con el general apagado, las categorías se ven pero no se
                  // pueden tocar: así se entiende por qué no llega nada.
                  disabled={saving || !allOn}
                  onChange={(v) => save({ ...prefs, [c.key]: v })}
                />
              </li>
            ))}
          </ul>
        </section>

        {/* No molestar */}
        <section
          aria-labelledby="prefs-dnd"
          className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card"
        >
          <div className="flex items-center gap-2.5 border-b border-border-light px-5 py-4">
            <Moon className="h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
            <h2 id="prefs-dnd" className="font-heading text-base font-extrabold leading-tight text-text-primary">
              No molestar
            </h2>
          </div>

          <ToggleRow
            id="prefs-dnd-toggle"
            label="Silenciar en una franja horaria"
            note="No recibirás push durante las horas elegidas"
            checked={dndOn}
            disabled={saving}
            onChange={(v) => save({ ...prefs, dnd: v })}
          />

          {dndOn && (
            <div className="grid grid-cols-2 gap-3 px-5 pb-5 pt-1">
              <TimeField
                id="prefs-dnd-from"
                label="Desde"
                value={dndFrom(prefs)}
                disabled={saving}
                onChange={(v) => onTime("dnd_from", v)}
              />
              <TimeField
                id="prefs-dnd-to"
                label="Hasta"
                value={dndTo(prefs)}
                disabled={saving}
                onChange={(v) => onTime("dnd_to", v)}
              />
              <p className="col-span-2 text-xs text-text-muted">
                Hora de España peninsular. La franja puede cruzar la medianoche
                (por ejemplo, de 23:00 a 08:00).
              </p>
            </div>
          )}
        </section>

        <p className="px-1 text-xs leading-relaxed text-text-muted">
          Estos ajustes son los mismos en la web y en la app: si los cambias
          aquí, se aplican también en tu móvil.
        </p>
      </div>
    </div>
  );
}

function ToggleRow({
  id, label, note, checked, disabled, onChange,
}: {
  id: string;
  label: string;
  note?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={cn("flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-bg-secondary", disabled && "opacity-50 hover:bg-transparent")}>
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-sm font-medium text-text-primary">{label}</span>
        {note && <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">{note}</span>}
      </label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function TimeField({
  id, label, value, disabled, onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-11 w-full rounded-xl border border-border bg-bg-primary px-3.5 text-[15px] text-text-primary transition-[border-color,box-shadow] duration-200 hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15 disabled:opacity-60"
      />
    </div>
  );
}
