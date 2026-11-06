import { ArrowUpRight, CalendarDays, Check, Clock3, Users } from "lucide-react";
import type { ProEngine } from "@/lib/pro/types";

const PREVIEWS: Record<
  ProEngine,
  { title: string; tabs: string[]; columns: string[]; items: string[] }
> = {
  agenda: {
    title: "Un día bien organizado.",
    tabs: ["Agenda", "Servicios", "Clientes"],
    columns: ["Alex", "Cris", "Dani"],
    items: ["Corte y acabado", "Color y cuidado", "Corte y peinado"],
  },
  tables: {
    title: "Cada reserva, en su sitio.",
    tabs: ["Reservas", "Servicios", "Clientes"],
    columns: ["13:00", "14:00", "15:00"],
    items: ["Comida de grupo", "Reserva para dos", "Mesa con amigos"],
  },
  night: {
    title: "La próxima noche empieza aquí.",
    tabs: ["Eventos", "Local", "Comunidad"],
    columns: ["Preparar", "Publicar", "Compartir"],
    items: ["Noche universitaria", "Encuentro de campus", "Sesión del viernes"],
  },
  classes: {
    title: "Haz sitio a lo que les mueve.",
    tabs: ["Horario", "Sesiones", "Participantes"],
    columns: ["16:00", "17:00", "18:00"],
    items: ["Sesión de iniciación", "Grupo de tarde", "Clase de refuerzo"],
  },
  courts: {
    title: "El espacio y el momento.",
    tabs: ["Disponibilidad", "Reservas", "Clientes"],
    columns: ["Espacio 1", "Espacio 2", "Espacio 3"],
    items: ["Reserva de grupo", "Turno de tarde", "Reserva individual"],
  },
  housing: {
    title: "Encuentra su próximo hogar.",
    tabs: ["Anuncios", "Visitas", "Conversaciones"],
    columns: ["Publicar", "Conversar", "Visitar"],
    items: [
      "Piso junto al campus",
      "Habitación luminosa",
      "Vivienda compartida",
    ],
  },
  community: {
    title: "Más vida en tu comunidad.",
    tabs: ["Miembros", "Actividades", "Conversaciones"],
    columns: ["Organizar", "Publicar", "Participar"],
    items: ["Bienvenida al campus", "Encuentro de socios", "Próxima actividad"],
  },
  university: {
    title: "Un campus más conectado.",
    tabs: ["Campus", "Eventos", "Comunidad"],
    columns: ["Organizar", "Informar", "Acompañar"],
    items: [
      "Jornada de bienvenida",
      "Actividad del campus",
      "Encuentro de estudiantes",
    ],
  },
};

export default function ProductPreview({
  engine,
  name,
}: {
  engine: ProEngine;
  name: string;
}) {
  const preview = PREVIEWS[engine];
  const isCalendar = ["agenda", "tables", "classes", "courts"].includes(engine);
  return (
    <figure className="relative min-w-0">
      <div className="rounded-[1.75rem] border border-border bg-bg-primary p-4 shadow-card sm:p-6">
        <div className="flex items-center justify-between border-b border-border-light pb-4">
          <span className="font-heading text-lg font-bold">
            franky<span className="text-violet">.</span>{" "}
            <span className="ml-1 text-xs font-medium text-text-muted">
              PRO
            </span>
          </span>
          <span className="text-xs text-text-muted">{name}</span>
        </div>
        <div className="py-6">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-text-muted">
            Todo a mano
          </p>
          <p className="mt-2 max-w-xs font-heading text-[1.75rem] font-bold leading-tight tracking-tight">
            {preview.title}
          </p>
        </div>
        <div className="mb-5 flex gap-4 border-b border-border-light text-xs sm:gap-6">
          {preview.tabs.map((tab, index) => (
            <span
              key={tab}
              className={`pb-3 ${index === 0 ? "border-b-2 border-violet font-semibold text-text-primary" : "text-text-muted"}`}
            >
              {tab}
            </span>
          ))}
        </div>
        {isCalendar ? (
          <div className="grid grid-cols-3 gap-2">
            {preview.columns.map((column, index) => (
              <div key={column} className="min-w-0">
                <p className="mb-3 truncate text-center text-xs font-semibold text-text-muted">
                  {column}
                </p>
                <div className="flex h-52 flex-col gap-2 rounded-lg bg-bg-secondary/70 p-1.5">
                  {index === 1 && (
                    <div className="h-8 shrink-0 border-b border-border-light" />
                  )}
                  <div
                    className={`rounded-lg border-l-2 p-2.5 ${index === 0 ? "border-violet bg-violet-50" : "border-border bg-bg-primary"}`}
                  >
                    <Clock3
                      className="mb-3 h-3.5 w-3.5 text-text-muted"
                      strokeWidth={1.75}
                    />
                    <p className="text-xs font-semibold leading-relaxed">
                      {preview.items[index]}
                    </p>
                    <p className="mt-2 text-[10px] text-text-muted">
                      Confirmada
                    </p>
                  </div>
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-text-muted">
                    Disponible
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {preview.items.map((item, index) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-xl border border-border-light p-3.5"
              >
                <CalendarDays
                  className="h-5 w-5 shrink-0 text-violet"
                  strokeWidth={1.75}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{item}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {preview.columns[index]}
                  </p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-text-muted" />
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 flex items-center gap-2 border-t border-border-light pt-4 text-xs text-text-secondary">
          <Users className="h-4 w-4 text-violet" strokeWidth={1.75} /> Tu
          equipo, conectado <Check className="ml-auto h-4 w-4 text-violet" />
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-text-muted">
        Vista ilustrativa. Explora la demo de tu sector para conocer la
        herramienta.
      </figcaption>
    </figure>
  );
}
