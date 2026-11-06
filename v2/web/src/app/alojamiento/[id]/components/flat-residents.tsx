import Link from "next/link";
import Image from "next/image";
import { Users, ArrowUpRight } from "lucide-react";
import { Reveal, RevealItem } from "@/components/motion";

export interface FlatResident {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  career: string | null;
  university_course: string | null;
  room_label: string | null;
}

// Quién vive ya en el piso (v3): misma cabecera que el resto de secciones de la
// ficha y una rejilla de personas con elevación al pasar el ratón.
export default function FlatResidents({ residents }: { residents: FlatResident[] }) {
  if (!residents || residents.length === 0) return null;

  return (
    <Reveal as="section" className="border-t border-border-light pt-8">
      <h2 className="flex items-center gap-2.5 font-heading text-xl font-bold text-text-primary">
        <Users className="h-5 w-5 text-violet" />
        Quién vive aquí
      </h2>
      <p className="mt-1.5 text-sm text-text-muted">
        Estudiantes que ya viven en este piso. Conócelos antes de mudarte.
      </p>
      <Reveal stagger className="mt-5 grid gap-3 sm:grid-cols-2">
        {residents.map((r, i) => (
          <RevealItem key={r.id} index={i} asChild>
            <Link
              href={`/perfil/${r.id}`}
              className="group hover-lift flex items-center gap-3 rounded-2xl border border-border bg-bg-primary p-3 shadow-card hover:border-text-primary/15"
            >
              {r.avatar_url ? (
                <Image
                  src={r.avatar_url}
                  alt={r.full_name ?? "Estudiante"}
                  width={44}
                  height={44}
                  className="h-11 w-11 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-bg-secondary font-heading font-bold text-text-primary">
                  {(r.full_name ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text-primary transition-colors group-hover:text-violet">
                  {r.full_name ?? "Estudiante"}
                </p>
                <p className="truncate text-xs text-text-muted">
                  {[r.career, r.university_course].filter(Boolean).join(" · ") || "Compañero de piso"}
                </p>
                {r.room_label && (
                  <p className="truncate text-[11px] text-text-muted">{r.room_label}</p>
                )}
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-text-muted arrow-nudge" />
            </Link>
          </RevealItem>
        ))}
      </Reveal>
    </Reveal>
  );
}
