import React from "react";
import { Linking, View } from "react-native";
import { MessageCircle, Plus, RefreshCw, Ticket, Wallet } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, S } from "@/theme";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import type { ProPayment } from "../../../../../shared/pro/types";
import type { ProCourtPass } from "../../../../../shared/pro/courts-types";
import { localDate, money, plural, shortDay } from "../../../../../shared/pro/format";
import { courtsOps, patchCourts } from "../../../../../shared/pro/courts-base";
import { isPassActive, passesToRenew, sellPass } from "../../../../../shared/pro/courts-ops";
import {
  buildPass,
  carryOver,
  passDays,
  passLeftLabel,
  passStats,
  passTemplates,
  type PassTemplate,
} from "../../../../../shared/pro/courts-admin";
import { customerWhatsApp } from "../../../../../shared/pro/customer-contact";
import {
  ChoiceGrid,
  Empty,
  Field,
  Input,
  Kpi,
  KpiRow,
  ListRow,
  Meter,
  PAvatar,
  PButton,
  PText,
  PageHeader,
  Panel,
  SearchInput,
  Sheet,
} from "../../kit";

/**
 * Bonos de partidos u horas y monedero (versión nativa de web
 * courts/bonos.tsx). Se venden aquí y los que se acaban salen primero.
 */

const METHOD_LABEL: Record<ProPayment["method"], string> = { card: "Tarjeta", cash: "Efectivo", bizum: "Bizum" };

function day(iso: string) {
  return shortDay(`${localDate(iso)}T12:00:00Z`).replace(/\./g, "");
}

function firstName(name: string) {
  return name.split(" ")[0] ?? name;
}

type SellPreset = { renew?: ProCourtPass } | null;

export default function Bonos() {
  const { data, demo, now } = usePro();
  const [sell, setSell] = React.useState<SellPreset>(null);
  const [query, setQuery] = React.useState("");
  const today = localDate(now);

  if (!demo && !data.courts)
    return (
      <ProPage>
        <PageHeader eyebrow="Bonos" title="Bonos y monedero" />
        <Panel>
          <Empty
            icon={Ticket}
            title="Vende bonos y monederos"
            body="Un bono de 10 partidos o un monedero de 50 € se descuentan solos al reservar, y aquí ves quién tiene que renovar."
          />
        </Panel>
      </ProPage>
    );

  const stats = passStats(data, today);
  const renew = passesToRenew(data, today);
  const q = query.trim().toLowerCase();
  const active = courtsOps(data)
    .passes.filter((p) => isPassActive(p, today))
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.label.toLowerCase().includes(q))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

  return (
    <ProPage>
      <PageHeader
        eyebrow="Bonos"
        title="Bonos y monedero"
        description={
          stats.active
            ? `${plural(stats.active, "bono en vigor", "bonos en vigor")}.${stats.toRenew ? ` ${plural(stats.toRenew, "se acaba", "se acaban")} pronto.` : ""}`
            : "Vende tu primer bono: se descuenta solo cada vez que el jugador reserva."
        }
        actions={<PButton label="Vender bono" icon={Plus} onPress={() => setSell({})} />}
      />
      <KpiRow>
        <Kpi label="En vigor" value={stats.active} icon={Ticket} />
        <Kpi label="Por jugar" value={stats.matchesLeft} hint="partidos" />
        <Kpi label="Saldo en monederos" value={money(stats.walletLeftCents, { round: true })} icon={Wallet} />
        <Kpi label="Vendido este mes" value={money(stats.soldThisMonthCents, { round: true })} emphasis />
      </KpiRow>

      <Panel title="Por renovar" flush>
        {renew.length ? (
          renew.map((p, i) => {
            const wa = customerWhatsApp(
              p.phone,
              `Hola ${firstName(p.name)}, a tu ${p.label.toLowerCase()} ${p.left > 0 ? `le quedan ${passLeftLabel(p)}` : "no le queda nada"}. Si lo renuevas antes de que caduque, lo que te quede pasa al nuevo. ¿Te lo preparo?`,
            );
            return (
              <ListRow key={p.id} last={i === renew.length - 1}>
                <PAvatar name={p.name} size={34} toneKey={p.left <= 0 ? "rose" : "amber"} />
                <View style={{ flex: 1 }}>
                  <PText v="h3" numberOfLines={1}>{p.name}</PText>
                  <PText v="tiny" numberOfLines={1}>
                    {p.left > 0 ? `Quedan ${passLeftLabel(p)}` : "Agotado"}, caduca el {day(p.expiresAt)}
                  </PText>
                </View>
                {wa ? (
                  <Tap
                    onPress={() => void Linking.openURL(wa)}
                    accessibilityRole="link"
                    accessibilityLabel={`Recordar a ${p.name} por WhatsApp`}
                    style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                  >
                    <MessageCircle size={18} color={C.text} strokeWidth={1.9} />
                  </Tap>
                ) : null}
                <PButton label="Renovar" icon={RefreshCw} variant="outline" small onPress={() => setSell({ renew: p })} />
              </ListRow>
            );
          })
        ) : (
          <Empty icon={RefreshCw} title="Nadie tiene que renovar" body="Cuando a un bono le quede un partido o caduque en 7 días, aparece aquí con el mensaje preparado." />
        )}
      </Panel>

      <SearchInput value={query} onChange={setQuery} placeholder="Buscar por jugador o bono" />
      <Panel title="En vigor" flush>
        {active.length ? (
          active.slice(0, 40).map((p, i, list) => (
            <ListRow key={p.id} last={i === list.length - 1}>
              <PAvatar name={p.name} size={34} toneKey="violet" />
              <View style={{ flex: 1, gap: 6 }}>
                <PText v="h3" numberOfLines={1}>{p.name}</PText>
                <Meter value={p.left} max={p.total} tone={p.left / p.total <= 0.2 ? "warning" : "violet"} />
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <PText v="h3">{passLeftLabel(p)}</PText>
                <PText v="tiny">hasta {day(p.expiresAt)}</PText>
              </View>
            </ListRow>
          ))
        ) : (
          <Empty icon={Ticket} title={q ? "Nadie con ese nombre" : "Ningún bono en vigor"} body={q ? "Prueba con el nombre o con el tipo de bono." : "Un bono de 10 partidos asegura diez visitas y lo cobras hoy."} />
        )}
      </Panel>

      <SellSheet preset={sell} onClose={() => setSell(null)} />
    </ProPage>
  );
}

function SellSheet({ preset, onClose }: { preset: SellPreset; onClose: () => void }) {
  const { data, update, now, demo, pending } = usePro();
  const today = localDate(now);
  const templates = React.useMemo(() => passTemplates(data, today), [data, today]);
  const [template, setTemplate] = React.useState<Omit<PassTemplate, "id"> | null>(null);
  const [templateId, setTemplateId] = React.useState("m10");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [clientId, setClientId] = React.useState<string | undefined>();
  const [method, setMethod] = React.useState<ProPayment["method"]>("card");

  React.useEffect(() => {
    if (!preset) return;
    const r = preset.renew;
    if (r) {
      setTemplate({ kind: r.kind, label: r.label, total: r.total, priceCents: r.priceCents, days: passDays(r) });
      setTemplateId("renew");
      setName(r.name);
      setPhone(r.phone ?? "");
      setClientId(r.clientId);
    } else {
      const first = templates.find((t) => t.id === "m10") ?? templates[0] ?? null;
      setTemplate(first);
      setTemplateId(first?.id ?? "");
      setName("");
      setPhone("");
      setClientId(undefined);
    }
    setMethod("card");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const carry = preset?.renew ? carryOver(preset.renew, today) : 0;
  const q = name.trim().toLowerCase();
  const matches = q.length >= 2 && !clientId ? data.clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 4) : [];
  const valid = Boolean(template) && name.trim().length >= 2;

  const save = async () => {
    if (!template || !valid) return;
    const base = buildPass(template, { clientId, name, phone }, { id: localId("bn"), now });
    const pass = carry ? { ...base, total: base.total + carry, left: base.left + carry } : base;
    const ok = await update("court.pass.sell", (d) => {
      const next = demo ? sellPass(d, pass, { method, paymentId: localId("p") }) : patchCourts(d, (o) => ({ passes: [...o.passes, pass] }));
      if (!preset?.renew || !carry) return next;
      const oldId = preset.renew.id;
      return patchCourts(next, (o) => ({ passes: o.passes.map((x) => (x.id === oldId ? { ...x, left: 0 } : x)) }));
    });
    if (ok) {
      toast(preset?.renew ? "Bono renovado" : "Bono vendido", `${firstName(pass.name)} tiene ${passLeftLabel(pass)}.`);
      onClose();
    }
  };

  return (
    <Sheet
      open={Boolean(preset)}
      onClose={onClose}
      title={preset?.renew ? `Renovar a ${firstName(preset.renew.name)}` : "Vender un bono"}
      description="Se descuenta solo cada vez que reserva."
      footer={<PButton label={template ? `Cobrar ${money(template.priceCents)}` : "Vender"} full onPress={() => void save()} disabled={!valid || pending} />}
    >
      <View style={{ gap: S.lg }}>
        {!preset?.renew ? (
          <Field label="Bono">
            <ChoiceGrid
              value={templateId}
              onChange={(id) => {
                setTemplateId(id);
                setTemplate(templates.find((t) => t.id === id) ?? null);
              }}
              options={templates.map((t) => ({ value: t.id, label: t.label, hint: money(t.priceCents) }))}
            />
          </Field>
        ) : null}
        <Field label="Para quién">
          <Input value={name} onChangeText={(v) => { setName(v); setClientId(undefined); }} placeholder="Nombre" />
          <Input value={phone} onChangeText={setPhone} placeholder="Móvil" keyboardType="phone-pad" />
          {matches.map((c) => (
            <PButton
              key={c.id}
              label={c.name}
              variant="ghost"
              small
              onPress={() => {
                setName(c.name);
                setPhone(c.phone ?? "");
                setClientId(c.id);
              }}
            />
          ))}
        </Field>
        {demo ? (
          <Field label="Cobro">
            <ChoiceGrid
              value={method}
              onChange={setMethod}
              options={(Object.keys(METHOD_LABEL) as ProPayment["method"][]).map((m) => ({ value: m, label: METHOD_LABEL[m] }))}
            />
          </Field>
        ) : null}
        {template && valid ? (
          <PText v="small">
            {firstName(name)} tendrá {passLeftLabel({ kind: template.kind, left: template.total + carry })} durante {template.days} días
            {carry ? `, con lo que le quedaba del anterior` : ""}.
          </PText>
        ) : null}
      </View>
    </Sheet>
  );
}
