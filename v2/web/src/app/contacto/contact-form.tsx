"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Formulario de contacto de verdad.
 *
 * El que había era `<form action="mailto:contacto@franky.es" method="POST">`:
 * los navegadores modernos no hacen nada útil con eso (o lo ignoran, o abren un
 * cliente de correo que casi nadie tiene configurado), así que todo lo que
 * escribía la gente se perdía. Ahora va a /api/contacto, se guarda en el buzón y
 * el equipo recibe un correo al momento.
 */
// El select nativo comparte la piel del Input para que la fila no desentone.
const SELECT =
  "flex h-11 w-full rounded-xl border border-border bg-bg-primary px-3.5 text-[15px] text-text-primary transition-[border-color,box-shadow] duration-200 hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15";

export default function ContactForm() {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const datos = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/contacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: String(datos.get("nombre") ?? ""),
          email: String(datos.get("email") ?? ""),
          asunto: String(datos.get("asunto") ?? ""),
          mensaje: String(datos.get("mensaje") ?? ""),
          tipo: String(datos.get("tipo") ?? "contacto"),
          web: String(datos.get("web") ?? ""),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.message || json?.error || "No se pudo enviar el mensaje.");
        setEnviando(false);
        return;
      }
      setEnviado(true);
    } catch {
      setError("Sin conexión. Inténtalo de nuevo en un momento.");
    }
    setEnviando(false);
  }

  if (enviado) {
    return (
      <div className="animate-scale-in rounded-2xl border border-success/20 bg-emerald-50 p-6 text-center dark:bg-emerald-950/30">
        <CheckCircle2 className="mx-auto mb-3 h-6 w-6 text-success" aria-hidden="true" />
        <p className="font-heading text-lg font-extrabold text-emerald-800 dark:text-emerald-300">Mensaje enviado</p>
        <p className="mt-1.5 text-sm leading-relaxed text-emerald-700 dark:text-emerald-400">
          Lo hemos recibido y te contestamos al correo que nos has dejado. Solemos
          tardar menos de 24 horas.
        </p>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="nombre" label="Nombre">
          <Input id="nombre" type="text" name="nombre" required maxLength={120} placeholder="Tu nombre" />
        </Field>
        <Field id="email" label="Email">
          <Input id="email" type="email" name="email" required maxLength={200} placeholder="tu@email.com" />
        </Field>
      </div>

      <Field id="tipo" label="¿De qué va?">
        <select id="tipo" name="tipo" defaultValue="contacto" className={SELECT}>
          <option value="contacto">Una pregunta</option>
          <option value="sugerencia">Una sugerencia</option>
          <option value="fallo">Algo que no funciona</option>
          <option value="otro">Otra cosa</option>
        </select>
      </Field>

      <Field id="asunto" label="Asunto">
        <Input id="asunto" type="text" name="asunto" required maxLength={200} placeholder="¿En qué podemos ayudarte?" />
      </Field>

      <Field id="mensaje" label="Mensaje">
        <Textarea
          id="mensaje"
          name="mensaje"
          required
          rows={5}
          maxLength={4000}
          className="resize-none"
          placeholder="Cuéntanos con detalle..."
        />
      </Field>

      {/* Trampa para bots: invisible y fuera del foco del teclado. Si viene
          rellenado, el servidor descarta el mensaje sin decir nada. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="web">No rellenes esto</label>
        <input id="web" type="text" name="web" tabIndex={-1} autoComplete="off" />
      </div>

      {error && (
        <p role="alert" className="animate-fade-in text-sm font-medium text-error">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" loading={enviando} className="w-full sm:w-auto">
        {!enviando && <Send className="h-4 w-4" aria-hidden="true" />}
        {enviando ? "Enviando..." : "Enviar mensaje"}
      </Button>
    </form>
  );
}
