"use client";

import * as React from "react";
import { Plus, RefreshCw, Ticket, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProPayment } from "@/lib/pro/types";
import type { ProCourtPass, ProCourtPassKind } from "@/lib/pro/courts-types";
import { localDate, money, plural, relative } from "@/lib/pro/format";
import { patchCourts } from "@/lib/pro/courts-base";
import { isPassActive, passesToRenew, sellPass } from "@/lib/pro/courts-ops";
import {
  buildPass,
  passLeftLabel,
  passStats,
  passTemplates,
  carryOver,
  passDays,
  type PassTemplate,
} from "@/lib/pro/courts-admin";
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
  SearchInput,
  Segmented,
  inputClass,
} from "../../kit";
import { METHOD_LABEL, WhatsAppLink, firstName } from "./booking-ops";
import { CourtsNotReady, parseEuros, shortDate, useCourtsState } from "./state";

/**
 * Bonos de partidos u horas y monedero con saldo. Se venden aquí, se
 * descuentan solos al reservar y los que se acaban salen primero: son la
 * venta más fácil de la semana.
 */

const KIND_LABEL: Record<ProCourtPassKind, string> = {
  matches: "Partidos",
  hours: "Horas",
  wallet: "Monedero",
};

type SellPreset = { renew?: ProCourtPass } | null;

export default function BonosSection() {
  const { ready } = useCourtsState();
  const [sell, setSell] = React.useState<SellPreset>(null);
  if (!ready)
    return (
      <div className="flex flex-col gap-5">
        <PageHeader eyebrow="Bonos" title="Bonos y monedero" />
        <CourtsNotReady
          icon={Ticket}
          title="Vende bonos y monederos"
          body="Un bono de 10 partidos o un monedero de 50 € se descuentan solos al reservar, y aquí ves quién tiene que renovar."
        />
      </div>
    );
  return (
    <>
      <Bonos onSell={setSell} />
      <SellDrawer preset={sell} onClose={() => setSell(null)} />
    </>
  );
}

function Bonos({ onSell }: { onSell: (p: SellPreset) => void }) {
  const { data, now } = usePro();
  const { ops } = useCourtsState();
  const today = localDate(now);
  const stats = passStats(data, today);
  const renew = passesToRenew(data, today);
  const [tab, setTab] = React.useState<"active" | "done">("active");
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const list = ops.passes
    .filter((p) => (tab === "active" ? isPassActive(p, today) : !isPassActive(p, today)))
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.label.toLowerCase().includes(q))
    .sort((a, b) => (tab === "active" ? a.expiresAt.localeCompare(b.expiresAt) : b.soldAt.localeCompare(a.soldAt)));
  const doneCount = ops.passes.filter((p) => !isPassActive(p, today)).length;

  const pieces = [
    stats.matchesLeft ? plural(stats.matchesLeft, "partido", "partidos") : "",
    stats.hoursLeft ? `${stats.hoursLeft.toLocaleString("es-ES")} h` : "",
    stats.walletLeftCents ? `${money(stats.walletLeftCents, { round: true })} de saldo` : "",
  ].filter(Boolean);
  const description = stats.active
    ? `${plural(stats.active, "bono en vigor", "bonos en vigor")}${pieces.length ? `, con ${pieces.join(", ")} por jugar` : ""}.${stats.toRenew ? ` ${plural(stats.toRenew, "se acaba", "se acaban")} pronto.` : ""}`
    : "Vende tu primer bono: se descuenta solo cada vez que el jugador reserva.";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Bonos"
        title="Bonos y monedero"
        description={description}
        actions={
          <Button variant="dark" onClick={() => onSell({})}>
            <Plus className="h-4 w-4" /> Vender bono
          </Button>
        }
      />

      <KpiRow>
        <Kpi label="En vigor" value={stats.active} icon={Ticket} hint="bonos y monederos" />
        <Kpi label="Por jugar" value={stats.matchesLeft} hint={stats.hoursLeft ? `partidos y ${stats.hoursLeft.toLocaleString("es-ES")} h` : "partidos"} />
        <Kpi label="Saldo en monederos" value={money(stats.walletLeftCents, { round: true })} icon={Wallet} hint="dinero ya cobrado" />
        <Kpi label="Vendido este mes" value={money(stats.soldThisMonthCents, { round: true })} emphasis hint="por adelantado" />
      </KpiRow>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        <Panel title="Todos los bonos" flush>
          <div className="flex flex-col gap-2.5 border-b border-border-light px-4 py-3 sm:flex-row sm:items-center sm:px-5">
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar por jugador o bono" className="min-w-0 flex-1" />
            <Segmented
              size="sm"
              label="Estado"
              value={tab}
              onChange={setTab}
              options={[
                { value: "active", label: "En vigor", count: stats.active },
                { value: "done", label: "Acabados", count: doneCount },
              ]}
            />
          </div>
          {list.length ? (
            <RowList>
              {list.map((p) => (
                <PassRow key={p.id} pass={p} today={today} onOpen={() => setOpen(p.id)} />
              ))}
            </RowList>
          ) : (
            <Empty
              icon={Ticket}
              title={q ? "Nadie con ese nombre" : tab === "active" ? "Ningún bono en vigor" : "Aún no se ha acabado ninguno"}
              body={
                q
                  ? "Prueba con el nombre o con el tipo de bono."
                  : tab === "active"
                    ? "Un bono de 10 partidos asegura diez visitas y lo cobras hoy."
                    : "Los bonos gastados o caducados aparecen aquí para renovarlos."
              }
            />
          )}
        </Panel>

        <Panel
          title="Por renovar"
          description={renew.length ? "Se acaban o caducan esta semana." : undefined}
          flush
        >
          {renew.length ? (
            <RowList>
              {renew.map((p) => (
                <div key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-3">
                    <Avatar name={p.name} size="sm" tone={p.left <= 0 ? "rose" : "amber"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {p.label}: {p.left > 0 ? `quedan ${passLeftLabel(p)}` : "agotado"}, caduca el {shortDate(localDate(p.expiresAt))}
                      </span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 pl-11">
                    <WhatsAppLink
                      phone={p.phone}
                      label="Recordar"
                      message={`Hola ${firstName(p.name)}, a tu ${p.label.toLowerCase()} de ${renewText(p)}. Si lo renuevas antes de que caduque, lo que te quede pasa al nuevo. ¿Te lo preparo?`}
                    />
                    <Button size="sm" variant="outline" className="min-h-10" onClick={() => onSell({ renew: p })}>
                      <RefreshCw className="h-3.5 w-3.5" /> Renovar
                    </Button>
                  </div>
                </div>
              ))}
            </RowList>
          ) : (
            <Empty
              icon={RefreshCw}
              title="Nadie tiene que renovar"
              body="Cuando a un bono le quede un partido o caduque en 7 días, aparece aquí con el mensaje preparado."
            />
          )}
        </Panel>
      </div>

      <PassDrawer id={open} onClose={() => setOpen(null)} onRenew={(p) => onSell({ renew: p })} />
    </div>
  );
}

/** Lo que queda escrito para el mensaje: "le quedan 2 partidos". */
function renewText(p: ProCourtPass): string {
  return p.left > 0 ? `le quedan ${passLeftLabel(p)}` : "no le queda nada";
}

function PassRow({ pass: p, today, onOpen }: { pass: ProCourtPass; today: string; onOpen: () => void }) {
  const active = isPassActive(p, today);
  const expires = localDate(p.expiresAt);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary sm:px-5"
    >
      <Avatar name={p.name} size="sm" tone={active ? "violet" : "slate"} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{p.name}</span>
          <span className="hidden shrink-0 text-xs text-text-muted sm:inline">{p.label}</span>
        </span>
        <Meter value={p.left} max={p.total} className="mt-1.5 max-w-[220px]" tone={p.left / p.total <= 0.2 ? "warning" : "violet"} />
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular">{active ? passLeftLabel(p) : p.left > 0 ? "Caducado" : "Agotado"}</span>
        <span className="block text-xs text-text-muted">{active ? `hasta ${shortDate(expires)}` : shortDate(expires)}</span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Ficha del bono                                                      */
/* ------------------------------------------------------------------ */

function PassDrawer({ id, onClose, onRenew }: { id: string | null; onClose: () => void; onRenew: (p: ProCourtPass) => void }) {
  const { now } = usePro();
  const { ops } = useCourtsState();
  const today = localDate(now);
  const p = ops.passes.find((x) => x.id === id) ?? null;
  if (!p) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;
  const active = isPassActive(p, today);
  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={p.name}
      description={`${p.label}, vendido ${relative(p.soldAt, now.getTime())} por ${money(p.priceCents)}`}
      footer={
        <>
          <WhatsAppLink phone={p.phone} message={`Hola ${firstName(p.name)}, a tu ${p.label.toLowerCase()} ${p.left > 0 ? `le quedan ${passLeftLabel(p)}` : "no le queda nada"} y caduca el ${shortDate(localDate(p.expiresAt))}.`} />
          <Button
            variant="dark"
            onClick={() => {
              onClose();
              onRenew(p);
            }}
          >
            <RefreshCw className="h-4 w-4" /> Renovar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <div className="flex items-baseline justify-between">
            <p className="font-heading text-3xl font-extrabold tabular">{passLeftLabel(p)}</p>
            <Pill tone={active ? "success" : "neutral"}>{active ? `Hasta el ${shortDate(localDate(p.expiresAt))}` : p.left > 0 ? "Caducado" : "Agotado"}</Pill>
          </div>
          <Meter value={p.left} max={p.total} className="mt-2" />
          <p className="mt-1.5 text-xs text-text-muted">
            De {p.kind === "wallet" ? money(p.total) : passLeftLabel({ kind: p.kind, left: p.total })} al comprarlo.
          </p>
        </div>
        <section>
          <p className="eyebrow mb-2">Usos</p>
          {p.uses.length ? (
            <ul className="divide-y divide-border-light rounded-2xl border border-border px-3">
              {p.uses
                .slice()
                .reverse()
                .map((u, i) => (
                  <li key={`${u.at}-${i}`} className="flex items-center justify-between py-2 text-sm">
                    <span>{shortDate(localDate(u.at))}</span>
                    <span className="font-medium tabular">
                      {p.kind === "wallet" ? `-${money(u.amount)}` : `-${u.amount.toLocaleString("es-ES")} ${p.kind === "hours" ? "h" : u.amount === 1 ? "partido" : "partidos"}`}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-bg-secondary p-4 text-sm text-text-muted">
              Aún no lo ha usado. Al cobrar una reserva suya, elige pagar con el bono.
            </p>
          )}
        </section>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Vender un bono                                                      */
/* ------------------------------------------------------------------ */

function SellDrawer({ preset, onClose }: { preset: SellPreset; onClose: () => void }) {
  const { data, update, now, pending } = usePro();
  const { canMix } = useCourtsState();
  const toast = useToast();
  const today = localDate(now);
  const templates = React.useMemo(() => passTemplates(data, today), [data, today]);
  const [templateId, setTemplateId] = React.useState<string>("m10");
  const [kind, setKind] = React.useState<ProCourtPassKind>("matches");
  const [label, setLabel] = React.useState("");
  const [total, setTotal] = React.useState("10");
  const [price, setPrice] = React.useState("");
  const [days, setDays] = React.useState(120);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [clientId, setClientId] = React.useState<string | undefined>();
  const [method, setMethod] = React.useState<ProPayment["method"]>("card");

  const pick = React.useCallback((t: Omit<PassTemplate, "id"> & { id?: string }) => {
    setTemplateId(t.id ?? "custom");
    setKind(t.kind);
    setLabel(t.label);
    setTotal(t.kind === "wallet" ? String(t.total / 100) : String(t.total));
    setPrice(String(t.priceCents / 100).replace(".", ","));
    setDays(t.days);
  }, []);

  React.useEffect(() => {
    if (!preset) return;
    const renew = preset.renew;
    if (renew) {
      // Mismo bono, mismo precio y misma duración que el anterior.
      pick({ kind: renew.kind, label: renew.label, total: renew.total, priceCents: renew.priceCents, days: passDays(renew), id: "custom" });
      setName(renew.name);
      setPhone(renew.phone ?? "");
      setClientId(renew.clientId);
    } else {
      const first = templates.find((t) => t.id === "m10") ?? templates[0];
      if (first) pick(first);
      setName("");
      setPhone("");
      setClientId(undefined);
    }
    setMethod("card");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const priceCents = parseEuros(price);
  const totalNumber = Number(total.replace(",", "."));
  const totalUnits = kind === "wallet" ? Math.round(totalNumber * 100) : kind === "hours" ? Math.round(totalNumber * 4) / 4 : Math.round(totalNumber);
  const carry = preset?.renew ? carryOver(preset.renew, today) : 0;
  const q = name.trim().toLowerCase();
  const matches =
    q.length >= 2 && !clientId
      ? data.clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 4)
      : [];
  const valid =
    name.trim().length >= 2 &&
    label.trim().length >= 3 &&
    priceCents !== null &&
    priceCents > 0 &&
    Number.isFinite(totalNumber) &&
    totalUnits > 0;

  const save = async () => {
    if (!valid || priceCents === null) return;
    const base = buildPass(
      { kind, label, total: totalUnits, priceCents, days },
      { clientId, name, phone },
      { id: localId("bn"), now },
    );
    const pass = carry ? { ...base, total: base.total + carry, left: base.left + carry } : base;
    const ok = await update("court.pass.sell", (d) => {
      const withPass = canMix
        ? sellPass(d, pass, { method, paymentId: localId("p") })
        : patchCourts(d, (o) => ({ passes: [...o.passes, pass] }));
      // Al renovar, el bono anterior queda a cero: lo que tenía ya va en el nuevo.
      if (!preset?.renew || !carry) return withPass;
      const oldId = preset.renew.id;
      return patchCourts(withPass, (o) => ({
        passes: o.passes.map((x) => (x.id === oldId ? { ...x, left: 0 } : x)),
      }));
    });
    if (ok) {
      toast.success(
        preset?.renew ? "Bono renovado" : "Bono vendido",
        `${firstName(pass.name)} tiene ${passLeftLabel(pass)}${canMix ? `. Cobrado ${money(priceCents)} con ${METHOD_LABEL[method].toLowerCase()}` : ""}.`,
      );
      onClose();
    }
  };

  return (
    <Drawer
      open={Boolean(preset)}
      onOpenChange={(v) => !v && onClose()}
      title={preset?.renew ? `Renovar a ${firstName(preset.renew.name)}` : "Vender un bono"}
      description="Se descuenta solo cada vez que reserva."
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save} disabled={!valid || pending}>
            {priceCents ? `Cobrar ${money(priceCents)}` : "Vender"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {!preset?.renew ? (
          <FormField label="Bono">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={templateId === t.id}
                  onClick={() => pick(t)}
                  className={cn(
                    "flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors",
                    templateId === t.id
                      ? "border-violet bg-violet-50 text-violet-deep"
                      : "border-border hover:border-text-primary/25",
                  )}
                >
                  <span className="text-sm font-semibold">{t.label}</span>
                  <span className="text-xs text-text-muted tabular">{money(t.priceCents)}</span>
                </button>
              ))}
              <button
                type="button"
                aria-pressed={templateId === "custom"}
                onClick={() => setTemplateId("custom")}
                className={cn(
                  "flex min-h-14 flex-col items-start justify-center rounded-xl border border-dashed px-3 py-2 text-left text-sm font-semibold transition-colors",
                  templateId === "custom" ? "border-violet text-violet-deep" : "border-border text-text-secondary",
                )}
              >
                A tu medida
              </button>
            </div>
          </FormField>
        ) : null}

        {templateId === "custom" || preset?.renew ? (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nombre del bono" htmlFor="bn-label" className="col-span-2">
              <input id="bn-label" value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} />
            </FormField>
            <FormField label="Tipo" className="col-span-2">
              <ChoiceChips
                value={kind}
                onChange={setKind}
                options={(Object.keys(KIND_LABEL) as ProCourtPassKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              />
            </FormField>
            <FormField label={kind === "wallet" ? "Saldo (€)" : kind === "hours" ? "Horas" : "Partidos"} htmlFor="bn-total">
              <input id="bn-total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className={inputClass} />
            </FormField>
            <FormField label="Precio (€)" htmlFor="bn-price">
              <input id="bn-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
            </FormField>
            <FormField label="Caduca a los" className="col-span-2">
              <ChoiceChips
                value={String(days)}
                onChange={(v) => setDays(Number(v))}
                options={[30, 60, 90, 120, 180, 365].map((d) => ({ value: String(d), label: d === 365 ? "1 año" : `${d} días` }))}
              />
            </FormField>
          </div>
        ) : null}

        <FormField label="Para quién" htmlFor="bn-name">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              id="bn-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setClientId(undefined);
              }}
              autoComplete="off"
              placeholder="Nombre"
              className={inputClass}
            />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Móvil" aria-label="Móvil" className={inputClass} />
          </div>
          {matches.length ? (
            <div className="flex flex-wrap gap-1.5">
              {matches.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setName(c.name);
                    setPhone(c.phone ?? "");
                    setClientId(c.id);
                  }}
                  className="inline-flex min-h-10 items-center rounded-full border border-border px-3 text-xs font-semibold text-text-secondary hover:border-violet/40 hover:text-violet"
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
        </FormField>

        {canMix ? (
          <FormField label="Cobro">
            <ChoiceChips
              value={method}
              onChange={setMethod}
              options={(Object.keys(METHOD_LABEL) as ProPayment["method"][]).map((m) => ({ value: m, label: METHOD_LABEL[m] }))}
            />
          </FormField>
        ) : null}

        {valid ? (
          <p className="rounded-2xl bg-bg-secondary p-4 text-sm text-text-muted">
            {firstName(name)} tendrá{" "}
            <span className="font-semibold text-text-primary">
              {passLeftLabel({ kind, left: totalUnits + carry })}
            </span>{" "}
            hasta dentro de {days} días
            {carry ? `, con lo que le quedaba del anterior (${passLeftLabel({ kind, left: carry })})` : ""}.
            {kind === "matches" && priceCents
              ? ` Sale a ${money(Math.round(priceCents / totalUnits))} el partido.`
              : ""}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
