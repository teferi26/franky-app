"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import Image from "next/image";
import {
  Plus,
  Loader2,
  Tag,
  BookOpen,
  Sofa,
  Bus,
  GraduationCap,
  Home as HomeIcon,
  Package,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useSession } from "@/components/SessionProvider";
import { Button, buttonVariants } from "@/components/ui/button";
import { SpotlightCard } from "@/components/motion";

/**
 * Mercado estudiantil en web (tabla student_listings + RPC
 * get_student_listings, migración 137). Ya existía en la app móvil; en web es
 * de las cosas que más retienen y más se comparten dentro de un campus.
 *
 * Requiere sesión y muestra los anuncios de la propia universidad (lo filtra
 * la RLS/RPC del backend). El detalle y la publicación cuelgan de aquí.
 */
type Listing = {
  id: string;
  kind: "venta" | "busco" | "ofrezco";
  category: string;
  title: string;
  body: string | null;
  price_cents: number | null;
  image_url: string | null;
  city: string | null;
  status: string;
  created_at: string;
  author_id: string;
  author_name: string | null;
  author_avatar: string | null;
  is_mine: boolean;
};

const KIND_LABEL: Record<string, string> = {
  venta: "Vendo",
  busco: "Busco",
  ofrezco: "Ofrezco",
};
// Tipo de anuncio como etiqueta neutra: la única que lleva color es "Vendo".
const KIND_STYLE: Record<string, string> = {
  venta: "bg-violet-50 text-violet-deep",
  busco: "border border-border text-text-secondary",
  ofrezco: "bg-bg-secondary text-text-secondary",
};

const CATEGORIES = [
  { value: "", label: "Todo", icon: Package },
  { value: "libros", label: "Libros", icon: BookOpen },
  { value: "muebles", label: "Muebles", icon: Sofa },
  { value: "transporte", label: "Transporte", icon: Bus },
  { value: "clases", label: "Clases", icon: GraduationCap },
  { value: "vivienda", label: "Vivienda", icon: HomeIcon },
  { value: "otros", label: "Otros", icon: Tag },
];
const KINDS = [
  { value: "", label: "Todos" },
  { value: "venta", label: "Se vende" },
  { value: "busco", label: "Se busca" },
  { value: "ofrezco", label: "Se ofrece" },
];

const PAGE_SIZE = 40;

function price(cents: number | null): string {
  if (cents == null) return "A convenir";
  if (cents === 0) return "Gratis";
  return `${(cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 0 })} €`;
}

export default function MercadoClient() {
  const { user, loading: sessionLoading } = useSession();
  const [items, setItems] = useState<Listing[] | null>(null);
  const [kind, setKind] = useState("");
  const [category, setCategory] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(
    async (reset: boolean) => {
      const supabase = createClient();
      const offset = reset ? 0 : items?.length ?? 0;
      const { data, error } = await supabase.rpc("get_student_listings", {
        p_kind: kind || null,
        p_category: category || null,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });
      const rows = (error ? [] : (data ?? [])) as Listing[];
      setDone(rows.length < PAGE_SIZE);
      setItems((prev) => (reset || !prev ? rows : [...prev, ...rows]));
    },
    [kind, category, items?.length]
  );

  useEffect(() => {
    if (sessionLoading || !user) return;
    setItems(null);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, category, user, sessionLoading]);

  if (sessionLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h2 className="font-heading text-xl font-extrabold">Entra para ver el mercado</h2>
        <p className="mt-2 text-text-muted">
          El mercado es de tu universidad, así que necesitas tu cuenta para verlo.
        </p>
        <Link href="/login?next=%2Fmercado" className={buttonVariants({ variant: "dark", size: "lg", className: "mt-5" })}>
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Filtros */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.value}
              onClick={() => setKind(k.value)}
              aria-pressed={kind === k.value}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                kind === k.value
                  ? "border-text-primary bg-text-primary text-bg-primary"
                  : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/30 hover:text-text-primary"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              aria-pressed={category === c.value}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                category === c.value
                  ? "border-violet bg-violet-50 text-violet-deep"
                  : "border-border bg-bg-primary text-text-muted hover:border-text-primary/30 hover:text-text-primary"
              }`}
            >
              <c.icon className="h-3.5 w-3.5" />
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {items === null ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
        </div>
      ) : items.length === 0 ? (
        /* Vacío del sistema con CTA: en un mercado de dos lados, el vacío se
           rompe publicando, así que el botón lleva directo a crear anuncio. */
        <EmptyState
          icon={Package}
          title="Todavía no hay nada por aquí"
          description="Sé quien estrene el mercado de tu universidad: libros que ya no usas, muebles del piso, clases particulares."
          action={{ href: "/mercado/crear", label: "Publicar un anuncio" }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <div key={it.id} className="animate-list-in" style={{ ["--i" as string]: i % PAGE_SIZE } as CSSProperties}>
            <SpotlightCard asChild>
            <Link
              href={`/mercado/${it.id}`}
              className="group hover-lift block h-full overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card hover:border-text-primary/15"
            >
              {it.image_url ? (
                <div className="img-zoom relative aspect-[4/3] bg-bg-secondary">
                  <Image
                    src={it.image_url}
                    alt={it.title}
                    fill
                    sizes="(max-width:640px) 100vw, 33vw"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-bg-secondary">
                  <Tag className="h-8 w-8 text-text-muted/50" aria-hidden="true" />
                </div>
              )}
              <div className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${KIND_STYLE[it.kind]}`}>
                    {KIND_LABEL[it.kind]}
                  </span>
                  {it.status !== "activo" && (
                    <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-muted">
                      {it.status === "reservado" ? "Reservado" : "Cerrado"}
                    </span>
                  )}
                </div>
                <h3 className="line-clamp-2 font-heading font-bold text-text-primary">{it.title}</h3>
                <p className="mt-1 font-heading text-lg font-bold tabular text-text-primary">
                  {price(it.price_cents)}
                </p>
              </div>
            </Link>
            </SpotlightCard>
            </div>
          ))}
        </div>
      )}

      {items && items.length > 0 && !done && (
        <div className="mt-8 text-center">
          <Button
            variant="outline"
            size="lg"
            onClick={async () => {
              setLoadingMore(true);
              await load(false);
              setLoadingMore(false);
            }}
            disabled={loadingMore}
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Ver más
          </Button>
        </div>
      )}

      {/* Botón flotante de publicar */}
      <Link
        href="/mercado/crear"
        // Se levanta por encima de la barra de pestañas móvil (ver globals.css).
        style={{ bottom: "calc(1.5rem + var(--tabbar-offset, 0px))" }}
        className="fixed right-6 z-40 inline-flex items-center gap-2 rounded-full bg-text-primary px-5 py-3.5 text-sm font-semibold text-bg-primary shadow-float transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2"
      >
        <Plus className="h-5 w-5" />
        <span className="hidden sm:inline">Publicar</span>
      </Link>
    </div>
  );
}
