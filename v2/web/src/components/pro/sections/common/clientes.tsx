"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  Contact,
  Download,
  MessageCircle,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProClient, ProClientSource } from "@/lib/pro/types";
import {
  addDays,
  dayLabel,
  localDate,
  money,
  relative,
  time,
} from "@/lib/pro/format";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { proCsvCell } from "@/lib/pro/csv";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Detail,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  PageHeader,
  Panel,
  Pill,
  Row,
  RowList,
  SearchInput,
  Segmented,
  StatusPill,
  Tip,
  inputClass,
  textareaClass,
} from "../../kit";
import { sectionLabel } from "../../sections";
import { AgendaClientFile } from "../agenda/client-file";

const SOURCE: Record<ProClientSource, string> = {
  franky: "Franky",
  hueco: "Hueco relámpago",
  card: "Franky Card",
  instagram: "Instagram",
  phone: "Teléfono",
  walkin: "Pasó por la puerta",
  google: "Google",
  grupo: "Grupo",
  unknown: "Sin indicar",
};
const FRANKY: ProClientSource[] = ["franky", "hueco", "card", "grupo"];

type Filter = "all" | "students" | "franky" | "lost" | "noshow";

export default function ClientesSection() {
  const { data, now, vertical, update, demo, can } = usePro();
  const showFinance = demo || can("finance.read");
  const toast = useToast();
  const params = useSearchParams();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [open, setOpen] = React.useState<string | null>(params.get("c"));
  const [creating, setCreating] = React.useState(false);
  const [visibleCount, setVisibleCount] = React.useState(80);

  const today = localDate(now);
  const sixWeeksAgo = addDays(today, -42);
  const monthAgo = addDays(today, -30);
  const label = sectionLabel(vertical.id, "clientes");

  const counts = {
    all: data.clients.length,
    students: data.clients.filter((c) => c.student).length,
    franky: data.clients.filter((c) => FRANKY.includes(c.source)).length,
    lost: data.clients.filter(
      (c) => c.lastVisit && localDate(c.lastVisit) < sixWeeksAgo,
    ).length,
    noshow: data.clients.filter((c) => c.noShows > 0).length,
  };

  const list = data.clients
    .filter((c) => {
      if (filter === "students" && !c.student) return false;
      if (filter === "franky" && !FRANKY.includes(c.source)) return false;
      if (
        filter === "lost" &&
        !(c.lastVisit && localDate(c.lastVisit) < sixWeeksAgo)
      )
        return false;
      if (filter === "noshow" && !c.noShows) return false;
      const q = query.trim().toLowerCase();
      return (
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.replace(/\s/g, "").includes(q.replace(/\s/g, ""))
      );
    })
    .sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""));

  const newThisMonth = data.clients.filter(
    (c) => localDate(c.createdAt) >= monthAgo,
  ).length;
  const recurring = data.clients.filter((c) => c.visits >= 3).length;

  const exportCsv = () => {
    const rows = [
      [
        "Nombre",
        "Teléfono",
        "Universidad",
        "Visitas",
        ...(showFinance ? ["Gasto (€)"] : []),
        "Última visita",
        "Origen",
        "Acepta comunicaciones",
      ],
      ...data.clients.map((c) => [
        c.name,
        c.phone ?? "",
        c.student?.university ?? "",
        String(c.visits),
        ...(showFinance
          ? [
              c.spentCents === null
                ? ""
                : (c.spentCents / 100).toFixed(2).replace(".", ","),
            ]
          : []),
        c.lastVisit ? localDate(c.lastVisit) : "",
        SOURCE[c.source],
        c.marketingConsent ? "Sí" : "No",
      ]),
    ];
    const csv = rows.map((r) => r.map(proCsvCell).join(";")).join("\n");
    const url = URL.createObjectURL(
      new Blob([String.fromCharCode(0xfeff) + csv], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-${data.space.slug}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(
      "Exportado",
      "Tus clientes son tuyos: te llevas la lista cuando quieras.",
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={label}
        title={`${data.clients.length.toLocaleString("es-ES")} ${label.toLowerCase()}`}
        description={
          demo
            ? `${counts.students} son estudiantes y ${counts.franky} llegaron por Franky. Todos son tuyos: los exportas cuando quieras.`
            : "Sus citas, preferencias y visitas en una sola ficha. Puedes exportar tu lista cuando la necesites."
        }
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Exportar
            </Button>
            <Button variant="dark" onClick={() => setCreating(true)}>
              <UserPlus className="h-4 w-4" /> Añadir
            </Button>
          </>
        }
      />

      <KpiRow>
        <Kpi label="Nuevos en 30 días" value={newThisMonth} />
        <Kpi
          label="Vuelven (3+ visitas)"
          value={`${Math.round((recurring / Math.max(1, data.clients.length)) * 100)} %`}
          hint={`${recurring} personas`}
        />
        {demo ? (
          <Kpi
            label="Estudiantes"
            value={counts.students}
            hint={`${data.clients.filter((c) => c.student?.verified).length} verificados`}
          />
        ) : null}
        {demo ? (
          <Kpi
            icon={Sparkles}
            label="Llegaron por Franky"
            value={counts.franky}
            emphasis
          />
        ) : null}
      </KpiRow>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Buscar por nombre, teléfono o correo"
          className="sm:w-80"
          id="client-search"
        />
        <Segmented<Filter>
          label="Filtrar"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Todos", count: counts.all },
            ...(demo
              ? [
                  {
                    value: "students" as const,
                    label: "Estudiantes",
                    count: counts.students,
                  },
                  {
                    value: "franky" as const,
                    label: "De Franky",
                    count: counts.franky,
                  },
                ]
              : []),
            {
              value: "lost",
              label: "Hace más de 6 semanas",
              count: counts.lost,
            },
            {
              value: "noshow",
              label: "No se presentaron",
              count: counts.noshow,
            },
          ]}
        />
      </div>

      {filter === "lost" && counts.lost ? (
        <Tip title="Recupéralos">
          Son {counts.lost} personas que no vienen desde hace más de seis
          semanas. Puedes preparar un mensaje de WhatsApp desde su ficha para
          quienes aceptaron recibir tus comunicaciones.
        </Tip>
      ) : null}

      <Panel flush>
        {list.length ? (
          <>
            <div
              className={cn(
                "hidden gap-3 border-b border-border-light px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-muted md:grid",
                showFinance
                  ? "grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_5rem_6rem_7rem]"
                  : "grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_5rem_7rem]",
              )}
            >
              <span>Nombre</span>
              <span>Origen</span>
              <span className="text-right">Visitas</span>
              {showFinance ? <span className="text-right">Gasto</span> : null}
              <span className="text-right">Última</span>
            </div>
            <RowList>
              {list.slice(0, visibleCount).map((c) => (
                <Row
                  key={c.id}
                  onClick={() => setOpen(c.id)}
                  className={cn(
                    "md:grid md:gap-3",
                    showFinance
                      ? "md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_5rem_6rem_7rem]"
                      : "md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_5rem_7rem]",
                  )}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar
                      name={c.name}
                      size="sm"
                      tone={c.student ? "violet" : "slate"}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">
                          {c.name}
                        </span>
                        {c.student?.verified ? (
                          <BadgeCheck
                            className="h-3.5 w-3.5 shrink-0 text-violet"
                            aria-label="Estudiante verificado"
                          />
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {c.student
                          ? c.student.university
                              .replace("Universidad de ", "")
                              .replace("Universidad ", "")
                          : (c.phone ?? c.email)}
                        <span className="md:hidden"> · {c.visits} {c.visits === 1 ? "visita" : "visitas"}</span>
                      </span>
                    </span>
                  </span>
                  <span className="hidden min-w-0 items-center md:flex">
                    {FRANKY.includes(c.source) ? (
                      <Pill tone="success">{SOURCE[c.source]}</Pill>
                    ) : (
                      <span className="truncate text-sm text-text-muted">
                        {SOURCE[c.source]}
                      </span>
                    )}
                  </span>
                  <span className="hidden text-right text-sm tabular md:block">
                    {c.visits}
                  </span>
                  {showFinance ? (
                    <span className="hidden text-right text-sm tabular md:block">
                      {c.spentCents === null
                        ? "Sin datos"
                        : money(c.spentCents, { round: true })}
                    </span>
                  ) : null}
                  <span className="shrink-0 text-right text-xs text-text-muted md:text-sm">
                    {c.lastVisit
                      ? relative(c.lastVisit, now.getTime())
                      : "Nunca"}
                  </span>
                </Row>
              ))}
            </RowList>
          </>
        ) : (
          <Empty
            icon={Contact}
            title="Nadie con ese filtro"
            body="Prueba con otra búsqueda o añade a alguien a mano."
          />
        )}
      </Panel>

      {list.length > visibleCount ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-muted">
            Mostrando {visibleCount} de {list.length}
          </p>
          <Button
            variant="outline"
            onClick={() => setVisibleCount((count) => count + 80)}
          >
            Ver más clientes
          </Button>
        </div>
      ) : null}

      <ClientDrawer clientId={open} onClose={() => setOpen(null)} />
      <NewClientDrawer
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={async (c) => {
          if (
            !(await update("client.create", (d) => ({
              ...d,
              clients: [c, ...d.clients],
            })))
          )
            return;
          toast.success("Añadido", c.name);
          setCreating(false);
          if (demo) setOpen(c.id);
        }}
      />
    </div>
  );
}

function ClientDrawer({
  clientId,
  onClose,
}: {
  clientId: string | null;
  onClose: () => void;
}) {
  const { data, update, now, pending, can, demo, vertical } = usePro();
  const showFinance = demo || can("finance.read");
  const toast = useToast();
  const client = data.clients.find((c) => c.id === clientId) ?? null;
  const [technical, setTechnical] = React.useState("");

  React.useEffect(() => {
    setTechnical(client?.technical ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  if (!client)
    return (
      <Drawer open={false} onOpenChange={onClose} title="">
        {null}
      </Drawer>
    );

  const ownBookings = data.bookings.filter((b) => b.clientId === client.id);
  // Las visitas anteriores a las citas cargadas (fichas de la agenda) también
  // cuentan: sin ellas, quien lleva 11 visitas enseñaría solo la de hoy.
  const pastVisits = (client.agenda?.visits ?? [])
    .filter((v) => !ownBookings.some((b) => b.start === v.at))
    .map((v) => ({
      id: `visit-${v.at}`,
      serviceId: v.serviceId,
      start: v.at,
      priceCents:
        data.services.find((s) => s.id === v.serviceId)?.priceCents ?? 0,
      status: "done" as const,
    }));
  const history = [...ownBookings, ...pastVisits]
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 8);
  const ticket =
    client.spentCents === null
      ? null
      : client.visits
        ? Math.round(client.spentCents / client.visits)
        : 0;
  const whatsapp = customerWhatsApp(
    client.phone,
    `Hola ${client.name.split(" ")[0]}, te escribimos de ${data.space.name}.`,
  );

  const save = async () => {
    if (
      !(await update("client.technical", (d) => ({
        ...d,
        clients: d.clients.map((c) =>
          c.id === client.id ? { ...c, technical } : c,
        ),
      })))
    )
      return;
    toast.success("Ficha guardada");
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={client.name}
      description={
        client.student
          ? `${client.student.university} · ${client.student.faculty}`
          : (client.phone ?? client.email ?? "Sin datos de contacto")
      }
      footer={
        <>
          {whatsapp ? (
            <a
              href={whatsapp}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          ) : null}
          <Button
            variant="dark"
            disabled={pending || !can("client.technical")}
            onClick={save}
          >
            Guardar ficha
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-1.5">
          {client.student?.verified ? (
            <Pill tone="violet">
              <BadgeCheck className="h-3 w-3" /> Estudiante verificado
            </Pill>
          ) : client.student ? (
            <Pill>Estudiante</Pill>
          ) : null}
          {client.cardMember ? <Pill tone="dark">Franky Card</Pill> : null}
          {FRANKY.includes(client.source) ? (
            <Pill tone="success">Llegó por {SOURCE[client.source]}</Pill>
          ) : (
            <Pill>{SOURCE[client.source]}</Pill>
          )}
          {client.noShows ? (
            <Pill tone="danger">{client.noShows} sin presentarse</Pill>
          ) : null}
        </div>

        <div
          className={cn(
            "grid gap-2",
            showFinance ? "grid-cols-3" : "grid-cols-1",
          )}
        >
          <MiniStat label="Visitas" value={String(client.visits)} />
          {showFinance ? (
            <MiniStat
              label="Gasto"
              value={
                client.spentCents === null
                  ? "Sin datos"
                  : money(client.spentCents, { round: true })
              }
            />
          ) : null}
          {showFinance ? (
            <MiniStat
              label="Ticket medio"
              value={
                ticket === null ? "Sin datos" : money(ticket, { round: true })
              }
            />
          ) : null}
        </div>

        <FormField
          label="Ficha técnica"
          htmlFor="client-tech"
          hint="Fórmula de color, técnica, preferencias. Solo la ve tu equipo."
        >
          <textarea
            id="client-tech"
            value={technical}
            onChange={(e) => setTechnical(e.target.value)}
            placeholder="Por ejemplo: 6.1 + 7.13 al 50 %, 20 vol, 35 min. Degradado bajo con 0,5."
            className={textareaClass}
          />
        </FormField>

        {vertical.engine === "agenda" ? (
          <AgendaClientFile clientId={client.id} />
        ) : null}

        <div>
          <p className="mb-2 text-sm font-semibold">
            {demo ? "Historial" : "Citas del periodo consultado"}
          </p>
          {history.length ? (
            <ul className="divide-y divide-border-light rounded-2xl border border-border">
              {history.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-3 px-3.5 py-2.5 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {data.services.find((s) => s.id === b.serviceId)?.name ??
                        "Visita"}
                    </span>
                    <span className="block text-xs text-text-muted">
                      {dayLabel(b.start)} · {time(b.start)}
                    </span>
                  </span>
                  <span className="text-sm tabular">{money(b.priceCents)}</span>
                  <StatusPill status={b.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">
              {demo
                ? "Aún no hay visitas registradas en Franky Pro."
                : "No hay citas de esta persona en el periodo consultado."}
            </p>
          )}
        </div>

        <div className="divide-y divide-border-light rounded-2xl border border-border px-4">
          {client.email ? <Detail label="Correo">{client.email}</Detail> : null}
          <Detail label="Cliente desde">
            {dayLabel(client.createdAt, { weekday: false })}
          </Detail>
          <Detail label="Última visita">
            {client.lastVisit
              ? relative(client.lastVisit, now.getTime())
              : "Nunca"}
          </Detail>
          <Detail label="Acepta comunicaciones">
            {client.marketingConsent ? "Sí" : "No"}
          </Detail>
        </div>
        <p className="text-xs text-text-muted">
          Solo escribimos a quien ha aceptado recibir comunicaciones de tu
          negocio.
        </p>
      </div>
    </Drawer>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg-secondary px-3 py-2.5">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="font-heading text-lg font-bold tabular">{value}</p>
    </div>
  );
}

function NewClientDrawer({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (c: ProClient) => Promise<void>;
}) {
  const { pending, can } = usePro();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [consent, setConsent] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setName("");
      setPhone("");
      setConsent(false);
    }
  }, [open]);
  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Añadir cliente"
      description="Para quien llama o pasa por la puerta. No necesita tener Franky."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="dark"
            disabled={
              pending || !can("client.create") || name.trim().length < 2
            }
            onClick={() =>
              onCreate({
                id: localId("c"),
                name: name.trim(),
                phone: phone.trim() || undefined,
                tags: [],
                visits: 0,
                spentCents: 0,
                noShows: 0,
                source: "walkin",
                marketingConsent: consent,
                cardMember: false,
                createdAt: new Date().toISOString(),
              })
            }
          >
            Añadir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Nombre y apellido" htmlFor="nc-name">
          <input
            id="nc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            autoFocus
          />
        </FormField>
        <FormField label="Teléfono" htmlFor="nc-phone">
          <input
            id="nc-phone"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            placeholder="600 000 000"
          />
        </FormField>
        <label className={cn("flex items-start gap-2.5 text-sm")}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--color-violet)]"
          />
          Acepta recibir avisos y ofertas del negocio
        </label>
      </div>
    </Drawer>
  );
}
