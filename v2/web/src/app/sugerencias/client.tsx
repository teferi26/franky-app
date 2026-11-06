"use client";

// ─── Formulario de sugerencias (cliente) ─────────────────────────────────
// Tipo (idea, fallo, otro) + texto libre. INSERT directo en platform_messages:
// la RLS platform_messages_insert_todos deja escribir con tu propio user_id
// (WITH CHECK user_id = auth.uid()), y el aviso por correo al equipo lo
// dispara el trigger de la BD, así que no depende de esta pantalla. Mismos
// valores de kind/subject/source que manda la app para que en el buzón se
// vean iguales (source = "web" en vez de "movil").
// Fail-soft: si algo falla, no se borra lo escrito.

import { useState } from "react";
import Link from "next/link";
import { Bug, Check, Lightbulb, Loader2, MessageCircleQuestion, Send } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { Textarea } from "@/components/ui/textarea";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tipo = "idea" | "fallo" | "otro";

const TIPOS: { value: Tipo; label: string; icon: typeof Lightbulb }[] = [
  { value: "idea", label: "Una idea", icon: Lightbulb },
  { value: "fallo", label: "Un fallo", icon: Bug },
  { value: "otro", label: "Otro", icon: MessageCircleQuestion },
];

const MAX = 2000;

// Mapeo idéntico al de la app: tipo de la UI -> kind de la tabla (CHECK
// kind IN ('contacto','sugerencia','fallo','otro')).
function kindOf(tipo: Tipo): "sugerencia" | "fallo" | "otro" {
  return tipo === "fallo" ? "fallo" : tipo === "idea" ? "sugerencia" : "otro";
}



export default function SugerenciasClient(_props: { userId: string }) {
  const [tipo, setTipo] = useState<Tipo>("idea");
  const [texto, setTexto] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cuerpo = texto.trim();
    if (!cuerpo || sending) return;
    setSending(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: insErr } = await supabase.rpc("submit_platform_suggestion", {
        p_kind: kindOf(tipo), p_body: cuerpo, p_source: "web",
      });
      if (insErr) {
        setError("No se pudo enviar. Inténtalo de nuevo en un momento. No hemos borrado lo que escribiste.");
        return;
      }
      setSent(true);
      setTexto("");
      setTipo("idea");
    } catch {
      setError("No se pudo enviar. Comprueba tu conexión e inténtalo de nuevo. No hemos borrado lo que escribiste.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-2xl border border-border bg-bg-primary p-8 text-center shadow-card animate-scale-in" role="status">
        <Check className="mx-auto h-7 w-7 text-success" aria-hidden="true" />
        <h2 className="mt-4 font-heading text-xl font-extrabold text-text-primary">¡Gracias!</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
          Tu sugerencia está guardada en el buzón del equipo. Gracias por ayudarnos a mejorar Franky.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setSent(false)}
            className={buttonVariants({ variant: "dark" })}
          >
            Enviar otra
          </button>
          <Link
            href="/perfil"
            className={buttonVariants({ variant: "outline" })}
          >
            Volver a mi perfil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6 rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8"
    >
      <fieldset>
        <legend className="text-sm font-semibold text-text-primary mb-2">¿Qué tipo de sugerencia es?</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de sugerencia">
          {TIPOS.map((t) => {
            const active = tipo === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTipo(t.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "border-text-primary bg-text-primary text-bg-primary"
                    : "border-border text-text-secondary hover:border-text-primary/30 hover:text-text-primary"
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="sugerencia-texto" className="block text-sm font-semibold text-text-primary mb-2">
          Cuéntanos con tus palabras
        </label>
        <Textarea
          id="sugerencia-texto"
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, MAX))}
          placeholder="Escribe aquí tu idea, el fallo que has visto o lo que quieras contarnos"
          maxLength={MAX}
          required
          rows={6}
          className="min-h-[140px]"
          aria-describedby="sugerencia-contador"
        />
        <p id="sugerencia-contador" className="mt-1 text-right text-xs text-text-muted">
          {texto.length}/{MAX}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-error">{error}</p>
      )}

      <Button type="submit" variant="dark" size="lg" disabled={!texto.trim() || sending} className="w-full">
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Enviar sugerencia
      </Button>

      <p className="text-xs text-text-muted flex items-center gap-2">
        <Send className="h-3.5 w-3.5 shrink-0" />
        Tu sugerencia se guarda con tu cuenta, no es anónima.
      </p>
    </form>
  );
}
