"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Loader2, MessageCircle, Trash2, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useSession } from "@/components/SessionProvider";
import VerifiedBadge from "@/components/VerifiedBadge";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Ficha de un anuncio del mercado (migración 137). "Contactar" abre el chat 1:1
 * con quien publica, vía la misma RPC que usa la app móvil
 * (get_or_create_direct_chat).
 */
type Listing = {
  id: string;
  kind: string;
  category: string;
  title: string;
  body: string | null;
  price_cents: number | null;
  image_url: string | null;
  city: string | null;
  status: string;
  created_at: string;
  author_id: string;
};

const KIND_LABEL: Record<string, string> = {
  venta: "Se vende",
  busco: "Se busca",
  ofrezco: "Se ofrece",
};

function price(cents: number | null): string {
  if (cents == null) return "A convenir";
  if (cents === 0) return "Gratis";
  return `${(cents / 100).toLocaleString("es-ES")} €`;
}

export default function ListingDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { user, loading: sessionLoading } = useSession();
  const [item, setItem] = useState<Listing | null | "notfound">(null);
  const [author, setAuthor] = useState<{ name: string | null; avatar: string | null; verified: boolean | null } | null>(null);
  const [busy, setBusy] = useState(false);
  // Aviso amable cuando el servidor rechaza abrir el chat (dm_privacy, 148).
  const [contactError, setContactError] = useState("");

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("student_listings")
        .select("id, kind, category, title, body, price_cents, image_url, city, status, created_at, author_id")
        .eq("id", id)
        .eq("is_deleted", false)
        .maybeSingle();
      if (!data) return setItem("notfound");
      setItem(data as Listing);
      const { data: prof } = await supabase
        .from("public_profiles")
        // student_email_verified va en la misma consulta que ya se hacía: da
        // confianza saber si quien vende es estudiante verificado.
        .select("full_name, avatar_url, student_email_verified")
        .eq("id", data.author_id)
        .maybeSingle();
      setAuthor({
        name: (prof as { full_name?: string | null } | null)?.full_name ?? null,
        avatar: (prof as { avatar_url?: string | null } | null)?.avatar_url ?? null,
        verified: (prof as { student_email_verified?: boolean | null } | null)?.student_email_verified ?? null,
      });
    })();
  }, [id, user, sessionLoading]);

  const contact = async () => {
    if (!item || item === "notfound") return;
    setBusy(true);
    setContactError("");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_or_create_direct_chat", {
      p_other_user_id: item.author_id,
    });
    setBusy(false);
    if (!error && data) {
      router.push(`/chats?chat=${data}`);
      return;
    }
    // Migración 148: la preferencia "quién puede escribirte" (dm_privacy) se
    // exige en servidor. Mensaje amable en vez de fallar en silencio.
    if (error?.message?.includes("not_allowed")) {
      const name = author?.name ?? "Esta persona";
      setContactError(`${name} ha limitado quién puede escribirle. Si os seguís mutuamente o verificas tu email de estudiante, podrás contactarle.`);
    } else {
      setContactError("No se pudo abrir el chat. Inténtalo de nuevo en unos segundos.");
    }
  };

  const remove = async () => {
    if (!item || item === "notfound") return;
    setBusy(true);
    const supabase = createClient();
    await supabase.rpc("delete_student_listing", { p_id: item.id });
    router.push("/mercado");
  };

  if (sessionLoading || (user && item === null)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h2 className="font-heading text-xl font-extrabold">Entra para ver el anuncio</h2>
        <Link
          href={`/login?next=${encodeURIComponent(`/mercado/${id}`)}`}
          className={buttonVariants({ variant: "dark", size: "lg", className: "mt-5" })}
        >
          Iniciar sesión
        </Link>
      </div>
    );
  }

  if (item === "notfound") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="font-semibold">Este anuncio ya no está disponible.</p>
        <Link href="/mercado" className="link-underline mt-4 inline-flex font-semibold text-text-primary">
          Volver al mercado
        </Link>
      </div>
    );
  }

  // A estas alturas ya se han descartado los estados "loading" y "notfound",
  // pero TS no lo infiere del union: guarda explícita para estrecharlo a Listing.
  if (item === null) return null;

  const isMine = user.id === item.author_id;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:py-12 animate-page-in">
      <Link
        href="/mercado"
        className="group mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" /> Mercado
      </Link>

      <div className="overflow-hidden rounded-3xl border border-border bg-bg-primary shadow-card">
        {item.image_url ? (
          <div className="relative h-72 bg-bg-secondary">
            <Image
              src={item.image_url}
              alt={item.title}
              fill
              className="object-cover"
              priority
              // La ficha vive en un contenedor de 672 px: sin `sizes` el navegador
              // se traia la variante de 3840 px de la LCP de esta pantalla.
              sizes="(max-width: 672px) 100vw, 672px"
            />
          </div>
        ) : (
          <div className="flex h-56 items-center justify-center bg-bg-secondary">
            <Tag className="h-10 w-10 text-text-muted/50" aria-hidden="true" />
          </div>
        )}
        <div className="p-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-deep">
              {KIND_LABEL[item.kind] || item.kind}
            </span>
            <span className="text-xs capitalize text-text-muted">{item.category}</span>
            {item.city && <span className="text-xs text-text-muted">· {item.city}</span>}
          </div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary sm:text-3xl">{item.title}</h1>
          <p className="mt-2 font-heading text-2xl font-bold tabular text-text-primary">
            {price(item.price_cents)}
          </p>
          {item.body && (
            <p className="mt-4 whitespace-pre-wrap leading-relaxed text-text-secondary">
              {item.body}
            </p>
          )}

          <div className="mt-6 flex items-center gap-3 border-t border-border-light pt-4">
            <div className="h-9 w-9 overflow-hidden rounded-full bg-bg-secondary ring-1 ring-border">
              {author?.avatar ? (
                <Image src={author.avatar} alt="" width={36} height={36} className="h-full w-full object-cover" unoptimized />
              ) : null}
            </div>
            <span className="flex items-center gap-1.5 text-sm text-text-secondary">
              {author?.name || "Estudiante"}
              <VerifiedBadge verified={author?.verified} />
            </span>
          </div>

          <div className="mt-5">
            {isMine ? (
              <Button
                variant="outline"
                size="lg"
                onClick={remove}
                disabled={busy}
                className="text-error hover:text-error"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Retirar mi anuncio
              </Button>
            ) : (
              <Button
                variant="dark"
                size="lg"
                onClick={contact}
                disabled={busy}
                className="w-full sm:w-auto"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                Contactar
              </Button>
            )}
            {contactError && (
              <p className="mt-3 rounded-xl bg-bg-secondary p-3 text-sm text-text-secondary">
                {contactError}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
