"use client";

import * as React from "react";
import {
  Coins,
  Pencil,
  Plus,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProBono, ProBonoTemplate } from "@/lib/pro/tables-types";
import {
  bonoRemaining,
  bonoSummary,
  consumeBono,
} from "@/lib/pro/tables-ops";
import {
  bonoHistory,
  bonoNudgeMessage,
  bonoSaving,
  bonoUnitCents,
  bonoUsageByMember,
  bonosByState,
  bonosToNudge,
  sellBono,
} from "@/lib/pro/tables-day";
import { localDate, money, plural, relative, shortDay, time } from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  Meter,
  PageHeader,
  Panel,
  Pill,
  RowList,
  Segmented,
  Tip,
  inputClass,
} from "../../kit";
import {
  OpsMissing,
  Stepper,
  WhatsAppButton,
  eurosText,
  parseEuros,
  useTablesOps,
} from "./ops-kit";

/**
 * Bonos prepago de cafetería y bar: diez cafés o diez cañas por adelantado.
 * Se cobran en el TPV; aquí se vende, se descuenta cada uso y se ve lo que
 * ya está cobrado y queda por servir. Un bono puede ser de un grupo de
 * estudio: lo gastan varios y queda apuntado quién.
 */

export default function TablesBonos() {
  const { ops } = useTablesOps();
  if (!ops) return <OpsMissing icon={Ticket} title="Todavía no vendes bonos" />;
  return <BonosView />;
}

type Tab = "live" | "spent";

function BonosView() {
  const { data, now, vertical } = usePro();
  const { ops } = useTablesOps();
  const [tab, setTab] = React.useState<Tab>("live");
  const [selling, setSelling] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [template, setTemplate] = React.useState<ProBonoTemplate | "new" | null>(null);
  if (!ops) return null;
  const today = localDate(now);
  const summary = bonoSummary(ops, today);
  const { live, spent } = bonosByState(ops);
  const list = tab === "live" ? live : spent;
  const nudge = bonosToNudge(ops, now);
  const templates = ops.bonoTemplates;
  const drink = vertical.id === "bar" ? "cañas" : "cafés";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Bonos"
        title="Bonos prepago"
        description={
          summary.activeBonos
            ? `${plural(summary.activeBonos, "bono vivo", "bonos vivos")} con ${plural(summary.pendingUses, "uso", "usos")} por servir. Ya tienes cobrados ${money(summary.pendingValueCents, { round: true })} de lo que te van a tomar.`
            : `Vende ${drink} por adelantado: cobras hoy lo que te toman en el mes.`
        }
        actions={
          <Button
            variant="dark"
            disabled={!templates.some((t) => t.active)}
            onClick={() => setSelling(true)}
          >
            <Plus className="h-4 w-4" /> Vender bono
          </Button>
        }
      />

      <KpiRow>
        <Kpi icon={Ticket} label="Bonos vivos" value={summary.activeBonos} hint={`${spent.length} ya gastados`} />
        <Kpi icon={Coins} label="Usos por servir" value={summary.pendingUses} hint={`${summary.usedToday} servidos hoy`} />
        <Kpi
          icon={Wallet}
          label="Cobrado por adelantado"
          value={money(summary.pendingValueCents, { round: true })}
          hint="lo que queda por servir"
          emphasis
        />
        <Kpi
          label="Vendidos hoy"
          value={summary.soldToday}
          hint={summary.cashTodayCents ? money(summary.cashTodayCents) : "ninguno todavía"}
        />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-3">
          <Segmented
            size="sm"
            label="Estado"
            value={tab}
            onChange={setTab}
            options={[
              { value: "live", label: "Vivos", count: live.length },
              { value: "spent", label: "Gastados", count: spent.length },
            ]}
          />
          <Panel flush>
            {list.length ? (
              <RowList>
                {list.map((b) => (
                  <BonoRow key={b.id} bono={b} onOpen={() => setOpenId(b.id)} />
                ))}
              </RowList>
            ) : (
              <Empty
                icon={Ticket}
                title={tab === "live" ? "Ningún bono por gastar" : "Aún no se ha gastado ninguno"}
                body={
                  tab === "live"
                    ? `Ofrécelo al habitual que viene cada día: con diez ${drink} pagados, no se va a la competencia.`
                    : "Aquí verás los bonos terminados, para ofrecer otro a quien lo acabe."
                }
                action={
                  tab === "live" && templates.some((t) => t.active) ? (
                    <Button variant="dark" onClick={() => setSelling(true)}>
                      Vender el primero
                    </Button>
                  ) : null
                }
              />
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title="Tus bonos"
            description="Lo que vendes en la barra y en tu ficha de Franky."
            action={
              <Button size="sm" variant="outline" className="h-9" onClick={() => setTemplate("new")}>
                <Plus className="h-3.5 w-3.5" /> Nuevo
              </Button>
            }
            flush
          >
            {templates.length ? (
              <RowList>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplate(t)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary sm:px-5",
                      !t.active && "opacity-60",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <span className="truncate">{t.name}</span>
                        {!t.active ? <Pill>Pausado</Pill> : null}
                      </span>
                      <span className="block text-xs text-text-muted">
                        {t.uses} × {t.itemName.toLowerCase()} · {money(bonoUnitCents(t))} cada uno
                        {bonoSaving(t) ? ` · ahorra ${money(bonoSaving(t))}` : ""}
                      </span>
                    </span>
                    <span className="font-heading text-base font-bold tabular">{money(t.priceCents)}</span>
                    <Pencil className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.9} />
                  </button>
                ))}
              </RowList>
            ) : (
              <Empty
                icon={Ticket}
                title="Crea tu primer bono"
                body={`Por ejemplo: 10 ${drink} por el precio de 8,5.`}
                action={
                  <Button variant="dark" onClick={() => setTemplate("new")}>
                    Crear bono
                  </Button>
                }
              />
            )}
          </Panel>

          {nudge.length ? (
            <Panel
              title="Recuérdaselo"
              description="Les queda uno o hace tres semanas que no lo usan."
              flush
            >
              <RowList>
                {nudge.slice(0, 5).map((b) => {
                  const t = templates.find((x) => x.id === b.templateId);
                  return (
                    <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{b.clientName}</span>
                        <span className="block text-xs text-text-muted">
                          Quedan {bonoRemaining(b)} de {b.uses}
                        </span>
                      </span>
                      <WhatsAppButton
                        phone={b.phone}
                        message={bonoNudgeMessage(b, t?.itemName ?? "consumición", data.space.name)}
                        label="Avisar"
                      />
                    </div>
                  );
                })}
              </RowList>
            </Panel>
          ) : null}

          <Tip title="Cómo se cobra">
            El bono se cobra entero en tu TPV al venderlo. Aquí solo descuentas
            cada {vertical.id === "bar" ? "caña" : "café"} y ves lo que queda.
            Tus clientes con Franky ven sus usos en el móvil.
          </Tip>
        </div>
      </div>

      <SellDrawer open={selling} onClose={() => setSelling(false)} />
      <BonoDrawer id={openId} onClose={() => setOpenId(null)} />
      <TemplateDrawer template={template} onClose={() => setTemplate(null)} />
    </div>
  );
}

function BonoRow({ bono, onOpen }: { bono: ProBono; onOpen: () => void }) {
  const { now } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  const left = bonoRemaining(bono);
  const t = ops?.bonoTemplates.find((x) => x.id === bono.templateId);
  const last = bono.usedAt[bono.usedAt.length - 1];
  const group = Boolean(bono.members?.length);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {group ? (
          <Users className="h-8 w-8 shrink-0 rounded-full border border-border p-1.5 text-violet" strokeWidth={1.75} />
        ) : (
          <Avatar name={bono.clientName} size="sm" tone="violet" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="truncate">{bono.clientName}</span>
            {group ? <Pill tone="violet">{bono.members!.length} en el grupo</Pill> : null}
            {bono.channel === "franky" ? <Pill>Franky</Pill> : null}
          </span>
          <span className="block truncate text-xs text-text-muted">
            {t?.name ?? "Bono"} · {last ? `último uso ${relative(last, now.getTime())}` : `vendido ${relative(bono.soldAt, now.getTime())}`}
          </span>
          <Meter value={bono.usedAt.length} max={bono.uses} className="mt-1.5 max-w-[14rem]" tone={left <= 1 ? "warning" : "violet"} />
        </span>
      </button>
      <span className="w-14 shrink-0 text-right text-sm tabular">
        <span className="font-heading text-lg font-bold">{left}</span>
        <span className="text-text-muted">/{bono.uses}</span>
      </span>
      {left > 0 ? (
        <Button
          size="sm"
          variant="secondary"
          className="h-10 w-full sm:w-auto"
          onClick={async () => {
            // En un bono de grupo hay que decir quién lo gasta: se abre la ficha.
            if (group) return onOpen();
            const ok = await save("bono.use", (o) => ({
              ...o,
              bonos: o.bonos.map((b) => (b.id === bono.id ? consumeBono(b, now.toISOString()) : b)),
            }));
            if (ok)
              toast.success(
                "Descontado",
                left - 1 > 0 ? `A ${bono.clientName.split(" ")[0]} le quedan ${left - 1}.` : "Era el último: ofrécele otro.",
              );
          }}
        >
          Descontar
        </Button>
      ) : null}
    </div>
  );
}

function BonoDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { now } = usePro();
  const { ops, save, pending } = useTablesOps();
  const toast = useToast();
  const bono = ops?.bonos.find((b) => b.id === id) ?? null;
  const [who, setWho] = React.useState("");

  React.useEffect(() => {
    setWho(bono?.members?.[0] ?? "");
    // Al cambiar de bono.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!bono || !ops) {
    return (
      <Drawer open={false} onOpenChange={onClose} title="">
        {null}
      </Drawer>
    );
  }
  const t = ops.bonoTemplates.find((x) => x.id === bono.templateId);
  const left = bonoRemaining(bono);
  const history = bonoHistory(bono);
  const usage = bonoUsageByMember(bono);
  const group = Boolean(bono.members?.length);

  const spend = async () => {
    const ok = await save("bono.use", (o) => ({
      ...o,
      bonos: o.bonos.map((b) => (b.id === bono.id ? consumeBono(b, now.toISOString(), group ? who : undefined) : b)),
    }));
    if (ok) toast.success("Descontado", group ? `${who.split(" ")[0]} del grupo ${bono.clientName}.` : bono.clientName);
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={bono.clientName}
      description={`${t?.name ?? "Bono"} · vendido el ${shortDay(bono.soldAt)} por ${money(bono.paidCents)}`}
      footer={
        left > 0 ? (
          <Button variant="dark" disabled={pending || (group && !who)} onClick={spend}>
            Descontar {t?.itemName.toLowerCase() ?? "uno"}
            {group && who ? ` a ${who.split(" ")[0]}` : ""}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl border border-border p-4 text-center">
          <p className="font-heading text-4xl font-extrabold tracking-[-0.03em] tabular">
            {left}
            <span className="text-lg text-text-muted">/{bono.uses}</span>
          </p>
          <p className="text-sm text-text-muted">{left === 1 ? "queda" : "quedan"} por gastar</p>
          <Meter value={bono.usedAt.length} max={bono.uses} className="mt-3" />
        </div>

        {group ? (
          <>
            {left > 0 ? (
              <FormField label="¿Quién lo gasta ahora?">
                <ChoiceChips
                  value={who}
                  onChange={setWho}
                  options={bono.members!.map((m) => ({ value: m, label: m.split(" ")[0] }))}
                />
              </FormField>
            ) : null}
            <div>
              <p className="text-[0.82rem] font-semibold">Lo que lleva cada uno</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {usage.map((u) => (
                  <li key={u.name} className="flex items-center gap-2">
                    <Avatar name={u.name} size="xs" tone="violet" />
                    <span className="min-w-0 flex-1 truncate">{u.name}</span>
                    <span className="font-semibold tabular">{u.uses}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}

        <div>
          <p className="text-[0.82rem] font-semibold">Usos</p>
          {history.length ? (
            <ul className="mt-2 divide-y divide-border-light rounded-2xl border border-border text-sm">
              {history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-24 shrink-0 text-text-muted">{shortDay(h.at)}</span>
                  <span className="w-12 shrink-0 tabular">{time(h.at)}</span>
                  {group ? <span className="min-w-0 flex-1 truncate">{h.by}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-text-muted">Todavía no lo ha usado.</p>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function SellDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now } = usePro();
  const { ops, save, pending } = useTablesOps();
  const toast = useToast();
  const active = ops?.bonoTemplates.filter((t) => t.active) ?? [];
  const [templateId, setTemplateId] = React.useState("");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [group, setGroup] = React.useState<"no" | "si">("no");
  const [member, setMember] = React.useState("");
  const [members, setMembers] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setTemplateId(active[0]?.id ?? "");
    setName("");
    setPhone("");
    setGroup("no");
    setMember("");
    setMembers([]);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!ops) return null;
  const template = active.find((t) => t.id === templateId);
  const client = data.clients.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  const valid = Boolean(template && name.trim().length >= 2 && (group === "no" || members.length >= 2));
  const addMember = () => {
    const v = member.trim();
    if (v && !members.includes(v)) setMembers((m) => [...m, v]);
    setMember("");
  };

  const submit = async () => {
    if (!template) return;
    const bono = sellBono({
      id: localId("bn"),
      template,
      at: now.toISOString(),
      buyer: name,
      phone: phone || client?.phone,
      clientId: group === "no" ? client?.id : undefined,
      members: group === "si" ? members : undefined,
    });
    if (!(await save("bono.sell", (o) => ({ ...o, bonos: [bono, ...o.bonos] })))) return;
    toast.success("Bono vendido", `${template.name} para ${bono.clientName}. Cóbralo en tu TPV: ${money(template.priceCents)}.`);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Vender bono"
      description="Se cobra en tu TPV. Aquí queda apuntado para ir descontando."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" disabled={pending || !valid} onClick={submit}>
            Vender{template ? ` por ${money(template.priceCents)}` : ""}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Bono">
          <ChoiceChips
            value={templateId}
            onChange={setTemplateId}
            options={active.map((t) => ({ value: t.id, label: t.name, hint: money(t.priceCents) }))}
          />
        </FormField>
        <FormField label="¿Para un grupo de estudio?" hint="Lo gastan varios y queda apuntado quién.">
          <ChoiceChips
            value={group}
            onChange={setGroup}
            options={[
              { value: "no", label: "Para una persona" },
              { value: "si", label: "Para un grupo" },
            ]}
          />
        </FormField>
        <FormField label={group === "si" ? "Nombre del grupo" : "Nombre"} htmlFor="bn-name">
          <input
            id="bn-name"
            list="bn-clients"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={group === "si" ? "TFG de Teleco" : "Nombre y apellido"}
            className={inputClass}
          />
          {group === "no" ? (
            <datalist id="bn-clients">
              {data.clients.slice(0, 200).map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          ) : null}
        </FormField>
        <FormField label="Teléfono" htmlFor="bn-phone" hint="Para recordarle los usos que le quedan.">
          <input
            id="bn-phone"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={client?.phone ?? "600 000 000"}
            className={inputClass}
          />
        </FormField>
        {group === "si" ? (
          <FormField label="Quién está en el grupo" htmlFor="bn-member" hint={members.length < 2 ? "Añade al menos dos personas." : undefined}>
            {members.length ? (
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMembers((list) => list.filter((x) => x !== m))}
                    className="inline-flex h-9 items-center gap-1 rounded-full border border-border px-3 text-xs font-semibold text-text-secondary hover:border-text-primary/25"
                    aria-label={`Quitar a ${m}`}
                  >
                    {m} <span aria-hidden>×</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2">
              <input
                id="bn-member"
                value={member}
                onChange={(e) => setMember(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addMember();
                  }
                }}
                placeholder="Nombre"
                className={inputClass}
              />
              <Button variant="outline" className="h-10 shrink-0" onClick={addMember} disabled={!member.trim()}>
                Añadir
              </Button>
            </div>
          </FormField>
        ) : null}
      </div>
    </Drawer>
  );
}

function TemplateDrawer({
  template,
  onClose,
}: {
  template: ProBonoTemplate | "new" | null;
  onClose: () => void;
}) {
  const { data, vertical } = usePro();
  const { save, pending } = useTablesOps();
  const toast = useToast();
  const isNew = template === "new";
  const [name, setName] = React.useState("");
  const [itemName, setItemName] = React.useState("");
  const [uses, setUses] = React.useState(10);
  const [price, setPrice] = React.useState("");
  const [active, setActive] = React.useState<"si" | "no">("si");

  React.useEffect(() => {
    if (!template) return;
    const t = template === "new" ? null : template;
    setName(t?.name ?? (vertical.id === "bar" ? "Bono 10 cañas" : "Bono 10 cafés"));
    setItemName(t?.itemName ?? (vertical.id === "bar" ? "Caña" : "Café con leche"));
    setUses(t?.uses ?? 10);
    setPrice(t ? eurosText(t.priceCents) : "");
    setActive(t?.active === false ? "no" : "si");
    // Al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  // Lo que costaría sin bono: el precio del producto en tu carta por los usos.
  const menuItem = data.menu.find((m) => m.name.toLowerCase() === itemName.trim().toLowerCase());
  const regular = menuItem ? menuItem.priceCents * uses : null;
  const cents = parseEuros(price);
  const valid = name.trim().length >= 3 && itemName.trim().length >= 2 && uses >= 2 && cents !== null && cents > 0;

  const submit = async () => {
    if (cents === null) return;
    const base = template && template !== "new" ? template : null;
    const next: ProBonoTemplate = {
      id: base?.id ?? localId("bt"),
      name: name.trim(),
      itemName: itemName.trim(),
      uses,
      priceCents: cents,
      regularCents: regular ?? base?.regularCents ?? cents,
      active: active === "si",
    };
    const ok = await save("bono.template", (o) => ({
      ...o,
      bonoTemplates: base
        ? o.bonoTemplates.map((t) => (t.id === base.id ? next : t))
        : [...o.bonoTemplates, next],
    }));
    if (!ok) return;
    toast.success(isNew ? "Bono creado" : "Bono guardado", `${next.name}: ${money(next.priceCents)}.`);
    onClose();
  };

  return (
    <Drawer
      open={template !== null}
      onOpenChange={(v) => !v && onClose()}
      title={isNew ? "Nuevo bono" : "Editar bono"}
      description="Los bonos ya vendidos no cambian."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" disabled={pending || !valid} onClick={submit}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Nombre" htmlFor="bt-name">
          <input id="bt-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="Qué se descuenta en cada uso" htmlFor="bt-item" hint="Mejor si coincide con un producto de tu carta.">
          <input
            id="bt-item"
            list="bt-menu"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            className={inputClass}
          />
          <datalist id="bt-menu">
            {data.menu.map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Usos">
          <Stepper label="Usos" value={uses} min={2} max={30} onChange={setUses} />
        </FormField>
        <FormField
          label="Precio del bono (€)"
          htmlFor="bt-price"
          hint={
            regular
              ? `Sin bono serían ${money(regular)}.${cents ? ` Ahorra ${money(Math.max(0, regular - cents))}.` : ""}`
              : undefined
          }
        >
          <input
            id="bt-price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d,.]/g, ""))}
            placeholder="13,50"
            className={cn(inputClass, "tabular")}
          />
        </FormField>
        <FormField label="A la venta">
          <ChoiceChips
            value={active}
            onChange={setActive}
            options={[
              { value: "si", label: "Sí" },
              { value: "no", label: "Pausado" },
            ]}
          />
        </FormField>
      </div>
    </Drawer>
  );
}

