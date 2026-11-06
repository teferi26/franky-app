"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useSession } from "@/components/SessionProvider";
import { createClient } from "@/lib/supabase-client";

type Space = { id: string; name: string; kind: string; city: string | null };

const KIND_LABEL: Record<string, string> = {
  housing: "Pisos",
  community: "Comunidad",
  leisure: "Negocio",
  university: "Universidad",
};

/**
 * Los espacios reales de quien ha iniciado sesión. Si la función aún no
 * existe en la base de datos o no hay sesión, no se pinta nada: la entrada
 * sigue sirviendo para ver las demos.
 */
export default function MySpaces() {
  const session = useSession();
  const userId = session.user?.id ?? null;
  const [spaces, setSpaces] = React.useState<Space[] | null>(null);

  React.useEffect(() => {
    if (!userId) return;
    let alive = true;
    createClient()
      .rpc("list_my_workspaces")
      .then(({ data, error }) => {
        if (!alive || error || !Array.isArray(data)) return;
        setSpaces(
          (data as Record<string, unknown>[]).map((w) => ({
            id: String(w.id),
            name: String(w.name ?? "Mi espacio"),
            kind: String(w.kind ?? "leisure"),
            city: (w.city as string | null) ?? null,
          })),
        );
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  if (!spaces?.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 pb-4 pt-6 sm:px-6">
      <p className="eyebrow">Entra en tu negocio</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {spaces.map((s) => (
          <li key={s.id}>
            <Link href={`/pro/${s.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-text-primary p-5 text-bg-primary shadow-card transition-transform hover:-translate-y-0.5">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{s.name}</span>
                <span className="block truncate text-sm opacity-70">
                  {KIND_LABEL[s.kind] ?? "Espacio"}
                  {s.city ? ` · ${s.city}` : ""}
                </span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
