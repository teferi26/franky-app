"use client";

import * as React from "react";
import { CalendarDays, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProGroupRequest } from "@/lib/pro/types";
import { capitalize, dayLabel, money, relative, time } from "@/lib/pro/format";
import { Detail, Drawer, Empty, FormField, Kpi, KpiRow, PageHeader, Panel, Pill, Row, RowList, Segmented, Tip, inputClass, textareaClass } from "../../kit";

const STATUS: Record<ProGroupRequest["status"], { label: string; tone: "violet" | "warning" | "success" | "neutral" }> = {
  new: { label: "Nueva", tone: "violet" },
  quoted: { label: "Presupuesto preparado", tone: "warning" },
  accepted: { label: "Aceptada", tone: "success" },
  declined: { label: "Descartada", tone: "neutral" },
};

type Filter = "open" | "accepted" | "all";

export default function GruposSection() {
  const { data } = usePro();
  const newOnes = data.groupRequests.filter((g) => g.status === "new").length;
  const people = data.groupRequests.filter((g) => g.status === "accepted").reduce((a, g) => a + g.people, 0);
  const pipeline = data.groupRequests
    .filter((g) => g.status === "quoted" || g.status === "accepted")
    .reduce((a, g) => a + (g.quoteCents ?? g.budgetPerPersonCents) * g.people, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Grupos"
        title="Clases, asociaciones y celebraciones"
        description={
          newOnes
            ? `${newOnes} ${newOnes === 1 ? "grupo espera" : "grupos esperan"} tu presupuesto. Contestar el mismo día multiplica las reservas.`
            : "Delegados y asociaciones te piden presupuesto aquí para cenas, previas y celebraciones."
        }
      />
      <KpiRow>
        <Kpi label="Peticiones nuevas" value={newOnes} emphasis={newOnes > 0} />
        <Kpi label="Personas confirmadas" value={people} />
        <Kpi label="En juego" value={money(pipeline, { round: true })} hint="presupuestos preparados y aceptados" />
        <Kpi label="Peticiones este curso" value={data.groupRequests.length} hint="de clases, clubes y asociaciones" />
      </KpiRow>
      <GroupRequests />
      <Tip title="Temporada alta">
        Noviembre y diciembre (cenas de Navidad de clase) y de abril a junio (graduaciones) concentran casi todos los grupos universitarios. Ten dos o tres menús cerrados preparados antes.
      </Tip>
    </div>
  );
}

/** Lista de peticiones de grupo con su panel de presupuesto. Se usa también en Estudiantes. */
export function GroupRequests({ compact = false }: { compact?: boolean }) {
  const { data, now } = usePro();
  const [filter, setFilter] = React.useState<Filter>("open");
  const [open, setOpen] = React.useState<string | null>(null);
  const list = data.groupRequests
    .filter((g) => (filter === "open" ? g.status === "new" || g.status === "quoted" : filter === "accepted" ? g.status === "accepted" : true))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <Panel
        title={compact ? "Peticiones de grupo" : undefined}
        action={
          <Segmented<Filter>
            size="sm"
            label="Filtrar grupos"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: "Abiertas" },
              { value: "accepted", label: "Aceptadas" },
              { value: "all", label: "Todas" },
            ]}
          />
        }
        flush
      >
        {list.length ? (
          <RowList>
            {list.map((g) => (
              <Row key={g.id} onClick={() => setOpen(g.id)}>
                <span className="inline-flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-bg-secondary leading-none">
                  <span className="font-heading text-sm font-bold tabular">{g.people}</span>
                  <span className="text-[0.6rem] text-text-muted">pers.</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{g.kind}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {g.organization} · {capitalize(dayLabel(g.date))}
                  </span>
                </span>
                <span className="hidden text-right text-xs text-text-muted sm:block">{relative(g.createdAt, now.getTime())}</span>
                <Pill tone={STATUS[g.status].tone}>{STATUS[g.status].label}</Pill>
              </Row>
            ))}
          </RowList>
        ) : (
          <Empty icon={Users} title="No hay grupos aquí" body="Cuando una clase o asociación te pida presupuesto, aparecerá en esta lista." />
        )}
      </Panel>
      <GroupDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}

function GroupDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, update, pending, can } = usePro();
  const toast = useToast();
  const g = data.groupRequests.find((x) => x.id === id) ?? null;
  const [price, setPrice] = React.useState("");
  const [includes, setIncludes] = React.useState("");
  const [deposit, setDeposit] = React.useState("20");

  React.useEffect(() => {
    if (!g) return;
    setPrice(String(((g.quoteCents ?? g.budgetPerPersonCents) / 100).toFixed(0)));
    setIncludes(data.space.vertical === "restaurant" || data.space.vertical === "bar" ? "Entrante para compartir, principal a elegir, postre y bebida" : "");
    setDeposit("20");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!g) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;
  const perPerson = Math.round(Number(price.replace(",", ".")) * 100) || 0;

  const setStatus = async (status: ProGroupRequest["status"], quoteCents?: number) => {
    if (!(await update(`group.${status}`, (d) => ({
      ...d,
      groupRequests: d.groupRequests.map((x) => (x.id === g.id ? { ...x, status, quoteCents: quoteCents ?? x.quoteCents } : x)),
    })))) return;
    if (status === "declined") {
      toast.info("Solicitud descartada");
    } else {
      toast.success("Presupuesto guardado", `${money(perPerson)} por persona, ${money(perPerson * g.people, { round: true })} en total.`);
    }
    onClose();
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={g.kind}
      description={`${g.organization} · ${g.people} personas`}
      footer={
        g.status === "new" || g.status === "quoted" ? (
          <>
            <Button variant="ghost" disabled={pending || !can("group.declined")} onClick={() => setStatus("declined")}>
              No podemos
            </Button>
            <Button
              variant="dark"
              disabled={pending || !can("group.quoted") || !perPerson}
              onClick={() => setStatus("quoted", perPerson)}
            >
              {g.status === "quoted" ? "Actualizar presupuesto" : "Guardar presupuesto"}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl bg-bg-secondary p-4 text-sm">
          <p className="font-semibold">{g.organizer}</p>
          <p className="mt-1.5 text-text-secondary">“{g.message}”</p>
        </div>
        <div className="divide-y divide-border-light rounded-2xl border border-border px-4">
          <Detail label="Cuándo">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-text-muted" />
              {capitalize(dayLabel(g.date))}, {time(g.date)}
            </span>
          </Detail>
          <Detail label="Personas">{g.people}</Detail>
          <Detail label="Presupuesto que indican">{money(g.budgetPerPersonCents)} por persona</Detail>
          <Detail label="Estado">
            <Pill tone={STATUS[g.status].tone}>{STATUS[g.status].label}</Pill>
          </Detail>
        </div>
        {g.status === "new" || g.status === "quoted" ? (
          <>
            <FormField label="Precio por persona (€)" htmlFor="gq-price" hint={perPerson ? `Total: ${money(perPerson * g.people, { round: true })}` : undefined}>
              <input id="gq-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
            </FormField>
            <FormField label="Qué incluye" htmlFor="gq-includes">
              <textarea id="gq-includes" value={includes} onChange={(e) => setIncludes(e.target.value)} className={textareaClass} placeholder="Describe lo que incluye el precio" />
            </FormField>
            <FormField label="Señal para confirmar (%)" htmlFor="gq-deposit" hint="La paga el organizador al aceptar. Protege tu día si el grupo no aparece.">
              <input id="gq-deposit" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} className={inputClass} />
            </FormField>
          </>
        ) : g.status === "accepted" ? (
          <p className="text-sm text-text-muted">Grupo confirmado por {money((g.quoteCents ?? 0) * g.people, { round: true })}. Ya está en tu agenda.</p>
        ) : null}
      </div>
    </Drawer>
  );
}
