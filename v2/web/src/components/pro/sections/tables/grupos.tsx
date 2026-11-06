"use client";

import * as React from "react";
import { ChefHat, Plus, Trash2, Users, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProBooking, ProGroupRequest } from "@/lib/pro/types";
import type {
  ProGroupChoice,
  ProGroupDeal,
  ProGroupMenu,
} from "@/lib/pro/tables-types";
import {
  GROUP_STAGE_LABEL,
  choiceTally,
  dealFor,
  groupQuoteMessage,
} from "@/lib/pro/tables-ops";
import {
  addDays,
  capitalize,
  dayLabel,
  localDate,
  money,
  plural,
  time,
} from "@/lib/pro/format";
import {
  ChoiceChips,
  Detail,
  Drawer,
  Empty,
  FormField,
  IconButton,
  Kpi,
  KpiRow,
  PageHeader,
  Panel,
  Pill,
  Row,
  RowList,
  Segmented,
  Tip,
  inputClass,
} from "../../kit";
import CommonGrupos from "../common/grupos";
import { OpsMissing, Stepper, WhatsAppButton, eurosText, parseEuros, useTablesOps } from "./ops-kit";

type Tab = "peticiones" | "menus";
type Filter = "open" | "confirmed" | "all";

const REQUEST_LABEL: Record<ProGroupRequest["status"], string> = {
  new: "Nueva",
  quoted: "Presupuesto enviado",
  accepted: "Aceptada",
  declined: "Descartada",
};

/** Etapa visible: la del trato si existe; si no, la de la petición. */
function stageOf(g: ProGroupRequest, deal?: ProGroupDeal): { label: string; tone: "violet" | "warning" | "success" | "neutral" | "info" } {
  if (g.status === "declined") return { label: "Descartada", tone: "neutral" };
  if (deal) {
    if (deal.stage === "served") return { label: GROUP_STAGE_LABEL.served, tone: "neutral" };
    if (deal.stage === "closed") return { label: GROUP_STAGE_LABEL.closed, tone: "success" };
    if (deal.stage === "deposit") return { label: GROUP_STAGE_LABEL.deposit, tone: "success" };
    return { label: GROUP_STAGE_LABEL.quoted, tone: "warning" };
  }
  return { label: REQUEST_LABEL[g.status], tone: g.status === "new" ? "violet" : g.status === "accepted" ? "success" : "warning" };
}

export default function TablesGrupos() {
  const { ops } = useTablesOps();
  // Sin herramientas de hostelería, la pantalla común de grupos sigue sirviendo.
  if (!ops) return <CommonGrupos />;
  return <HospitalityGroups />;
}

function HospitalityGroups() {
  const { data } = usePro();
  const { ops } = useTablesOps();
  const [tab, setTab] = React.useState<Tab>("peticiones");
  if (!ops) return <OpsMissing icon={Users} title="Sin grupos todavía" />;
  const fresh = data.groupRequests.filter((g) => g.status === "new");
  const confirmed = data.groupRequests.filter((g) => g.status === "accepted");
  const people = confirmed.reduce((a, g) => a + (dealFor(ops, g.id)?.finalPeople ?? g.people), 0);
  const deposits = ops.groupDeals.filter((d) => d.depositPaidAt).reduce((a, d) => a + d.depositCents, 0);
  const pipeline = data.groupRequests
    .filter((g) => g.status === "quoted" || g.status === "accepted")
    .reduce((a, g) => a + (dealFor(ops, g.id)?.perPersonCents ?? g.quoteCents ?? g.budgetPerPersonCents) * g.people, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Grupos"
        title="Clases, asociaciones y celebraciones"
        description={
          fresh.length
            ? `${plural(fresh.length, "grupo espera", "grupos esperan")} tu presupuesto. Con un menú cerrado guardado, respondes en dos toques.`
            : `${plural(confirmed.length, "grupo confirmado", "grupos confirmados")} con ${plural(people, "persona", "personas")}.`
        }
      >
        <Segmented
          label="Apartado"
          value={tab}
          onChange={setTab}
          options={[
            { value: "peticiones", label: "Peticiones", count: fresh.length || undefined },
            { value: "menus", label: "Menús cerrados", count: ops.groupMenus.length },
          ]}
        />
      </PageHeader>
      <KpiRow>
        <Kpi label="Por responder" value={fresh.length} emphasis={fresh.length > 0} />
        <Kpi label="Personas confirmadas" value={people} />
        <Kpi label="Señales cobradas" value={money(deposits, { round: true })} />
        <Kpi label="En juego" value={money(pipeline, { round: true })} hint="presupuestos enviados y aceptados" />
      </KpiRow>
      {tab === "peticiones" ? <Requests /> : <Menus />}
      <Tip title="Temporada alta">
        Noviembre y diciembre (cenas de Navidad de clase) y de abril a junio (graduaciones). Ten tus menús cerrados listos unas seis semanas antes.
      </Tip>
    </div>
  );
}

function Requests() {
  const { data } = usePro();
  const { ops } = useTablesOps();
  const [filter, setFilter] = React.useState<Filter>("open");
  const [open, setOpen] = React.useState<string | null>(null);
  if (!ops) return null;
  const list = data.groupRequests
    .filter((g) => {
      const deal = dealFor(ops, g.id);
      if (filter === "open") return g.status === "new" || g.status === "quoted";
      if (filter === "confirmed") return g.status === "accepted" && deal?.stage !== "served";
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <Panel
        action={
          <Segmented<Filter>
            size="sm"
            label="Filtrar grupos"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: "Abiertas" },
              { value: "confirmed", label: "Confirmadas" },
              { value: "all", label: "Todas" },
            ]}
          />
        }
        flush
      >
        {list.length ? (
          <RowList>
            {list.map((g) => {
              const deal = dealFor(ops, g.id);
              const stage = stageOf(g, deal);
              const menu = ops.groupMenus.find((m) => m.id === deal?.menuId);
              const tally = menu && deal ? choiceTally(menu, deal) : null;
              return (
                <Row key={g.id} onClick={() => setOpen(g.id)}>
                  <span className="inline-flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-bg-secondary leading-none">
                    <span className="font-heading text-sm font-bold tabular">{deal?.finalPeople ?? g.people}</span>
                    <span className="text-[0.6rem] text-text-muted">pers.</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{g.kind}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {g.organization} · {capitalize(dayLabel(g.date))}
                      {tally && tally.answered ? ` · ${tally.answered} han elegido plato` : ""}
                    </span>
                  </span>
                  <Pill tone={stage.tone}>{stage.label}</Pill>
                </Row>
              );
            })}
          </RowList>
        ) : (
          <Empty icon={Users} title="No hay grupos aquí" body="Cuando una clase, una delegación o una asociación te pida presupuesto desde Franky, aparecerá en esta lista." />
        )}
      </Panel>
      <GroupDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Detalle de un grupo                                                 */
/* ------------------------------------------------------------------ */

function GroupDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, now, vertical, update: storeUpdate } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  const g = data.groupRequests.find((x) => x.id === id) ?? null;
  const deal = g && ops ? dealFor(ops, g.id) : undefined;
  const [menuId, setMenuId] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [depositPct, setDepositPct] = React.useState("20");
  const [closeDays, setCloseDays] = React.useState("2");
  const [finalPeople, setFinalPeople] = React.useState(0);
  const [method, setMethod] = React.useState<NonNullable<ProGroupDeal["depositMethod"]>>("bizum");

  React.useEffect(() => {
    if (!g || !ops) return;
    const suggested = deal?.menuId ?? ops.groupMenus.find((m) => g.kind.toLowerCase().includes(m.occasion.toLowerCase()))?.id ?? ops.groupMenus[0]?.id ?? "";
    const menu = ops.groupMenus.find((m) => m.id === suggested);
    setMenuId(suggested);
    setPrice(eurosText(deal?.perPersonCents ?? menu?.priceCents ?? g.quoteCents ?? g.budgetPerPersonCents));
    setDepositPct(String(menu?.depositPct ?? 20));
    setCloseDays("2");
    setFinalPeople(deal?.finalPeople ?? g.people);
    setMethod("bizum");
    // Solo al abrir otro grupo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!g || !ops) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;
  const menu = ops.groupMenus.find((m) => m.id === menuId);
  const perPerson = parseEuros(price) ?? 0;
  const deposit = Math.round((perPerson * g.people * Number(depositPct || 0)) / 100 / 100) * 100;
  const closeBy = addDays(localDate(g.date), -Number(closeDays || 0));
  const stage = stageOf(g, deal);
  const dateLabel = `${dayLabel(g.date, { weekday: true })} a las ${time(g.date)}`;
  const message = groupQuoteMessage({
    organizer: g.organizer,
    kind: g.kind,
    people: g.people,
    dateLabel,
    menu,
    perPersonCents: perPerson,
    depositCents: deposit,
    closeByLabel: dayLabel(`${closeBy}T12:00:00Z`, { weekday: true }),
    spaceName: data.space.name,
  });

  // Guarda el trato y, si hace falta, el estado de la petición y la reserva.
  async function saveDeal(label: string, next: ProGroupDeal, status?: ProGroupRequest["status"], booking?: ProBooking) {
    const ok = await save(label, (o) => ({
      ...o,
      groupDeals: [...o.groupDeals.filter((d) => d.requestId !== next.requestId), next],
    }));
    if (!ok || (!status && !booking)) return ok;
    return storeRequest(status, booking);
  }

  async function storeRequest(status?: ProGroupRequest["status"], booking?: ProBooking) {
    const requestId = g?.id;
    return storeUpdate(`group.${status ?? "booking"}`, (d) => ({
      ...d,
      groupRequests: status
        ? d.groupRequests.map((x) => (x.id === requestId ? { ...x, status, quoteCents: perPerson || x.quoteCents } : x))
        : d.groupRequests,
      bookings: booking ? [...d.bookings, booking] : d.bookings,
    }));
  }

  const sendQuote = async () => {
    const next: ProGroupDeal = {
      requestId: g.id,
      menuId: menu?.id,
      perPersonCents: perPerson,
      depositCents: deposit,
      closeBy,
      finalPeople: g.people,
      stage: "quoted",
      sentAt: now.toISOString(),
      choices: deal?.choices ?? [],
    };
    if (await saveDeal("group.quote", next, "quoted")) toast.success("Presupuesto guardado", `${money(perPerson)} por persona. Envíalo en WhatsApp.`);
  };

  const depositReceived = async () => {
    if (!deal) return;
    // Al aceptar, la reserva entra sola en el libro con la mesa más grande libre.
    const biggest = [...data.tables].filter((t) => t.shape !== "bar").sort((a, b) => b.seats - a.seats)[0];
    const booking: ProBooking = {
      id: localId("rg"),
      kind: "table",
      clientName: `${g.kind} (${g.organizer})`,
      resourceId: biggest?.id,
      start: g.date,
      end: new Date(Date.parse(g.date) + (vertical.id === "restaurant" ? 150 : 120) * 60_000).toISOString(),
      partySize: deal.finalPeople ?? g.people,
      status: "confirmed",
      priceCents: deal.perPersonCents * (deal.finalPeople ?? g.people),
      paidCents: deal.depositCents,
      source: "grupo",
      note: `${menu ? `Menú ${menu.name}. ` : ""}Señal de ${money(deal.depositCents)} cobrada.`,
      student: true,
    };
    const alreadyBooked = data.bookings.some((b) => b.source === "grupo" && b.start === g.date && b.clientName.includes(g.organizer));
    const next: ProGroupDeal = { ...deal, stage: "deposit", depositPaidAt: now.toISOString(), depositMethod: method };
    if (await saveDeal("group.deposit", next, "accepted", alreadyBooked ? undefined : booking))
      toast.success("Señal recibida", "El grupo ya está en tu libro de reservas.");
  };

  const closeNumber = async () => {
    if (!deal) return;
    if (await saveDeal("group.close", { ...deal, stage: "closed", finalPeople }))
      toast.success("Número cerrado", `${finalPeople} personas. Cocina ya lo ve en Hoy.`);
  };

  const served = async () => {
    if (!deal) return;
    if (await saveDeal("group.served", { ...deal, stage: "served" })) {
      toast.success("Grupo servido");
      onClose();
    }
  };

  const decline = async () => {
    if (await storeRequest("declined")) {
      toast.info("Petición descartada");
      onClose();
    }
  };

  const quoting = !deal || deal.stage === "quoted";

  return (
    <Drawer
      open
      wide
      onOpenChange={(v) => !v && onClose()}
      title={g.kind}
      description={`${g.organization} · ${plural(g.people, "persona", "personas")} · ${capitalize(dateLabel)}`}
      footer={
        g.status === "declined" ? undefined : quoting ? (
          <>
            {g.status === "new" ? <Button variant="ghost" onClick={decline}>No podemos</Button> : null}
            {deal ? (
              <Button variant="outline" onClick={depositReceived}>Señal recibida</Button>
            ) : null}
            <WhatsAppButton share variant="dark" size="default" label={deal ? "Reenviar" : "Enviar presupuesto"} message={message} onOpen={() => void sendQuote()} />
          </>
        ) : deal?.stage === "deposit" ? (
          <Button variant="dark" onClick={closeNumber}>Cerrar número: {finalPeople}</Button>
        ) : deal?.stage === "closed" ? (
          <Button variant="dark" onClick={served}>Marcar como servido</Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl bg-bg-secondary p-4 text-sm">
          <p className="flex items-center justify-between gap-2 font-semibold">
            {g.organizer}
            <Pill tone={stage.tone}>{stage.label}</Pill>
          </p>
          <p className="mt-1.5 text-text-secondary">“{g.message}”</p>
          <p className="mt-2 text-xs text-text-muted">Presupuesto que indican: {money(g.budgetPerPersonCents)} por persona</p>
        </div>

        {quoting ? (
          <>
            <FormField label="Menú cerrado">
              <ChoiceChips
                value={menuId}
                onChange={(v) => {
                  setMenuId(v);
                  const m = ops.groupMenus.find((x) => x.id === v);
                  if (m) {
                    setPrice(eurosText(m.priceCents));
                    setDepositPct(String(m.depositPct));
                  }
                }}
                options={[
                  ...ops.groupMenus.map((m) => ({ value: m.id, label: m.name, hint: money(m.priceCents) })),
                  { value: "", label: "Sin menú", hint: "precio libre" },
                ]}
              />
            </FormField>
            {menu ? <MenuPreview menu={menu} /> : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="Precio por persona (€)" htmlFor="gd-price" hint={perPerson ? `Total ${money(perPerson * g.people, { round: true })}` : undefined}>
                <input id="gd-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
              </FormField>
              <FormField label="Señal (%)" htmlFor="gd-dep" hint={deposit ? `${money(deposit, { round: true })}` : "Sin señal"}>
                <input id="gd-dep" inputMode="numeric" value={depositPct} onChange={(e) => setDepositPct(e.target.value.replace(/\D/g, ""))} className={inputClass} />
              </FormField>
              <FormField label="Cerrar el número" htmlFor="gd-close" hint={`${plural(Number(closeDays || 0), "día", "días")} antes`}>
                <input id="gd-close" inputMode="numeric" value={closeDays} onChange={(e) => setCloseDays(e.target.value.replace(/\D/g, ""))} className={inputClass} />
              </FormField>
            </div>
            {deal ? (
              <FormField label="Cómo han pagado la señal">
                <ChoiceChips value={method} onChange={setMethod} options={[{ value: "bizum", label: "Bizum" }, { value: "transferencia", label: "Transferencia" }, { value: "efectivo", label: "Efectivo" }]} />
              </FormField>
            ) : null}
            <details className="rounded-2xl border border-border p-4 text-sm">
              <summary className="cursor-pointer font-semibold">Mensaje que se envía</summary>
              <p className="mt-2 whitespace-pre-line text-text-secondary">{message}</p>
            </details>
          </>
        ) : deal ? (
          <>
            <div className="divide-y divide-border-light rounded-2xl border border-border px-4">
              <Detail label="Menú">{menu?.name ?? "Precio libre"}</Detail>
              <Detail label="Precio">{money(deal.perPersonCents)} por persona</Detail>
              <Detail label="Señal">
                {money(deal.depositCents)} {deal.depositPaidAt ? `cobrada (${deal.depositMethod})` : "pendiente"}
              </Detail>
              {deal.closeBy ? <Detail label="Número cerrado el">{dayLabel(`${deal.closeBy}T12:00:00Z`)}</Detail> : null}
            </div>
            {deal.stage === "deposit" ? (
              <FormField label="Personas que vienen al final">
                <Stepper label="Personas finales" value={finalPeople} onChange={setFinalPeople} min={1} max={200} />
              </FormField>
            ) : null}
          </>
        ) : null}

        {deal && menu && deal.stage !== "quoted" ? <ChoicesPanel deal={deal} menu={menu} request={g} /> : null}
      </div>
    </Drawer>
  );
}

function MenuPreview({ menu }: { menu: ProGroupMenu }) {
  return (
    <div className="rounded-2xl border border-border p-4 text-sm">
      {menu.courses.map((c) => (
        <p key={c.label} className="flex gap-2 py-0.5">
          <span className="w-36 shrink-0 font-semibold">{c.label}</span>
          <span className="min-w-0 text-text-secondary">{c.options.join(" o ")}</span>
        </p>
      ))}
      {menu.includes ? <p className="mt-1 text-xs text-text-muted">Incluye {menu.includes.toLowerCase()}</p> : null}
    </div>
  );
}

/** Quién ha elegido qué: se apunta a mano o con lo que pasa el delegado. */
function ChoicesPanel({ deal, menu, request }: { deal: ProGroupDeal; menu: ProGroupMenu; request: ProGroupRequest }) {
  const { data } = usePro();
  const { save } = useTablesOps();
  const [name, setName] = React.useState("");
  const [dishes, setDishes] = React.useState<string[]>(menu.courses.map((c) => c.options[0] ?? ""));
  const [allergies, setAllergies] = React.useState("");
  const tally = choiceTally(menu, { ...deal, finalPeople: deal.finalPeople ?? request.people });
  const ask = `Hola ${request.organizer.split(" ")[0]}, para tenerlo todo listo en ${data.space.name}, ¿nos pasas qué elige cada uno?\n${menu.courses
    .filter((c) => c.options.length > 1)
    .map((c) => `${c.label}: ${c.options.join(" o ")}`)
    .join("\n")}\nY avísanos de cualquier alergia. ¡Gracias!`;

  const add = async () => {
    const choice: ProGroupChoice = { id: localId("ch"), name: name.trim(), dishes, allergies: allergies.trim() || undefined };
    if (!(await save("group.choice", (o) => ({ ...o, groupDeals: o.groupDeals.map((d) => (d.requestId === deal.requestId ? { ...d, choices: [...d.choices, choice] } : d)) })))) return;
    setName("");
    setAllergies("");
  };
  const remove = (id: string) =>
    save("group.choice.remove", (o) => ({ ...o, groupDeals: o.groupDeals.map((d) => (d.requestId === deal.requestId ? { ...d, choices: d.choices.filter((c) => c.id !== id) } : d)) }));

  return (
    <Panel
      title="Para cocina"
      description={`${tally.answered} de ${deal.finalPeople ?? request.people} han elegido${tally.missing ? `, faltan ${tally.missing}` : ""}`}
      action={<WhatsAppButton share label="Pedir elección" message={ask} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {tally.courses
          .filter((c) => c.counts.length > 1)
          .map((c) => (
            <div key={c.label} className="rounded-2xl bg-bg-secondary p-3 text-sm">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-text-muted">
                <ChefHat className="h-3.5 w-3.5" strokeWidth={1.9} /> {c.label}
              </p>
              <ul className="mt-1 space-y-0.5">
                {c.counts.map((x) => (
                  <li key={x.dish} className="flex justify-between gap-2">
                    <span className="truncate">{x.dish}</span>
                    <span className="font-heading font-bold tabular">{x.n}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
      {tally.allergies.length ? (
        <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold">{plural(tally.allergies.length, "alergia o dieta", "alergias o dietas")}</p>
          <p className="mt-0.5">{tally.allergies.map((a) => `${a.name} (${a.allergies.toLowerCase()})`).join(", ")}</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 border-t border-border-light pt-4">
        <p className="text-sm font-semibold">Apuntar una elección</p>
        <input aria-label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className={inputClass} />
        {menu.courses.map((c, i) =>
          c.options.length > 1 ? (
            <select
              key={c.label}
              aria-label={c.label}
              value={dishes[i]}
              onChange={(e) => setDishes((prev) => prev.map((d, j) => (j === i ? e.target.value : d)))}
              className={inputClass}
            >
              {c.options.map((o) => (
                <option key={o} value={o}>{c.label}: {o}</option>
              ))}
            </select>
          ) : null,
        )}
        <input aria-label="Alergias" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Alergias o dieta (opcional)" className={inputClass} />
        <Button variant="outline" className="h-10" disabled={name.trim().length < 2} onClick={add}>
          <Plus className="h-4 w-4" /> Añadir
        </Button>
      </div>

      {deal.choices.length ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold">Ver la lista ({deal.choices.length})</summary>
          <ul className="mt-2 divide-y divide-border-light">
            {deal.choices.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-text-muted"> · {c.dishes.filter((_, i) => menu.courses[i]?.options.length > 1).join(", ")}</span>
                  {c.allergies ? <span className="text-amber-700 dark:text-amber-300"> · {c.allergies}</span> : null}
                </span>
                <IconButton label={`Quitar a ${c.name}`} icon={Trash2} onClick={() => remove(c.id)} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Menús cerrados                                                      */
/* ------------------------------------------------------------------ */

function Menus() {
  const { ops } = useTablesOps();
  const [editing, setEditing] = React.useState<ProGroupMenu | "new" | null>(null);
  if (!ops) return null;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="dark" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Nuevo menú cerrado
        </Button>
      </div>
      {ops.groupMenus.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ops.groupMenus.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setEditing(m)}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-bg-primary p-4 text-left shadow-card transition-colors hover:border-text-primary/20"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-heading text-base font-bold">{m.name}</span>
                <span className="font-heading text-base font-bold tabular">{money(m.priceCents)}</span>
              </span>
              <span className="text-xs text-text-muted">
                {m.occasion} · desde {m.minPeople} personas · {m.depositPct ? `señal ${m.depositPct} %` : "sin señal"}
              </span>
              <MenuPreview menu={m} />
            </button>
          ))}
        </div>
      ) : (
        <Panel>
          <Empty icon={UtensilsCrossed} title="Sin menús cerrados" body="Prepara dos o tres (previa, cena de clase, graduación) y responder a un grupo será cuestión de segundos." />
        </Panel>
      )}
      <MenuDrawer menu={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function MenuDrawer({ menu, onClose }: { menu: ProGroupMenu | "new" | null; onClose: () => void }) {
  const { save } = useTablesOps();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [occasion, setOccasion] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [courses, setCourses] = React.useState<{ label: string; options: string }[]>([]);
  const [includes, setIncludes] = React.useState("");
  const [minPeople, setMinPeople] = React.useState(10);
  const [depositPct, setDepositPct] = React.useState(20);
  React.useEffect(() => {
    if (!menu) return;
    const m = menu === "new" ? null : menu;
    setName(m?.name ?? "");
    setOccasion(m?.occasion ?? "Cena de clase");
    setPrice(m ? eurosText(m.priceCents) : "");
    setCourses(m ? m.courses.map((c) => ({ label: c.label, options: c.options.join(", ") })) : [{ label: "Entrante", options: "" }, { label: "Principal", options: "" }, { label: "Postre", options: "" }]);
    setIncludes(m?.includes ?? "Pan, bebida y café");
    setMinPeople(m?.minPeople ?? 10);
    setDepositPct(m?.depositPct ?? 20);
  }, [menu]);
  if (!menu) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;
  const cents = parseEuros(price);
  const valid = name.trim().length > 2 && cents !== null && courses.some((c) => c.options.trim());

  const submit = async () => {
    const next: ProGroupMenu = {
      id: menu === "new" ? localId("gm") : menu.id,
      name: name.trim(),
      occasion: occasion.trim() || name.trim(),
      priceCents: cents ?? 0,
      courses: courses
        .filter((c) => c.options.trim())
        .map((c) => ({ label: c.label.trim() || "Plato", options: c.options.split(",").map((o) => o.trim()).filter(Boolean) })),
      includes: includes.trim(),
      minPeople,
      depositPct,
    };
    if (!(await save("group.menu", (o) => ({ ...o, groupMenus: menu === "new" ? [...o.groupMenus, next] : o.groupMenus.map((m) => (m.id === next.id ? next : m)) })))) return;
    toast.success("Menú guardado", next.name);
    onClose();
  };
  const remove = async () => {
    if (menu === "new") return;
    if (await save("group.menu.remove", (o) => ({ ...o, groupMenus: o.groupMenus.filter((m) => m.id !== menu.id) }))) onClose();
  };

  return (
    <Drawer
      open
      wide
      onOpenChange={(v) => !v && onClose()}
      title={menu === "new" ? "Nuevo menú cerrado" : menu.name}
      footer={
        <>
          {menu !== "new" ? <IconButton label="Borrar menú" icon={Trash2} onClick={remove} className="mr-auto h-10 w-10" /> : null}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" disabled={!valid} onClick={submit}>Guardar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <FormField label="Nombre" htmlFor="gm-name">
            <input id="gm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Menú graduación" className={inputClass} />
          </FormField>
          <FormField label="Precio (€)" htmlFor="gm-price">
            <input id="gm-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <FormField label="Para qué ocasión" htmlFor="gm-occ">
          <input id="gm-occ" value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="Previa, cumpleaños, partido..." className={inputClass} />
        </FormField>
        <FormField label="Platos" hint="Separa las opciones con comas: el grupo elige una de cada.">
          <div className="flex flex-col gap-2">
            {courses.map((c, i) => (
              <div key={i} className="grid grid-cols-[8rem_1fr_auto] gap-2">
                <input aria-label="Curso" value={c.label} onChange={(e) => setCourses((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={inputClass} />
                <input aria-label="Opciones" value={c.options} onChange={(e) => setCourses((prev) => prev.map((x, j) => (j === i ? { ...x, options: e.target.value } : x)))} placeholder="Opción 1, opción 2" className={inputClass} />
                <IconButton label="Quitar curso" icon={Trash2} onClick={() => setCourses((prev) => prev.filter((_, j) => j !== i))} className="h-10 w-10" />
              </div>
            ))}
            <Button variant="ghost" className="h-10 self-start" onClick={() => setCourses((prev) => [...prev, { label: "", options: "" }])}>
              <Plus className="h-4 w-4" /> Curso
            </Button>
          </div>
        </FormField>
        <FormField label="Incluye" htmlFor="gm-inc">
          <input id="gm-inc" value={includes} onChange={(e) => setIncludes(e.target.value)} className={inputClass} />
        </FormField>
        <div className="flex flex-wrap gap-6">
          <FormField label="Desde (personas)">
            <Stepper label="Mínimo de personas" value={minPeople} onChange={setMinPeople} min={1} />
          </FormField>
          <FormField label="Señal (%)">
            <Stepper label="Señal" value={depositPct} onChange={setDepositPct} min={0} max={100} step={5} />
          </FormField>
        </div>
      </div>
    </Drawer>
  );
}

