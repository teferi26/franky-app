"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArchiveRestore,
  Boxes,
  Download,
  FolderInput,
  HandHelping,
  Plus,
  Undo2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { localId, usePro } from "@/lib/pro/store";
import { addDays, dayLabel, localDate, money, relative } from "@/lib/pro/format";
import { withCommunityOps } from "@/lib/pro/community";
import type {
  CommunityArchiveDoc,
  CommunityItem,
  CommunityItemCategory,
  CommunityMember,
} from "@/lib/pro/community-types";
import {
  DEFAULT_LOAN_DAYS,
  ITEM_CATEGORY_LABEL,
  currentLoan,
  inventoryCsv,
  inventoryDocumentBody,
  inventoryNumbers,
  itemState,
  lendItem,
  loanReminderMessage,
  loansAtRisk,
  restoreItem,
  retireItem,
  returnItem,
  saveItem,
  type ItemState,
} from "@/lib/pro/community-inventory";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { cn } from "@/lib/utils";
import {
  ChoiceChips,
  Detail,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  PageHeader,
  Panel,
  Pill,
  SearchInput,
  Segmented,
  Tip,
  inputClass,
} from "../../kit";
import { downloadCsv } from "./files";
import { WhatsAppButton, centsToInput, parseEuros, useCommunitySave } from "./ui";

/**
 * Material de la asociación: qué hay, dónde se guarda y quién lo tiene.
 * Lo primero que se ve es lo que está fuera, porque es lo que se pierde.
 */

type Filter = "todo" | "en_local" | "fuera" | "baja";

const STATE_PILL: Record<ItemState, { label: string; tone: "neutral" | "violet" | "danger" | "dark" }> = {
  en_local: { label: "En su sitio", tone: "neutral" },
  prestado: { label: "Prestado", tone: "violet" },
  atrasado: { label: "Sin devolver", tone: "danger" },
  baja: { label: "De baja", tone: "dark" },
};

function fullDate(date: string) {
  return dayLabel(`${date.slice(0, 10)}T12:00:00Z`, { weekday: false });
}

export default function CommunityMaterial() {
  const { data, now, demo } = usePro();
  const save = useCommunitySave();
  const today = localDate(now);
  const items = data.communityOps?.inventory ?? [];
  const n = inventoryNumbers(items, today);
  const risk = loansAtRisk(data);

  const [filter, setFilter] = React.useState<Filter>("todo");
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<CommunityItem | "new" | null>(null);

  // Un espacio real todavía sin estas tablas: se explica en vez de romperse.
  if (!demo && !data.communityOps) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader eyebrow="Material" title="Material de la asociación" />
        <Panel>
          <Empty
            icon={Boxes}
            title="Estamos preparando el inventario de tu espacio"
            body="Aquí verás cada cosa de la asociación, dónde se guarda y quién la tiene prestada."
          />
        </Panel>
      </div>
    );
  }

  const out = items
    .filter((i) => !i.retiredAt && currentLoan(i))
    .sort((a, b) => {
      const late = Number(itemState(b, today) === "atrasado") - Number(itemState(a, today) === "atrasado");
      return late || (currentLoan(a)?.due ?? "").localeCompare(currentLoan(b)?.due ?? "");
    });

  const q = query.trim().toLowerCase();
  const list = items
    .filter((i) => {
      const s = itemState(i, today);
      if (filter === "en_local" && s !== "en_local") return false;
      if (filter === "fuera" && s !== "prestado" && s !== "atrasado") return false;
      if (filter === "baja" && s !== "baja") return false;
      if (filter === "todo" && s === "baja") return false;
      if (!q) return true;
      return [i.name, i.location, currentLoan(i)?.holder ?? ""].some((t) => t.toLowerCase().includes(q));
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const giveBack = (item: CommunityItem) => {
    const loan = currentLoan(item);
    void save(
      "community.inventory.return",
      (d) => withCommunityOps(d, (o) => returnItem(o, item.id, new Date().toISOString())),
      { title: `${item.name}: devuelto`, detail: loan ? `Vuelve a ${item.location}. Gracias, ${loan.holder.split(" ")[0]}.` : undefined },
    );
  };

  const exportCsv = () => {
    downloadCsv(inventoryCsv(items, today), `inventario-${data.space.slug}-${today}.csv`);
  };

  const archive = () => {
    const doc: CommunityArchiveDoc = {
      id: localId("d"),
      title: `Inventario a ${fullDate(today)}`,
      kind: "otro",
      at: new Date().toISOString(),
      by: "Secretaría",
      body: inventoryDocumentBody(items, data.space.name, today),
      tag: `inventario:${today}`,
    };
    void save(
      "community.inventory.archive",
      (d) =>
        withCommunityOps(d, (o) => ({
          ...o,
          documents: [doc, ...o.documents.filter((x) => x.tag !== doc.tag)],
        })),
      { title: "Inventario guardado en el archivo", detail: "Lo encuentras en Junta, listo para la asamblea y el relevo." },
    );
  };

  const selected = items.find((i) => i.id === open) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Material"
        title="Material de la asociación"
        description={
          items.length
            ? `${n.items} cosas con un valor de ${money(n.valueCents, { round: true })}. ` +
              (n.lent
                ? `${n.lent} fuera ahora mismo${n.late ? `, ${n.late} sin devolver a tiempo` : ""}.`
                : "Todo está en su sitio.")
            : "Apunta lo que tiene la asociación y sabrás siempre quién tiene el proyector."
        }
        actions={
          <Button variant="dark" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Añadir material
          </Button>
        }
      />

      {items.length ? (
        <>
          <KpiRow>
            <Kpi icon={Boxes} label="Unidades" value={n.units} hint={`${n.items} cosas distintas`} />
            <Kpi icon={Wallet} label="Valor" value={money(n.valueCents, { round: true })} hint="Precio de compra" />
            <Kpi
              icon={HandHelping}
              label="Prestado"
              value={n.lent}
              hint={n.holders.length ? n.holders.map((h) => h.split(" ")[0]).join(", ") : "Nadie tiene nada"}
              onClick={() => setFilter("fuera")}
            />
            <Kpi
              icon={AlertTriangle}
              label="Sin devolver"
              value={n.late}
              hint={n.late ? "Ya tenían que haber vuelto" : "Todo a tiempo"}
              emphasis={n.late > 0}
              onClick={() => setFilter("fuera")}
            />
          </KpiRow>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-4">
              {out.length ? (
                <Panel
                  title="Fuera ahora"
                  description="Quién lo tiene y cuándo vuelve. Lo atrasado, arriba."
                  flush
                >
                  <ul className="divide-y divide-border-light">
                    {out.map((item) => (
                      <OutRow key={item.id} item={item} today={today} onOpen={() => setOpen(item.id)} onReturn={() => giveBack(item)} />
                    ))}
                  </ul>
                </Panel>
              ) : null}

              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <Segmented<Filter>
                  label="Filtrar el material"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "todo", label: "Todo", count: n.items },
                    { value: "en_local", label: "En su sitio" },
                    { value: "fuera", label: "Fuera", count: n.lent || undefined },
                    { value: "baja", label: "Bajas" },
                  ]}
                />
                <SearchInput value={query} onChange={setQuery} placeholder="Buscar material o persona" className="sm:ml-auto sm:w-64" />
              </div>

              {list.length ? (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {list.map((item) => (
                    <li key={item.id}>
                      <ItemCard item={item} today={today} onOpen={() => setOpen(item.id)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Panel>
                  <Empty icon={Boxes} title="Nada con este filtro" body="Prueba con otro filtro o busca por nombre." />
                </Panel>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-5">
              {risk.length ? (
                <Panel title="Antes del relevo" description="Esto está en casa de quien se va. Que vuelva antes del cambio de junta." flush>
                  <ul className="divide-y divide-border-light">
                    {risk.map(({ item, loan, reason }) => (
                      <li key={item.id} className="flex items-center gap-3 px-4 py-3 text-sm sm:px-5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{item.name}</span>
                          <span className="block truncate text-xs text-text-muted">
                            {loan.holder} · {reason}
                          </span>
                        </span>
                        <Button size="sm" variant="outline" onClick={() => giveBack(item)}>
                          Devuelto
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              <Panel title="Inventario para la asamblea" description="Lo pide la ley de asociaciones y lo agradece la próxima junta.">
                <div className="flex flex-col gap-2">
                  <Button variant="outline" onClick={exportCsv} className="justify-start">
                    <Download className="h-4 w-4" /> Descargar en Excel
                  </Button>
                  <Button variant="outline" onClick={archive} className="justify-start">
                    <FolderInput className="h-4 w-4" /> Guardar en el archivo de la junta
                  </Button>
                </div>
              </Panel>

              <Tip title="Préstamo en dos toques">
                Al llevarte algo, tócalo y pon tu nombre. Al volver, «Devuelto». Si pasa la fecha, sale en el Resumen
                con el mensaje de WhatsApp listo.
              </Tip>
            </div>
          </div>
        </>
      ) : (
        <Panel>
          <Empty
            icon={Boxes}
            title="Aún no has apuntado material"
            body="Proyector, altavoz, carpa del stand, sudaderas que sobraron. Apunta dónde se guarda cada cosa y préstala con un toque."
            action={
              <Button variant="dark" onClick={() => setEditing("new")}>
                Añadir material
              </Button>
            }
          />
        </Panel>
      )}

      <ItemDrawer
        item={selected}
        onClose={() => setOpen(null)}
        onEdit={(item) => {
          setOpen(null);
          setEditing(item);
        }}
      />
      <EditItemDrawer editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function OutRow({
  item,
  today,
  onOpen,
  onReturn,
}: {
  item: CommunityItem;
  today: string;
  onOpen: () => void;
  onReturn: () => void;
}) {
  const { data, now } = usePro();
  const loan = currentLoan(item)!;
  const late = itemState(item, today) === "atrasado";
  const member = (data.communityMembers as CommunityMember[]).find((m) => m.id === loan.memberId);
  const href = customerWhatsApp(
    member?.phone,
    loanReminderMessage({ item, loan, spaceName: data.space.name, today }),
  );
  return (
    <li className="flex items-center gap-2 px-4 py-3 sm:px-5">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left focus-visible:outline-none">
        <span className="block truncate text-sm font-semibold">{item.name}</span>
        <span className="block truncate text-xs text-text-muted">
          {loan.holder}, desde {relative(loan.from, now.getTime())}
          {loan.note ? ` · ${loan.note}` : ""}
        </span>
        {loan.due ? (
          <span
            className={cn(
              "mt-0.5 block truncate text-xs font-semibold",
              late ? "text-rose-700 dark:text-rose-300" : "text-text-secondary",
            )}
          >
            {late ? `Tenía que volver el ${fullDate(loan.due)}` : `Vuelve el ${fullDate(loan.due)}`}
          </span>
        ) : null}
      </button>
      {href ? <WhatsAppButton href={href} label={`Escribir a ${loan.holder} por WhatsApp`} /> : null}
      <Button size="sm" variant={late ? "dark" : "outline"} className="h-10" onClick={onReturn}>
        <Undo2 className="h-3.5 w-3.5" /> Devuelto
      </Button>
    </li>
  );
}

function ItemCard({ item, today, onOpen }: { item: CommunityItem; today: string; onOpen: () => void }) {
  const state = itemState(item, today);
  const loan = currentLoan(item);
  const pill = STATE_PILL[state];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex h-full w-full flex-col gap-1.5 rounded-2xl border border-border bg-bg-primary p-4 text-left shadow-card transition-colors hover:border-text-primary/20 focus-visible:border-violet focus-visible:outline-none",
        state === "baja" && "opacity-70",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-[0.72rem] font-semibold uppercase tracking-wider text-text-muted">
            {ITEM_CATEGORY_LABEL[item.category]}
          </span>
          <span className="mt-0.5 block font-heading text-[0.98rem] font-bold leading-snug">{item.name}</span>
        </span>
        <Pill tone={pill.tone}>{pill.label}</Pill>
      </span>
      <span className="text-xs text-text-muted">
        {item.units > 1 ? `${item.units} unidades · ` : ""}
        {loan ? `Lo tiene ${loan.holder}` : state === "baja" ? item.retiredReason ?? "De baja" : item.location}
      </span>
      {item.valueCents ? (
        <span className="mt-auto text-xs font-medium tabular text-text-secondary">
          {money(item.valueCents * item.units, { round: true })}
        </span>
      ) : null}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Ficha de una pieza: prestar, devolver, dar de baja                   */
/* ------------------------------------------------------------------ */

function ItemDrawer({
  item,
  onClose,
  onEdit,
}: {
  item: CommunityItem | null;
  onClose: () => void;
  onEdit: (item: CommunityItem) => void;
}) {
  const { data, now } = usePro();
  const save = useCommunitySave();
  const today = localDate(now);
  const members = (data.communityMembers as CommunityMember[]).filter((m) => !m.leftAt);
  const [holder, setHolder] = React.useState("");
  const [due, setDue] = React.useState(addDays(today, DEFAULT_LOAN_DAYS));
  const [note, setNote] = React.useState("");
  const [retiring, setRetiring] = React.useState(false);
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    setHolder("");
    setDue(addDays(today, DEFAULT_LOAN_DAYS));
    setNote("");
    setRetiring(false);
    setReason("");
  }, [item?.id, today]);

  if (!item) {
    return (
      <Drawer open={false} onOpenChange={(o) => !o && onClose()} title="Material">
        <span />
      </Drawer>
    );
  }
  const loan = currentLoan(item);
  const state = itemState(item, today);
  const past = item.loans.filter((l) => l.returnedAt);

  const lend = async () => {
    const who = holder.trim();
    const member = members.find((m) => m.name.toLowerCase() === who.toLowerCase());
    const ok = await save(
      "community.inventory.lend",
      (d) =>
        withCommunityOps(d, (o) =>
          lendItem(o, item.id, {
            id: localId("ln"),
            holder: member?.name ?? who,
            memberId: member?.id,
            from: new Date().toISOString(),
            due: due || undefined,
            note: note.trim() || undefined,
          }),
        ),
      { title: `${item.name}: prestado`, detail: `Lo tiene ${member?.name ?? who}${due ? ` hasta el ${fullDate(due)}` : ""}.` },
    );
    if (ok) onClose();
  };

  const giveBack = async () => {
    const ok = await save(
      "community.inventory.return",
      (d) => withCommunityOps(d, (o) => returnItem(o, item.id, new Date().toISOString())),
      { title: `${item.name}: devuelto`, detail: `Vuelve a ${item.location}.` },
    );
    if (ok) onClose();
  };

  const retire = async () => {
    const ok = await save(
      "community.inventory.retire",
      (d) => withCommunityOps(d, (o) => retireItem(o, item.id, new Date().toISOString(), reason)),
      { title: `${item.name}: de baja`, detail: "Sigue en el inventario con la fecha y el motivo." },
    );
    if (ok) onClose();
  };

  const restore = () =>
    void save("community.inventory.restore", (d) => withCommunityOps(d, (o) => restoreItem(o, item.id)), {
      title: `${item.name}: recuperado`,
    });

  const footer =
    state === "baja" ? (
      <Button variant="outline" onClick={restore}>
        <ArchiveRestore className="h-4 w-4" /> Volver a darlo de alta
      </Button>
    ) : loan ? (
      <Button variant="dark" onClick={giveBack}>
        <Undo2 className="h-4 w-4" /> Devuelto
      </Button>
    ) : retiring ? (
      <>
        <Button variant="ghost" onClick={() => setRetiring(false)}>
          Cancelar
        </Button>
        <Button variant="destructive" onClick={retire}>
          Dar de baja
        </Button>
      </>
    ) : (
      <Button variant="dark" onClick={lend} disabled={holder.trim().length < 2}>
        <HandHelping className="h-4 w-4" /> Prestar
      </Button>
    );

  return (
    <Drawer
      open={Boolean(item)}
      onOpenChange={(o) => !o && onClose()}
      title={item.name}
      description={`${ITEM_CATEGORY_LABEL[item.category]} · ${item.units} ${item.units === 1 ? "unidad" : "unidades"}`}
      footer={footer}
    >
      <div className="flex flex-col gap-5">
        {loan ? (
          <div
            className={cn(
              "rounded-2xl border p-4",
              state === "atrasado" ? "border-rose-500/30 bg-rose-50 dark:bg-rose-950/30" : "border-border bg-bg-secondary",
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Lo tiene</p>
            <p className="mt-0.5 font-heading text-lg font-bold">{loan.holder}</p>
            <p className="text-sm text-text-secondary">
              Desde el {fullDate(localDate(loan.from))}
              {loan.due ? `, vuelve el ${fullDate(loan.due)}` : ""}
              {loan.note ? `. ${loan.note}.` : "."}
            </p>
          </div>
        ) : null}

        {!loan && state !== "baja" && !retiring ? (
          <div className="flex flex-col gap-3">
            <FormField label="¿Quién se lo lleva?" htmlFor="loan-holder" hint="Escribe el nombre o elige un socio.">
              <input
                id="loan-holder"
                list="loan-members"
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                placeholder="Nombre y apellido"
                className={inputClass}
                autoComplete="off"
              />
              <datalist id="loan-members">
                {members.slice(0, 250).map((m) => (
                  <option key={m.id} value={m.name} />
                ))}
              </datalist>
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Vuelve el" htmlFor="loan-due">
                <input id="loan-due" type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} className={inputClass} />
              </FormField>
              <FormField label="Para qué" htmlFor="loan-note">
                <input
                  id="loan-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Cinefórum del martes"
                  className={inputClass}
                />
              </FormField>
            </div>
          </div>
        ) : null}

        {retiring ? (
          <FormField label="¿Por qué se da de baja?" htmlFor="retire-reason" hint="Queda en el inventario con la fecha.">
            <input
              id="retire-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Roto, perdido, regalado..."
              className={inputClass}
            />
          </FormField>
        ) : null}

        <div className="divide-y divide-border-light rounded-2xl border border-border px-4">
          <Detail label="Se guarda en">{item.location}</Detail>
          {item.valueCents ? (
            <Detail label="Valor">
              {money(item.valueCents)}
              {item.units > 1 ? ` por unidad, ${money(item.valueCents * item.units)} en total` : ""}
            </Detail>
          ) : null}
          {item.acquiredAt ? <Detail label="Desde">{fullDate(item.acquiredAt)}</Detail> : null}
          {item.retiredAt ? (
            <Detail label="Baja">
              {fullDate(localDate(item.retiredAt))}
              {item.retiredReason ? `, ${item.retiredReason.toLowerCase()}` : ""}
            </Detail>
          ) : null}
          {item.note ? <Detail label="Nota">{item.note}</Detail> : null}
        </div>

        {past.length ? (
          <section>
            <p className="text-sm font-semibold">Préstamos anteriores</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {past.slice(0, 6).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-text-secondary">{l.holder}</span>
                  <span className="shrink-0 text-xs text-text-muted tabular">
                    {fullDate(localDate(l.from))} a {fullDate(localDate(l.returnedAt!))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onEdit(item)}>
            Editar
          </Button>
          {!loan && state !== "baja" && !retiring ? (
            <Button size="sm" variant="ghost" onClick={() => setRetiring(true)}>
              Dar de baja
            </Button>
          ) : null}
        </div>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Alta y edición                                                      */
/* ------------------------------------------------------------------ */

const CATEGORY_OPTIONS = (Object.keys(ITEM_CATEGORY_LABEL) as CommunityItemCategory[]).map((value) => ({
  value,
  label: ITEM_CATEGORY_LABEL[value],
}));

function EditItemDrawer({ editing, onClose }: { editing: CommunityItem | "new" | null; onClose: () => void }) {
  const { now } = usePro();
  const save = useCommunitySave();
  const existing = editing && editing !== "new" ? editing : null;
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState<CommunityItemCategory>("imagen");
  const [units, setUnits] = React.useState("1");
  const [value, setValue] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [acquiredAt, setAcquiredAt] = React.useState("");

  React.useEffect(() => {
    if (!editing) return;
    setName(existing?.name ?? "");
    setCategory(existing?.category ?? "imagen");
    setUnits(String(existing?.units ?? 1));
    setValue(centsToInput(existing?.valueCents));
    setLocation(existing?.location ?? "");
    setAcquiredAt(existing?.acquiredAt ?? localDate(now));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const count = Math.round(Number(units));
  const cents = parseEuros(value);
  const valid = name.trim().length > 1 && location.trim().length > 1 && count >= 1 && (value === "" || cents !== null);

  const submit = async () => {
    const item: CommunityItem = {
      ...(existing ?? { id: localId("it"), loans: [] }),
      name,
      category,
      units: count,
      valueCents: cents ?? undefined,
      location,
      acquiredAt: acquiredAt || undefined,
    };
    const ok = await save("community.inventory.save", (d) => withCommunityOps(d, (o) => saveItem(o, item)), {
      title: existing ? "Material actualizado" : "Material añadido",
      detail: `${item.name.trim()}, en ${item.location.trim()}.`,
    });
    if (ok) onClose();
  };

  return (
    <Drawer
      open={Boolean(editing)}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Editar material" : "Añadir material"}
      description="Lo que tiene la asociación y dónde se guarda."
      footer={
        <Button variant="dark" onClick={submit} disabled={!valid}>
          {existing ? "Guardar" : "Añadir"}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Qué es" htmlFor="item-name">
          <input
            id="item-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Proyector, altavoz, carpa..."
            className={inputClass}
          />
        </FormField>
        <FormField label="Tipo">
          <ChoiceChips options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Unidades" htmlFor="item-units">
            <input
              id="item-units"
              inputMode="numeric"
              value={units}
              onChange={(e) => setUnits(e.target.value.replace(/\D/g, ""))}
              className={inputClass}
            />
          </FormField>
          <FormField label="Valor por unidad" htmlFor="item-value" hint="En euros, lo que costó.">
            <input
              id="item-value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              aria-invalid={value !== "" && cents === null}
              className={inputClass}
            />
          </FormField>
        </div>
        <FormField label="Dónde se guarda" htmlFor="item-location">
          <input
            id="item-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Local, armario, taquilla..."
            className={inputClass}
          />
        </FormField>
        <FormField label="Desde cuándo lo tenéis" htmlFor="item-date">
          <input
            id="item-date"
            type="date"
            value={acquiredAt}
            onChange={(e) => setAcquiredAt(e.target.value)}
            className={inputClass}
          />
        </FormField>
      </div>
    </Drawer>
  );
}
