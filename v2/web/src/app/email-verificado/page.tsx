import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle, AlertCircle, Clock, Smartphone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AuthResult } from "@/app/auth/AuthShell";

/**
 * Aterrizaje del enlace de verificación de email (hallazgo M3).
 *
 * Página PÚBLICA y sin datos personales: el enlace del correo se abre muchas
 * veces en un navegador SIN sesión web (siempre, en usuarios que solo usan la
 * app móvil). Antes se aterrizaba en /perfil, que rebotaba al login y dejaba
 * al usuario sin saber si la verificación había funcionado.
 *
 * Lee ?estado=ok|invalido|caducado (y limite, del rate limit) y muestra el
 * resultado. Quien tiene cuenta web puede seguir a /perfil desde aquí; quien
 * venga del móvil solo tiene que volver a la app.
 *
 * Es un componente de servidor sin scripts propios: compatible con la CSP
 * estricta con nonce sin tocar nada.
 */

export const metadata: Metadata = {
  title: "Verificación de email",
  description: "Resultado de la verificación de tu dirección de correo.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Estado = "ok" | "invalido" | "caducado" | "limite" | "temporal";

const CONTENIDO: Record<
  Estado,
  { titulo: string; texto: string; tono: "success" | "warning" | "error" }
> = {
  temporal: {
    titulo: 'No hemos podido confirmar el correo todavía',
    texto: 'No hemos podido confirmar el resultado por un problema temporal. Vuelve a abrir el enlace desde tu correo en unos minutos. Si tu perfil ya indica que está verificado, no necesitas hacer nada más.',
    tono: 'warning',
  },
  ok: {
    titulo: "Email verificado",
    texto:
      "Tu dirección de correo queda confirmada. Ya puedes volver a la app y seguir donde estabas: no hace falta nada más.",
    tono: "success",
  },
  caducado: {
    titulo: "El enlace ha caducado",
    texto:
      "Los enlaces de verificación caducan a las 72 horas. Pide uno nuevo desde tu perfil (en la app o en la web) y vuelve a intentarlo.",
    tono: "warning",
  },
  invalido: {
    titulo: "Enlace no válido",
    texto:
      "Este enlace de verificación no sirve: puede que ya se haya usado o que esté incompleto. Si tu email ya aparece como verificado en tu perfil, no tienes que hacer nada más.",
    tono: "error",
  },
  limite: {
    titulo: "Demasiados intentos",
    texto:
      "Se han hecho demasiadas comprobaciones seguidas desde tu conexión. Espera un rato y vuelve a abrir el enlace del correo.",
    tono: "warning",
  },
};

export default async function EmailVerificadoPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const key: Estado =
    estado === "ok" || estado === "caducado" || estado === "limite" || estado === "temporal"
      ? estado
      : "invalido";
  const { titulo, texto, tono } = CONTENIDO[key];

  const icono =
    key === "ok" ? (
      <CheckCircle className="h-10 w-10" strokeWidth={1.5} />
    ) : key === "caducado" ? (
      <Clock className="h-10 w-10" strokeWidth={1.5} />
    ) : (
      <AlertCircle className="h-10 w-10" strokeWidth={1.5} />
    );

  return (
    <AuthResult
      tone={tono}
      icon={icono}
      title={titulo}
      actions={
        <>
          <Link href="/perfil" className={cn(buttonVariants({ variant: "dark", size: "lg" }))}>
            Ir a mi perfil en la web
          </Link>
          <Link href="/" className="link-underline text-sm font-semibold text-text-primary">
            Volver al inicio
          </Link>
        </>
      }
    >
      <p>{texto}</p>
      {key === "ok" && (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-text-muted">
          <Smartphone className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Si venías de la app, ciérrala y vuelve a abrirla.</span>
        </p>
      )}
    </AuthResult>
  );
}
