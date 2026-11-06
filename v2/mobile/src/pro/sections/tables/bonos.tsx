import React from "react";
import { Text, View } from "react-native";
import { Coins, Pencil, Plus, Ticket, Users, Wallet, X } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProBono, ProBonoTemplate } from "../../../../../shared/pro/tables-types";
import { bonoRemaining, bonoSummary, consumeBono } from "../../../../../shared/pro/tables-ops";
import {
  bonoHistory,
  bonoNudgeMessage,
  bonoSaving,
  bonoUnitCents,
  bonoUsageByMember,
  bonosByState,
  bonosToNudge,
  sellBono,
} from "../../../../../shared/pro/tables-day";
import { localDate, money, plural, relative, shortDay, time } from "../../../../../shared/pro/format";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
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
  Pill,
  Segmented,
  Sheet,
  Stepper,
  Tip,
} from "../../kit";
import { MoneyField, OpsMissing, WhatsAppButton, eurosText, parseEuros, useTablesOps } from "./ops";

/**
 * Bonos prepago de cafetería y bar, versión nativa de web/.../tables/bonos.tsx:
 * se vende en la barra (se cobra en el TPV), se descuenta cada uso y se ve lo
 * que ya está cobrado y queda por servir. Un bono puede ser de un grupo de
 * estudio: lo gastan varios y queda apuntado quién.
 */

type Tab = "live" | "spent";

export default function TablesBonos() {
  const { ops } = useTablesOps();
  if (!ops) {
    return (
      <ProPage>
        <PageHeader eyebrow="Bonos" title="Bonos prepago" />
        <OpsMissing icon={Ticket} title="Todavía no vendes bonos" />
      </ProPage>
    );
  }
  return <BonosView />;
}

function BonosView() {
  const { data, now, vertical } = usePro();
  const { ops } = useTablesOps();
  const [tab, setTab] = React.useState<Tab>("live");
  const [selling, setSelling] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [template, setTemplate] = React.useState<ProBonoTemplate | "new" | null>(null);
  const [limit, setLimit] = React.useState(40);
  if (!ops) return null;
  const today = localDate(now);
  const summary = bonoSummary(ops, today);
  const { live, spent } = bonosByState(ops);
  const list = tab === "live" ? live : spent;
  const nudge = bonosToNudge(ops, now);
  const templates = ops.bonoTemplates;
  const canSell = templates.some((t) => t.active);
  const drink = vertical.id === "bar" ? "cañas" : "cafés";

  return (
    <ProPage>
      <PageHeader
        eyebrow="Bonos"
        title="Bonos prepago"
        description={
          summary.activeBonos
            ? `${plural(summary.activeBonos, "bono vivo", "bonos vivos")} con ${plural(summary.pendingUses, "uso", "usos")} por servir. Ya tienes cobrados ${money(summary.pendingValueCents, { round: true })} de lo que te van a tomar.`
            : `Vende ${drink} por adelantado: cobras hoy lo que te toman en el mes.`
        }
        actions={<PButton label="Vender bono" icon={Plus} disabled={!canSell} onPress={() => setSelling(true)} />}
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

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "live", label: "Vivos", count: live.length },
          { value: "spent", label: "Gastados", count: spent.length },
        ]}
      />
      <Panel flush>
        {list.length ? (
          <>
            {list.slice(0, limit).map((b, i, arr) => (
              <BonoRow key={b.id} bono={b} last={i === arr.length - 1 && list.length <= limit} onOpen={() => setOpenId(b.id)} />
            ))}
            {list.length > limit ? (
              <View style={{ padding: S.md }}>
                <PButton label="Ver más" variant="ghost" full onPress={() => setLimit((l) => l + 40)} />
              </View>
            ) : null}
          </>
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
              tab === "live" && canSell ? <PButton label="Vender el primero" onPress={() => setSelling(true)} /> : undefined
            }
          />
        )}
      </Panel>

      {nudge.length ? (
        <Panel title="Recuérdaselo" description="Les queda uno o hace tres semanas que no lo usan." flush>
          {nudge.slice(0, 5).map((b, i, arr) => {
            const t = templates.find((x) => x.id === b.templateId);
            return (
              <ListRow key={b.id} last={i === arr.length - 1}>
                <View style={{ flex: 1 }}>
                  <PText v="h3" numberOfLines={1}>
                    {b.clientName}
                  </PText>
                  <PText v="tiny">{`Quedan ${bonoRemaining(b)} de ${b.uses}`}</PText>
                </View>
                <WhatsAppButton
                  phone={b.phone}
                  label="Avisar"
                  message={bonoNudgeMessage(b, t?.itemName ?? "consumición", data.space.name)}
                />
              </ListRow>
            );
          })}
        </Panel>
      ) : null}

      <Panel
        title="Tus bonos"
        description="Lo que vendes en la barra y en tu ficha de Franky."
        action={<PButton label="Nuevo" icon={Plus} variant="outline" small onPress={() => setTemplate("new")} />}
        flush
      >
        {templates.length ? (
          templates.map((t, i) => (
            <ListRow
              key={t.id}
              last={i === templates.length - 1}
              onPress={() => setTemplate(t)}
              accessibilityLabel={`Editar ${t.name}`}
            >
              <View style={{ flex: 1, gap: 2, opacity: t.active ? 1 : 0.6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {t.name}
                  </PText>
                  {!t.active ? <Pill label="Pausado" /> : null}
                </View>
                <PText v="tiny">
                  {`${t.uses} × ${t.itemName.toLowerCase()}, ${money(bonoUnitCents(t))} cada uno${bonoSaving(t) ? `, ahorra ${money(bonoSaving(t))}` : ""}`}
                </PText>
              </View>
              <PText v="h3">{money(t.priceCents)}</PText>
              <Pencil size={14} color={C.muted} strokeWidth={1.9} />
            </ListRow>
          ))
        ) : (
          <Empty
            icon={Ticket}
            title="Crea tu primer bono"
            body={`Por ejemplo: 10 ${drink} por el precio de 8,5.`}
            action={<PButton label="Crear bono" onPress={() => setTemplate("new")} />}
          />
        )}
      </Panel>

      <Tip title="Cómo se cobra">
        {`El bono se cobra entero en tu TPV al venderlo. Aquí solo descuentas cada ${vertical.id === "bar" ? "caña" : "café"} y ves lo que queda. Tus clientes con Franky ven sus usos en el móvil.`}
      </Tip>

      <SellSheet open={selling} onClose={() => setSelling(false)} />
      <BonoSheet id={openId} onClose={() => setOpenId(null)} />
      <TemplateSheet template={template} onClose={() => setTemplate(null)} />
    </ProPage>
  );
}

function BonoRow({ bono, onOpen, last }: { bono: ProBono; onOpen: () => void; last?: boolean }) {
  const { now } = usePro();
  const { ops, save } = useTablesOps();
  const left = bonoRemaining(bono);
  const t = ops?.bonoTemplates.find((x) => x.id === bono.templateId);
  const lastUse = bono.usedAt[bono.usedAt.length - 1];
  const group = Boolean(bono.members?.length);

  const spend = async () => {
    // En un bono de grupo hay que decir quién lo gasta: se abre la ficha.
    if (group) return onOpen();
    const ok = await save("bono.use", (o) => ({
      ...o,
      bonos: o.bonos.map((b) => (b.id === bono.id ? consumeBono(b, now.toISOString()) : b)),
    }));
    if (ok)
      toast("Descontado", {
        kind: "success",
        body: left - 1 > 0 ? `A ${bono.clientName.split(" ")[0]} le quedan ${left - 1}.` : "Era el último: ofrécele otro.",
      });
  };

  return (
    <View
      style={{
        paddingHorizontal: S.lg,
        paddingVertical: S.md,
        gap: S.sm,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: C.borderLight,
      }}
    >
      <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Abrir bono de ${bono.clientName}`} style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
        {group ? (
          <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" }}>
            <Users size={16} color={C.blue} strokeWidth={1.8} />
          </View>
        ) : (
          <PAvatar name={bono.clientName} toneKey="violet" size={34} />
        )}
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
              {bono.clientName}
            </PText>
            {group ? <Pill tone="violet" label={`${bono.members!.length} en el grupo`} /> : null}
            {bono.channel === "franky" ? <Pill label="Franky" /> : null}
          </View>
          <PText v="tiny" numberOfLines={1}>
            {`${t?.name ?? "Bono"}, ${lastUse ? `último uso ${relative(lastUse, now.getTime())}` : `vendido ${relative(bono.soldAt, now.getTime())}`}`}
          </PText>
          <Meter value={bono.usedAt.length} max={bono.uses} tone={left <= 1 ? "warning" : "violet"} />
        </View>
        <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: C.text }} maxFontSizeMultiplier={1.2}>
          {left}
          <Text style={{ fontSize: 13, color: C.muted }}>{`/${bono.uses}`}</Text>
        </Text>
      </Tap>
      {left > 0 ? <PButton label="Descontar" variant="secondary" small full onPress={() => void spend()} /> : null}
    </View>
  );
}

function BonoSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { now } = usePro();
  const { ops, save, pending } = useTablesOps();
  const bono = ops?.bonos.find((b) => b.id === id) ?? null;
  const [who, setWho] = React.useState("");

  React.useEffect(() => {
    setWho(bono?.members?.[0] ?? "");
    // Al cambiar de bono.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!bono || !ops) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
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
    if (ok)
      toast("Descontado", {
        kind: "success",
        body: group ? `${who.split(" ")[0]} del grupo ${bono.clientName}.` : bono.clientName,
      });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={bono.clientName}
      description={`${t?.name ?? "Bono"}, vendido el ${shortDay(bono.soldAt)} por ${money(bono.paidCents)}`}
      footer={
        left > 0 ? (
          <PButton
            label={`Descontar ${t?.itemName.toLowerCase() ?? "uno"}${group && who ? ` a ${who.split(" ")[0]}` : ""}`}
            disabled={pending || (group && !who)}
            onPress={() => void spend()}
          />
        ) : undefined
      }
    >
      <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg, alignItems: "center", gap: S.xs }}>
        <Text style={{ fontFamily: FONT.display, fontSize: 40, letterSpacing: -1, color: C.text }} maxFontSizeMultiplier={1.2}>
          {left}
          <Text style={{ fontSize: 18, color: C.muted }}>{`/${bono.uses}`}</Text>
        </Text>
        <PText v="small">{left === 1 ? "queda por gastar" : "quedan por gastar"}</PText>
        <View style={{ alignSelf: "stretch", marginTop: S.sm }}>
          <Meter value={bono.usedAt.length} max={bono.uses} />
        </View>
      </View>

      {group ? (
        <>
          {left > 0 ? (
            <Field label="¿Quién lo gasta ahora?">
              <ChoiceGrid value={who} onChange={setWho} options={bono.members!.map((m) => ({ value: m, label: m.split(" ")[0] }))} />
            </Field>
          ) : null}
          <Field label="Lo que lleva cada uno">
            <View style={{ gap: S.sm }}>
              {usage.map((u) => (
                <View key={u.name} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                  <PAvatar name={u.name} toneKey="violet" size={26} />
                  <PText v="body" numberOfLines={1} style={{ flex: 1 }}>
                    {u.name}
                  </PText>
                  <PText v="h3">{String(u.uses)}</PText>
                </View>
              ))}
            </View>
          </Field>
        </>
      ) : null}

      <Field label="Usos">
        {history.length ? (
          <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border }}>
            {history.map((h, i) => (
              <View
                key={`${h.at}-${i}`}
                style={{ flexDirection: "row", gap: S.md, paddingHorizontal: S.md, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.borderLight }}
              >
                <PText v="small" style={{ width: 96 }}>
                  {shortDay(h.at)}
                </PText>
                <PText v="body" style={{ width: 48 }}>
                  {time(h.at)}
                </PText>
                {group ? (
                  <PText v="body" numberOfLines={1} style={{ flex: 1 }}>
                    {h.by}
                  </PText>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <PText v="small">Todavía no lo ha usado.</PText>
        )}
      </Field>
    </Sheet>
  );
}

function SellSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now } = usePro();
  const { ops, save, pending } = useTablesOps();
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
  const needle = name.trim().toLowerCase();
  const client = data.clients.find((c) => c.name.toLowerCase() === needle);
  // Sugerencias de la ficha de clientes mientras se escribe (como el datalist de la web).
  const suggestions =
    group === "no" && needle.length >= 2 && !client
      ? data.clients.filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 4)
      : [];
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
    toast("Bono vendido", {
      kind: "success",
      body: `${template.name} para ${bono.clientName}. Cóbralo en tu TPV: ${money(template.priceCents)}.`,
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Vender bono"
      description="Se cobra en tu TPV. Aquí queda apuntado para ir descontando."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label={`Vender${template ? ` por ${money(template.priceCents)}` : ""}`} disabled={pending || !valid} onPress={() => void submit()} />
        </>
      }
    >
      <Field label="Bono">
        <ChoiceGrid value={templateId} onChange={setTemplateId} options={active.map((t) => ({ value: t.id, label: t.name, hint: money(t.priceCents) }))} />
      </Field>
      <Field label="¿Para un grupo de estudio?" hint="Lo gastan varios y queda apuntado quién.">
        <ChoiceGrid
          value={group}
          onChange={setGroup}
          options={[
            { value: "no", label: "Para una persona" },
            { value: "si", label: "Para un grupo" },
          ]}
        />
      </Field>
      <Field label={group === "si" ? "Nombre del grupo" : "Nombre"}>
        <Input
          label={group === "si" ? "Nombre del grupo" : "Nombre"}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          placeholder={group === "si" ? "TFG de Teleco" : "Nombre y apellido"}
        />
        {suggestions.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
            {suggestions.map((c) => (
              <PButton key={c.id} label={c.name} variant="outline" small onPress={() => setName(c.name)} />
            ))}
          </View>
        ) : null}
      </Field>
      <Field label="Teléfono" hint="Para recordarle los usos que le quedan.">
        <Input label="Teléfono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder={client?.phone ?? "600 000 000"} />
      </Field>
      {group === "si" ? (
        <Field label="Quién está en el grupo" hint={members.length < 2 ? "Añade al menos dos personas." : undefined}>
          {members.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
              {members.map((m) => (
                <Tap
                  key={m}
                  onPress={() => setMembers((list) => list.filter((x) => x !== m))}
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar a ${m}`}
                  style={{ minHeight: 38, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: C.border, flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <PText v="small" color={C.text}>
                    {m}
                  </PText>
                  <X size={13} color={C.muted} />
                </Tap>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: S.sm }}>
            <View style={{ flex: 1 }}>
              <Input label="Nombre de la persona" value={member} onChangeText={setMember} placeholder="Nombre" onSubmitEditing={addMember} returnKeyType="done" />
            </View>
            <PButton label="Añadir" variant="outline" disabled={!member.trim()} onPress={addMember} />
          </View>
        </Field>
      ) : null}
    </Sheet>
  );
}

function TemplateSheet({ template, onClose }: { template: ProBonoTemplate | "new" | null; onClose: () => void }) {
  const { data, vertical } = usePro();
  const { save, pending } = useTablesOps();
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
  const needle = itemName.trim().toLowerCase();
  const menuMatches =
    needle.length >= 2 && !menuItem ? data.menu.filter((m) => m.name.toLowerCase().includes(needle)).slice(0, 4) : [];

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
      bonoTemplates: base ? o.bonoTemplates.map((t) => (t.id === base.id ? next : t)) : [...o.bonoTemplates, next],
    }));
    if (!ok) return;
    toast(isNew ? "Bono creado" : "Bono guardado", { kind: "success", body: `${next.name}: ${money(next.priceCents)}.` });
    onClose();
  };

  return (
    <Sheet
      open={template !== null}
      onClose={onClose}
      title={isNew ? "Nuevo bono" : "Editar bono"}
      description="Los bonos ya vendidos no cambian."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar" disabled={pending || !valid} onPress={() => void submit()} />
        </>
      }
    >
      <Field label="Nombre">
        <Input label="Nombre" value={name} onChangeText={setName} />
      </Field>
      <Field label="Qué se descuenta en cada uso" hint="Mejor si coincide con un producto de tu carta.">
        <Input label="Qué se descuenta en cada uso" value={itemName} onChangeText={setItemName} />
        {menuMatches.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
            {menuMatches.map((m) => (
              <PButton key={m.id} label={m.name} variant="outline" small onPress={() => setItemName(m.name)} />
            ))}
          </View>
        ) : null}
      </Field>
      <Field label="Usos">
        <Stepper label="Usos" value={uses} min={2} max={30} onChange={setUses} />
      </Field>
      <MoneyField
        label="Precio del bono"
        value={price}
        onChange={setPrice}
        hint={regular ? `Sin bono serían ${money(regular)}.${cents ? ` Ahorra ${money(Math.max(0, regular - cents))}.` : ""}` : undefined}
      />
      <Field label="A la venta">
        <ChoiceGrid
          value={active}
          onChange={setActive}
          options={[
            { value: "si", label: "Sí" },
            { value: "no", label: "Pausado" },
          ]}
        />
      </Field>
    </Sheet>
  );
}
