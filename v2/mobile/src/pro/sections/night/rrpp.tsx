import React from "react";
import { Linking, Share, Text, View } from "react-native";
import { BadgeCheck, Check, Eye, Megaphone, MessageCircle, Plus, Share2, UserPlus, Wallet } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProCommissionRule, ProPromoter } from "../../../../../shared/pro/types";
import { UNIVERSITIES } from "../../../../../shared/pro/demo/common";
import { money, pct, relative, shortDay } from "../../../../../shared/pro/format";
import {
  commissionFor,
  pendingSettlement,
  promoterCode,
  promoterLink,
  promoterNights,
  promoterTotals,
  ruleLabel,
  sortedEvents,
} from "../../../../../shared/pro/night";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import {
  ChoiceGrid,
  Detail,
  Empty,
  Field,
  Input,
  Kpi,
  KpiRow,
  ListRow,
  PAvatar,
  PButton,
  PText,
  PageHeader,
  Panel,
  Pill,
  Segmented,
  Sheet,
  Tip,
  Toggle,
} from "../../kit";
import { BoxRow, Boxed, Eyebrow, Stat, StatGrid, afterSheet } from "./night-ui";
import { MonthCsvButtons, PromoterCapBlock, PromoterPanelSheet, TargetsPanel, sendReceipt } from "./rrpp-extras";

export default function NightRrpp() {
  const { data, now, update } = usePro();
  const [eventId, setEventId] = React.useState<string>("all");
  const [open, setOpen] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [viewing, setViewing] = React.useState<string | null>(null);

  const events = sortedEvents(data)
    .filter((e) => e.status !== "draft" && data.guests.some((g) => g.eventId === e.id && g.promoterId))
    .reverse();
  const filterId = eventId === "all" ? undefined : eventId;
  const rows = data.promoters
    .map((p) => ({ p, t: promoterTotals(data, p, filterId), pending: pendingSettlement(data, p, now) }))
    .sort((a, b) => b.t.scanned - a.t.scanned || b.t.sold - a.t.sold);
  const active = data.promoters.filter((p) => p.active).length;
  const totals = rows.reduce(
    (acc, r) => ({
      sold: acc.sold + r.t.sold,
      list: acc.list + r.t.list,
      scanned: acc.scanned + r.t.scanned,
      commission: acc.commission + r.t.commissionCents,
      byList: acc.byList + r.t.byListCents,
    }),
    { sold: 0, list: 0, scanned: 0, commission: 0, byList: 0 },
  );
  const settlement = rows.filter((r) => r.pending.cents > 0);
  const pendingTotal = settlement.reduce((a, r) => a + r.pending.cents, 0);

  const pay = async (ids: string[]) => {
    const at = new Date().toISOString();
    const total = ids.reduce((a, id) => a + (rows.find((r) => r.p.id === id)?.pending.cents ?? 0), 0);
    const ok = await update("rrpp.settle", (d) => ({
      ...d,
      promoters: d.promoters.map((p) => {
        if (!ids.includes(p.id)) return p;
        const s = pendingSettlement(d, p, now);
        if (!s.cents) return p;
        const next: ProPromoter = {
          ...p,
          settledEventIds: [...(p.settledEventIds ?? []), ...s.nights.map((n) => n.eventId)],
          payouts: [{ at, amountCents: s.cents, scanned: s.scanned }, ...(p.payouts ?? [])],
        };
        return next;
      }),
    }));
    if (!ok) return;
    toast(ids.length > 1 ? "Liquidación pagada" : "Marcado como pagado", { kind: "success", body: `${money(total)} por entradas escaneadas en puerta.` });
  };

  return (
    <ProPage>
      <PageHeader
        eyebrow="Equipo de calle"
        title="RRPP"
        description={`${active} RRPP activos. ${totals.scanned.toLocaleString("es-ES")} personas han entrado de verdad con sus enlaces${filterId ? " esa noche" : ""} y ${money(pendingTotal, { round: true })} están pendientes de pagar.`}
        actions={<PButton label="Alta de RRPP" icon={UserPlus} onPress={() => setAdding(true)} />}
      />

      <KpiRow>
        <Kpi icon={Megaphone} label="Vendidas y en lista" value={(totals.sold + totals.list).toLocaleString("es-ES")} hint={`${totals.sold} entradas · ${totals.list} en lista`} />
        <Kpi label="Entraron de verdad" value={totals.scanned.toLocaleString("es-ES")} hint={`${pct(totals.scanned, totals.sold + totals.list)} % de conversión`} emphasis />
        <Kpi label="Comisión generada" value={money(totals.commission, { round: true })} hint="Por entrada escaneada" />
        <Kpi icon={Wallet} label="Por pagar" value={money(pendingTotal, { round: true })} hint={`${settlement.length} RRPP en la liquidación`} />
      </KpiRow>

      <Tip title="Paga por quien entra, no por quien apuntan">
        {`Con listas de WhatsApp pagarías por cada nombre apuntado: ${money(totals.byList, { round: true })}. Pagando por entrada escaneada en puerta son ${money(totals.commission, { round: true })}. ${
          totals.byList > totals.commission ? `Te ahorras ${money(totals.byList - totals.commission, { round: true })} y nadie discute.` : ""
        }`}
      </Tip>

      <TargetsPanel onOpen={setOpen} />

      <Segmented
        value={eventId}
        onChange={setEventId}
        options={[{ value: "all", label: "Todas las noches" }, ...events.map((e) => ({ value: e.id, label: `${e.name.split(" ")[0]} ${shortDay(e.doorsOpen)}` }))]}
      />

      <Panel title="Ranking" description="Ordenado por entradas reales en puerta." flush>
        {rows.length ? (
          rows.map(({ p, t }, i) => (
            <ListRow key={p.id} onPress={() => setOpen(p.id)} accessibilityLabel={`${p.name}, ${t.scanned} dentro, ${money(t.commissionCents)}`} last={i === rows.length - 1}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: S.md, flex: 1, opacity: p.active ? 1 : 0.6 }}>
                <PText v="tiny" style={{ width: 14, textAlign: "center", fontFamily: FONT.heading }}>
                  {String(i + 1)}
                </PText>
                <PAvatar name={p.name} size={32} toneKey={i === 0 ? "violet" : "slate"} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{p.name}</PText>
                    {p.university ? <BadgeCheck size={13} color={C.blue} accessibilityLabel="Estudiante verificado" /> : null}
                  </View>
                  <PText v="tiny" numberOfLines={1}>{`${t.scanned} dentro de ${t.sold + t.list} · `}<Text style={{ color: t.conversion >= 60 ? C.success : t.conversion < 40 ? C.warning : C.muted }}>{`${t.conversion} %`}</Text>{!p.active ? " · de baja" : ""}</PText>
                </View>
                <Text style={{ fontFamily: FONT.heading, fontSize: 15, color: C.text }} maxFontSizeMultiplier={1.3}>
                  {money(t.commissionCents, { round: true })}
                </Text>
              </View>
            </ListRow>
          ))
        ) : (
          <Empty
            icon={Megaphone}
            title="Aún no tienes RRPP"
            body="Da de alta a tus relaciones públicas: cada uno tendrá su enlace y su código, y su comisión se calcula sola en la puerta."
            action={<PButton label="Alta de RRPP" icon={Plus} onPress={() => setAdding(true)} />}
          />
        )}
      </Panel>

      <Panel
        title="Liquidación del lunes"
        description="Lo que debes a cada RRPP por las noches ya cerradas."
        action={settlement.length ? <PButton label="Pagar todo" small onPress={() => void pay(settlement.map((r) => r.p.id))} /> : null}
        flush
      >
        {settlement.length ? (
          <>
            {settlement.map(({ p, pending }) => (
              <ListRow key={p.id}>
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3" numberOfLines={1}>{p.name}</PText>
                  <PText v="tiny" numberOfLines={2}>
                    {`${pending.scanned} escaneadas en ${pending.nights.length} ${pending.nights.length === 1 ? "noche" : "noches"} · ${ruleLabel(p.spec, p.rule)}`}
                  </PText>
                  <Text style={{ fontFamily: FONT.heading, fontSize: 15, color: C.text, marginTop: 2 }} maxFontSizeMultiplier={1.3}>
                    {money(pending.cents)}
                  </Text>
                </View>
                <View style={{ gap: S.xs }}>
                  <PButton
                    label="Recibo"
                    icon={MessageCircle}
                    variant="ghost"
                    small
                    onPress={() => sendReceipt(data, p, pending.nights)}
                    accessibilityLabel={`Enviar el recibo a ${p.name} por WhatsApp`}
                  />
                  <PButton label="Pagado" icon={Check} variant="outline" small onPress={() => void pay([p.id])} accessibilityLabel={`Marcar pagado a ${p.name}`} />
                </View>
              </ListRow>
            ))}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: S.lg, paddingVertical: S.md }}>
              <PText v="h3">Total a pagar</PText>
              <Text style={{ fontFamily: FONT.display, fontSize: 19, color: C.text }} maxFontSizeMultiplier={1.3}>
                {money(pendingTotal)}
              </Text>
            </View>
          </>
        ) : (
          <Empty icon={Wallet} title="Todo pagado" body="Cuando cierre la próxima noche tendrás aquí lo que debes a cada RRPP, calculado con lo escaneado en puerta." />
        )}
        <MonthCsvButtons />
      </Panel>

      <PromoterDrawer
        promoterId={open}
        onClose={() => setOpen(null)}
        onView={(id) => {
          setOpen(null);
          // iOS no apila dos hojas: se abre el panel cuando se ha cerrado la ficha.
          afterSheet(() => setViewing(id));
        }}
      />
      <PromoterPanelSheet promoterId={viewing} onClose={() => setViewing(null)} />
      <NewPromoterDrawer open={adding} onClose={() => setAdding(false)} />
    </ProPage>
  );
}

function PromoterDrawer({ promoterId, onClose, onView }: { promoterId: string | null; onClose: () => void; onView: (id: string) => void }) {
  const { data, now, update } = usePro();
  const p = promoterId ? data.promoters.find((x) => x.id === promoterId) : undefined;
  if (!p) return null;
  const link = `https://${promoterLink(p.code, data.space.slug)}`;
  const nights = promoterNights(data, p);
  const totals = promoterTotals(data, p);
  const settled = new Set(p.settledEventIds ?? []);
  const shareText = `Entradas y lista para ${data.space.name} con mi enlace: ${link}`;

  // Sin portapapeles en la app: se comparte con la hoja del sistema (incluye "Copiar").
  const share = async () => {
    try {
      await Share.share({ message: link });
    } catch {
      toast("Copia el enlace", { kind: "info", body: link });
    }
  };

  const whatsapp = async () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    try {
      await Linking.openURL(url);
    } catch {
      toast("No se pudo abrir WhatsApp", { kind: "error" });
    }
  };

  return (
    <Sheet open onClose={onClose} title={p.name} description={`${p.university ?? "Sin universidad"} · RRPP desde ${p.since ? relative(p.since, now.getTime()) : "hace poco"}`}>
      <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg, gap: S.sm }}>
        <PText v="label">Su enlace</PText>
        <Text style={{ fontFamily: FONT.heading, fontSize: 17, color: C.text }} maxFontSizeMultiplier={1.3} selectable>
          {promoterLink(p.code, data.space.slug)}
        </Text>
        <Text style={{ fontSize: 14, color: C.muted }} maxFontSizeMultiplier={1.4}>
          {"Código "}
          <Text style={{ fontFamily: FONT.semibold, color: C.text }}>{p.code.toUpperCase()}</Text>
          {". Todo lo que se venda o apunte con él queda a su nombre."}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginTop: S.xs }}>
          <PButton label="Compartir enlace" icon={Share2} variant="outline" small onPress={() => void share()} />
          <PButton label="Enviar por WhatsApp" icon={MessageCircle} variant="outline" small onPress={() => void whatsapp()} />
          <PButton label="Ver su panel" icon={Eye} variant="ghost" small onPress={() => onView(p.id)} />
        </View>
      </View>

      <PromoterCapBlock promoter={p} />

      <StatGrid>
        <Stat label="Vendidas" value={totals.sold} />
        <Stat label="En lista" value={totals.list} />
        <Stat label="Entraron" value={totals.scanned} />
        <Stat label="Conversión" value={`${totals.conversion} %`} />
      </StatGrid>

      <View>
        <Detail label="Comisión" value={ruleLabel(p.spec, p.rule)} />
        <Detail label="Teléfono" value={p.phone ?? "Sin teléfono"} />
        <Toggle
          label="Activo"
          value={p.active}
          onChange={async (v) => {
            if (!(await update("rrpp.active", (d) => ({ ...d, promoters: d.promoters.map((x) => (x.id === p.id ? { ...x, active: v } : x)) })))) return;
            toast(v ? "RRPP activado" : "RRPP dado de baja", { kind: "success", body: v ? "Su enlace vuelve a vender." : "Su enlace deja de vender entradas." });
          }}
        />
      </View>

      <View>
        <Eyebrow>Noche a noche</Eyebrow>
        {nights.length ? (
          <Boxed>
            {nights.map((n, i) => {
              const ev = data.events.find((e) => e.id === n.eventId);
              return (
                <BoxRow key={n.eventId} last={i === nights.length - 1}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <PText v="h3" numberOfLines={1}>{ev?.name ?? ""}</PText>
                    <PText v="tiny" numberOfLines={1}>
                      {`${ev ? shortDay(ev.doorsOpen) : ""}${settled.has(n.eventId) ? " · pagada" : ""} · ${n.sold} vendidas · ${n.list} lista · ${n.scanned} entraron`}
                    </PText>
                  </View>
                  <PText v="h3">{money(n.commissionCents)}</PText>
                </BoxRow>
              );
            })}
          </Boxed>
        ) : (
          <Empty icon={Megaphone} title="Sin ventas todavía" body="Pásale su enlace: en cuanto venda la primera entrada aparecerá aquí." />
        )}
      </View>

      {p.payouts?.length ? (
        <View>
          <Eyebrow>Pagos</Eyebrow>
          <Boxed>
            {p.payouts.map((pay, i, all) => (
              <BoxRow key={i} last={i === all.length - 1}>
                <PText v="small" color={C.text} style={{ flex: 1 }}>{`${shortDay(pay.at)} · ${pay.scanned} entradas`}</PText>
                <Pill label={money(pay.amountCents)} tone="success" />
              </BoxRow>
            ))}
          </Boxed>
        </View>
      ) : null}
    </Sheet>
  );
}

type RuleKind = "per_scan" | "tiers";
type UniChoice = "ua" | "umh" | "ceu" | "other";

function NewPromoterDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update } = usePro();
  const [name, setName] = React.useState("");
  const [uni, setUni] = React.useState<UniChoice>("ua");
  const [code, setCode] = React.useState("");
  const [codeTouched, setCodeTouched] = React.useState(false);
  const [phone, setPhone] = React.useState("");
  const [kind, setKind] = React.useState<RuleKind>("per_scan");
  const [perScan, setPerScan] = React.useState("1");
  const [upTo, setUpTo] = React.useState("25");
  const [low, setLow] = React.useState("0,50");
  const [high, setHigh] = React.useState("1,50");

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setUni("ua");
    setCode("");
    setCodeTouched(false);
    setPhone("");
    setKind("per_scan");
  }, [open]);

  React.useEffect(() => {
    if (!codeTouched) setCode(name.trim() ? promoterCode(name) : "");
  }, [name, codeTouched]);

  const cents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100) || 0;
  const spec: ProCommissionRule =
    kind === "per_scan" ? { kind: "per_scan", cents: cents(perScan) } : { kind: "tiers", upTo: Math.max(1, Number(upTo) || 25), lowCents: cents(low), highCents: cents(high) };
  const taken = data.promoters.some((p) => p.code.toLowerCase() === code.trim().toLowerCase());
  const valid = name.trim().length > 2 && code.trim().length >= 3 && !taken;
  const university = uni === "ua" ? UNIVERSITIES[0] : uni === "umh" ? UNIVERSITIES[1] : uni === "ceu" ? UNIVERSITIES[2] : undefined;

  const save = async () => {
    const promoter: ProPromoter = {
      id: localId("rp"),
      name: name.trim(),
      university,
      code: code.trim().toLowerCase(),
      listSize: 0,
      sold: 0,
      checkedIn: 0,
      commissionCents: 0,
      rule: ruleLabel(spec),
      active: true,
      spec,
      phone: phone.trim() || undefined,
      since: new Date().toISOString(),
      settledEventIds: [],
      payouts: [],
    };
    if (!(await update("rrpp.create", (d) => ({ ...d, promoters: [...d.promoters, promoter] })))) return;
    toast("RRPP dado de alta", { kind: "success", body: `Su enlace: ${promoterLink(promoter.code, data.space.slug)}` });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Alta de RRPP"
      description="Con su enlace propio y la comisión calculada en puerta."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Dar de alta" onPress={() => void save()} disabled={!valid} />
        </>
      }
    >
      <Field label="Nombre">
        <Input value={name} onChangeText={setName} placeholder="Nombre y apellido" label="Nombre" autoCapitalize="words" />
      </Field>
      <Field label="Universidad">
        <ChoiceGrid
          value={uni}
          onChange={setUni}
          options={[
            { value: "ua", label: "UA" },
            { value: "umh", label: "UMH" },
            { value: "ceu", label: "CEU" },
            { value: "other", label: "Otra" },
          ]}
        />
      </Field>
      <Field label="Código" hint={taken ? "Ya lo usa otro RRPP" : code ? promoterLink(code, data.space.slug) : undefined}>
        <Input
          value={code}
          label="Código"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(v) => {
            setCodeTouched(true);
            setCode(v.replace(/\s+/g, "").toLowerCase());
          }}
          style={taken ? { borderColor: C.error } : undefined}
        />
      </Field>
      <Field label="Teléfono">
        <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="600 000 000" label="Teléfono" />
      </Field>
      <Field label="Regla de comisión" hint="Siempre por entrada escaneada en puerta, nunca por nombre apuntado.">
        <ChoiceGrid
          value={kind}
          onChange={setKind}
          options={[
            { value: "per_scan", label: "Fija por entrada", hint: "Lo mismo por cada persona" },
            { value: "tiers", label: "Por tramos", hint: "Premia a quien más mueve" },
          ]}
        />
      </Field>
      {kind === "per_scan" ? (
        <Field label="Euros por entrada escaneada">
          <Input value={perScan} onChangeText={setPerScan} keyboardType="decimal-pad" label="Euros por entrada escaneada" />
        </Field>
      ) : (
        <View style={{ flexDirection: "row", gap: S.sm }}>
          <View style={{ flex: 1 }}>
            <Field label="Hasta">
              <Input value={upTo} onChangeText={setUpTo} keyboardType="number-pad" label="Hasta cuántas entradas" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="€ primeras">
              <Input value={low} onChangeText={setLow} keyboardType="decimal-pad" label="Euros por las primeras" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="€ a partir">
              <Input value={high} onChangeText={setHigh} keyboardType="decimal-pad" label="Euros a partir de ahí" />
            </Field>
          </View>
        </View>
      )}
      <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.md }}>
        <Text style={{ fontSize: 14, color: C.muted }} maxFontSizeMultiplier={1.4}>
          <Text style={{ fontFamily: FONT.semibold, color: C.text }}>{`${ruleLabel(spec)}.`}</Text>
          {` Si trae 40 personas que entran, cobra ${money(commissionFor(spec, 40))}.`}
        </Text>
      </View>
    </Sheet>
  );
}
