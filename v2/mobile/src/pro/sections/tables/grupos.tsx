import React from "react";
import { Text, View } from "react-native";
import { ChefHat, ChevronDown, ChevronUp, Plus, Trash2, Users, UtensilsCrossed } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProBooking, ProGroupRequest } from "../../../../../shared/pro/types";
import type { ProGroupChoice, ProGroupDeal, ProGroupMenu } from "../../../../../shared/pro/tables-types";
import { GROUP_STAGE_LABEL, choiceTally, dealFor, groupQuoteMessage } from "../../../../../shared/pro/tables-ops";
import { addDays, capitalize, dayLabel, localDate, money, plural, time } from "../../../../../shared/pro/format";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import {
  ChoiceGrid,
  Detail,
  Empty,
  Field,
  IconButton,
  Input,
  Kpi,
  KpiRow,
  ListRow,
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
import CommonGrupos from "../common/grupos";
import { MoneyField, SoftNote, WhatsAppButton, eurosText, parseEuros, useTablesOps } from "./ops";
import { Card } from "./ui";

/**
 * Grupos con menú cerrado, señal y cierre de número, versión nativa de
 * web/.../tables/grupos.tsx. Del presupuesto por WhatsApp a lo que tiene que
 * preparar cocina (platos elegidos y alergias), sin cien mensajes.
 */

type Tab = "peticiones" | "menus";
type Filter = "open" | "confirmed" | "all";
type Tone = "violet" | "warning" | "success" | "neutral" | "info";

const REQUEST_LABEL: Record<ProGroupRequest["status"], string> = {
  new: "Nueva",
  quoted: "Presupuesto enviado",
  accepted: "Aceptada",
  declined: "Descartada",
};

/** Etapa visible: la del trato si existe; si no, la de la petición. */
function stageOf(g: ProGroupRequest, deal?: ProGroupDeal): { label: string; tone: Tone } {
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
  if (!ops) return null;
  const fresh = data.groupRequests.filter((g) => g.status === "new");
  const confirmed = data.groupRequests.filter((g) => g.status === "accepted");
  const people = confirmed.reduce((a, g) => a + (dealFor(ops, g.id)?.finalPeople ?? g.people), 0);
  const deposits = ops.groupDeals.filter((d) => d.depositPaidAt).reduce((a, d) => a + d.depositCents, 0);
  const pipeline = data.groupRequests
    .filter((g) => g.status === "quoted" || g.status === "accepted")
    .reduce((a, g) => a + (dealFor(ops, g.id)?.perPersonCents ?? g.quoteCents ?? g.budgetPerPersonCents) * g.people, 0);

  return (
    <ProPage>
      <PageHeader
        eyebrow="Grupos"
        title="Clases, asociaciones y celebraciones"
        description={
          fresh.length
            ? `${plural(fresh.length, "grupo espera", "grupos esperan")} tu presupuesto. Con un menú cerrado guardado, respondes en dos toques.`
            : `${plural(confirmed.length, "grupo confirmado", "grupos confirmados")} con ${plural(people, "persona", "personas")}.`
        }
      >
        <Segmented<Tab>
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
    </ProPage>
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
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "open", label: "Abiertas" },
          { value: "confirmed", label: "Confirmadas" },
          { value: "all", label: "Todas" },
        ]}
      />
      <Panel flush>
        {list.length ? (
          list.map((g, i) => {
            const deal = dealFor(ops, g.id);
            const stage = stageOf(g, deal);
            const menu = ops.groupMenus.find((m) => m.id === deal?.menuId);
            const tally = menu && deal ? choiceTally(menu, deal) : null;
            return (
              <ListRow key={g.id} last={i === list.length - 1} onPress={() => setOpen(g.id)} accessibilityLabel={`${g.kind}, ${g.organization}`}>
                <View style={{ width: 44, height: 44, borderRadius: R.md, backgroundColor: C.input, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: FONT.heading, fontSize: 15, color: C.text }} maxFontSizeMultiplier={1.2}>
                    {deal?.finalPeople ?? g.people}
                  </Text>
                  <Text style={{ fontSize: 9.5, color: C.muted }} maxFontSizeMultiplier={1.2}>
                    pers.
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3" numberOfLines={1}>
                    {g.kind}
                  </PText>
                  <PText v="tiny" numberOfLines={2}>
                    {`${g.organization}, ${capitalize(dayLabel(g.date))}${tally && tally.answered ? `, ${tally.answered} han elegido plato` : ""}`}
                  </PText>
                </View>
                <Pill tone={stage.tone} label={stage.label} />
              </ListRow>
            );
          })
        ) : (
          <Empty
            icon={Users}
            title="No hay grupos aquí"
            body="Cuando una clase, una delegación o una asociación te pida presupuesto desde Franky, aparecerá en esta lista."
          />
        )}
      </Panel>
      <GroupSheet id={open} onClose={() => setOpen(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Detalle de un grupo                                                  */
/* ------------------------------------------------------------------ */

function GroupSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, now, vertical, update: storeUpdate } = usePro();
  const { ops, save } = useTablesOps();
  const g = data.groupRequests.find((x) => x.id === id) ?? null;
  const deal = g && ops ? dealFor(ops, g.id) : undefined;
  const [menuId, setMenuId] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [depositPct, setDepositPct] = React.useState(20);
  const [closeDays, setCloseDays] = React.useState(2);
  const [finalPeople, setFinalPeople] = React.useState(0);
  const [method, setMethod] = React.useState<NonNullable<ProGroupDeal["depositMethod"]>>("bizum");
  const [showMessage, setShowMessage] = React.useState(false);

  React.useEffect(() => {
    if (!g || !ops) return;
    const suggested =
      deal?.menuId ??
      ops.groupMenus.find((m) => g.kind.toLowerCase().includes(m.occasion.toLowerCase()))?.id ??
      ops.groupMenus[0]?.id ??
      "";
    const menu = ops.groupMenus.find((m) => m.id === suggested);
    setMenuId(suggested);
    setPrice(eurosText(deal?.perPersonCents ?? menu?.priceCents ?? g.quoteCents ?? g.budgetPerPersonCents));
    setDepositPct(menu?.depositPct ?? 20);
    setCloseDays(2);
    setFinalPeople(deal?.finalPeople ?? g.people);
    setMethod("bizum");
    setShowMessage(false);
    // Solo al abrir otro grupo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!g || !ops) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const request = g;
  const menu = ops.groupMenus.find((m) => m.id === menuId);
  const perPerson = parseEuros(price) ?? 0;
  const deposit = Math.round((perPerson * g.people * depositPct) / 100 / 100) * 100;
  const closeBy = addDays(localDate(g.date), -closeDays);
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
    return storeUpdate(`group.${status ?? "booking"}`, (d) => ({
      ...d,
      groupRequests: status
        ? d.groupRequests.map((x) => (x.id === request.id ? { ...x, status, quoteCents: perPerson || x.quoteCents } : x))
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
    if (await saveDeal("group.quote", next, "quoted"))
      toast("Presupuesto guardado", { kind: "success", body: `${money(perPerson)} por persona. Envíalo en WhatsApp.` });
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
      toast("Señal recibida", { kind: "success", body: "El grupo ya está en tu libro de reservas." });
  };

  const closeNumber = async () => {
    if (!deal) return;
    if (await saveDeal("group.close", { ...deal, stage: "closed", finalPeople }))
      toast("Número cerrado", { kind: "success", body: `${finalPeople} personas. Cocina ya lo ve en Hoy.` });
  };

  const served = async () => {
    if (!deal) return;
    if (await saveDeal("group.served", { ...deal, stage: "served" })) {
      toast("Grupo servido", { kind: "success" });
      onClose();
    }
  };

  const decline = async () => {
    if (await storeRequest("declined")) {
      toast("Petición descartada", { kind: "info" });
      onClose();
    }
  };

  const quoting = !deal || deal.stage === "quoted";

  return (
    <Sheet
      open
      onClose={onClose}
      title={g.kind}
      description={`${g.organization}, ${plural(g.people, "persona", "personas")}, ${dateLabel}`}
      footer={
        g.status === "declined" ? undefined : quoting ? (
          <>
            {g.status === "new" ? <PButton label="No podemos" variant="ghost" onPress={() => void decline()} /> : null}
            {deal ? <PButton label="Señal recibida" variant="outline" onPress={() => void depositReceived()} /> : null}
            <WhatsAppButton
              share
              variant="dark"
              small={false}
              label={deal ? "Reenviar" : "Enviar presupuesto"}
              message={message}
              onOpen={() => void sendQuote()}
            />
          </>
        ) : deal?.stage === "deposit" ? (
          <PButton label={`Cerrar número: ${finalPeople}`} onPress={() => void closeNumber()} />
        ) : deal?.stage === "closed" ? (
          <PButton label="Marcar como servido" onPress={() => void served()} />
        ) : undefined
      }
    >
      <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.md, gap: S.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
          <PText v="h3" style={{ flex: 1 }}>
            {g.organizer}
          </PText>
          <Pill tone={stage.tone} label={stage.label} />
        </View>
        <PText v="body" color={C.muted}>{`“${g.message}”`}</PText>
        <PText v="tiny">{`Presupuesto que indican: ${money(g.budgetPerPersonCents)} por persona`}</PText>
      </View>

      {quoting ? (
        <>
          <Field label="Menú cerrado">
            <ChoiceGrid
              value={menuId}
              onChange={(v) => {
                setMenuId(v);
                const m = ops.groupMenus.find((x) => x.id === v);
                if (m) {
                  setPrice(eurosText(m.priceCents));
                  setDepositPct(m.depositPct);
                }
              }}
              options={[
                ...ops.groupMenus.map((m) => ({ value: m.id, label: m.name, hint: money(m.priceCents) })),
                { value: "", label: "Sin menú", hint: "precio libre" },
              ]}
            />
          </Field>
          {menu ? <MenuPreview menu={menu} /> : null}
          <MoneyField
            label="Precio por persona"
            value={price}
            onChange={setPrice}
            hint={perPerson ? `Total ${money(perPerson * g.people, { round: true })}` : undefined}
          />
          <Field label="Señal" hint={deposit ? money(deposit, { round: true }) : "Sin señal"}>
            <Stepper label="Señal en porcentaje" value={depositPct} onChange={setDepositPct} min={0} max={100} step={5} format={(v) => `${v} %`} />
          </Field>
          <Field label="Cerrar el número" hint={`${dayLabel(`${closeBy}T12:00:00Z`)}`}>
            <Stepper label="Días antes para cerrar el número" value={closeDays} onChange={setCloseDays} min={0} max={14} format={(v) => plural(v, "día antes", "días antes")} />
          </Field>
          {deal ? (
            <Field label="Cómo han pagado la señal">
              <ChoiceGrid
                value={method}
                onChange={setMethod}
                options={[
                  { value: "bizum", label: "Bizum" },
                  { value: "transferencia", label: "Transferencia" },
                  { value: "efectivo", label: "Efectivo" },
                ]}
              />
            </Field>
          ) : null}
          <Tap
            onPress={() => setShowMessage((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showMessage }}
            style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md }}
          >
            <PText v="h3">Mensaje que se envía</PText>
            {showMessage ? <ChevronUp size={16} color={C.muted} /> : <ChevronDown size={16} color={C.muted} />}
          </Tap>
          {showMessage ? <SoftNote tone="neutral">{message}</SoftNote> : null}
        </>
      ) : deal ? (
        <>
          <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md }}>
            <Detail label="Menú" value={menu?.name ?? "Precio libre"} />
            <Detail label="Precio" value={`${money(deal.perPersonCents)} por persona`} />
            <Detail
              label="Señal"
              value={`${money(deal.depositCents)} ${deal.depositPaidAt ? `cobrada (${deal.depositMethod ?? "a mano"})` : "pendiente"}`}
              last={!deal.closeBy}
            />
            {deal.closeBy ? <Detail label="Número cerrado el" value={dayLabel(`${deal.closeBy}T12:00:00Z`)} last /> : null}
          </View>
          {deal.stage === "deposit" ? (
            <Field label="Personas que vienen al final">
              <Stepper label="Personas finales" value={finalPeople} onChange={setFinalPeople} min={1} max={200} />
            </Field>
          ) : null}
        </>
      ) : null}

      {deal && menu && deal.stage !== "quoted" ? <ChoicesBlock deal={deal} menu={menu} request={g} /> : null}
    </Sheet>
  );
}

function MenuPreview({ menu }: { menu: ProGroupMenu }) {
  return (
    <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.md, gap: 4 }}>
      {menu.courses.map((c) => (
        <View key={c.label} style={{ flexDirection: "row", gap: S.sm }}>
          <PText v="h3" style={{ width: 110 }}>
            {c.label}
          </PText>
          <PText v="body" color={C.muted} style={{ flex: 1 }}>
            {c.options.join(" o ")}
          </PText>
        </View>
      ))}
      {menu.includes ? <PText v="tiny">{`Incluye ${menu.includes.toLowerCase()}`}</PText> : null}
    </View>
  );
}

/** Quién ha elegido qué: se apunta a mano o con lo que pasa el delegado. */
function ChoicesBlock({ deal, menu, request }: { deal: ProGroupDeal; menu: ProGroupMenu; request: ProGroupRequest }) {
  const { data } = usePro();
  const { save } = useTablesOps();
  const [name, setName] = React.useState("");
  const [dishes, setDishes] = React.useState<string[]>(menu.courses.map((c) => c.options[0] ?? ""));
  const [allergies, setAllergies] = React.useState("");
  const [showList, setShowList] = React.useState(false);
  const tally = choiceTally(menu, { ...deal, finalPeople: deal.finalPeople ?? request.people });
  const ask = `Hola ${request.organizer.split(" ")[0]}, para tenerlo todo listo en ${data.space.name}, ¿nos pasas qué elige cada uno?\n${menu.courses
    .filter((c) => c.options.length > 1)
    .map((c) => `${c.label}: ${c.options.join(" o ")}`)
    .join("\n")}\nY avísanos de cualquier alergia. ¡Gracias!`;

  const add = async () => {
    const choice: ProGroupChoice = { id: localId("ch"), name: name.trim(), dishes, allergies: allergies.trim() || undefined };
    const ok = await save("group.choice", (o) => ({
      ...o,
      groupDeals: o.groupDeals.map((d) => (d.requestId === deal.requestId ? { ...d, choices: [...d.choices, choice] } : d)),
    }));
    if (!ok) return;
    setName("");
    setAllergies("");
    toast("Elección apuntada", { kind: "success", body: choice.name });
  };
  const remove = (id: string) =>
    save("group.choice.remove", (o) => ({
      ...o,
      groupDeals: o.groupDeals.map((d) => (d.requestId === deal.requestId ? { ...d, choices: d.choices.filter((c) => c.id !== id) } : d)),
    }));

  return (
    <View style={{ gap: S.md, borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: S.md }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <PText v="h2">Para cocina</PText>
          <PText v="small">
            {`${tally.answered} de ${deal.finalPeople ?? request.people} han elegido${tally.missing ? `, faltan ${tally.missing}` : ""}`}
          </PText>
        </View>
        <WhatsAppButton share label="Pedir elección" message={ask} />
      </View>
      {tally.courses
        .filter((c) => c.counts.length > 1)
        .map((c) => (
          <View key={c.label} style={{ borderRadius: R.md, backgroundColor: C.input, padding: S.md, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <ChefHat size={14} color={C.muted} strokeWidth={1.9} />
              <PText v="tiny" style={{ fontFamily: FONT.semibold }}>
                {c.label}
              </PText>
            </View>
            {c.counts.map((x) => (
              <View key={x.dish} style={{ flexDirection: "row", justifyContent: "space-between", gap: S.sm }}>
                <PText v="body" numberOfLines={1} style={{ flex: 1 }}>
                  {x.dish}
                </PText>
                <Text style={{ fontFamily: FONT.heading, fontSize: 15, color: C.text }} maxFontSizeMultiplier={1.2}>
                  {x.n}
                </Text>
              </View>
            ))}
          </View>
        ))}
      {tally.allergies.length ? (
        <SoftNote>
          {`${plural(tally.allergies.length, "alergia o dieta", "alergias o dietas")}: ${tally.allergies.map((a) => `${a.name} (${a.allergies.toLowerCase()})`).join(", ")}`}
        </SoftNote>
      ) : null}

      <Card style={{ gap: S.sm, marginBottom: 0 }}>
        <PText v="h3">Apuntar una elección</PText>
        <Input label="Nombre" value={name} onChangeText={setName} placeholder="Nombre" autoCapitalize="words" />
        {menu.courses.map((c, i) =>
          c.options.length > 1 ? (
            <Field key={c.label} label={c.label}>
              <ChoiceGrid
                value={dishes[i]}
                onChange={(v) => setDishes((prev) => prev.map((d, j) => (j === i ? v : d)))}
                options={c.options.map((o) => ({ value: o, label: o }))}
              />
            </Field>
          ) : null,
        )}
        <Input label="Alergias" value={allergies} onChangeText={setAllergies} placeholder="Alergias o dieta (opcional)" />
        <PButton label="Añadir" icon={Plus} variant="outline" disabled={name.trim().length < 2} onPress={() => void add()} />
      </Card>

      {deal.choices.length ? (
        <>
          <Tap
            onPress={() => setShowList((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showList }}
            style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <PText v="h3">{`Ver la lista (${deal.choices.length})`}</PText>
            {showList ? <ChevronUp size={16} color={C.muted} /> : <ChevronDown size={16} color={C.muted} />}
          </Tap>
          {showList
            ? deal.choices.map((c) => (
                <View key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                  <View style={{ flex: 1 }}>
                    <PText v="h3" numberOfLines={1}>
                      {c.name}
                    </PText>
                    <PText v="tiny" numberOfLines={2}>
                      {c.dishes.filter((_, i) => menu.courses[i]?.options.length > 1).join(", ")}
                      {c.allergies ? `, ${c.allergies}` : ""}
                    </PText>
                  </View>
                  <IconButton icon={Trash2} label={`Quitar a ${c.name}`} onPress={() => void remove(c.id)} />
                </View>
              ))
            : null}
        </>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Menús cerrados                                                       */
/* ------------------------------------------------------------------ */

function Menus() {
  const { ops } = useTablesOps();
  const [editing, setEditing] = React.useState<ProGroupMenu | "new" | null>(null);
  if (!ops) return null;
  return (
    <>
      <View style={{ marginBottom: S.lg }}>
        <PButton label="Nuevo menú cerrado" icon={Plus} onPress={() => setEditing("new")} />
      </View>
      {ops.groupMenus.length ? (
        ops.groupMenus.map((m) => (
          <Tap key={m.id} onPress={() => setEditing(m)} accessibilityRole="button" accessibilityLabel={`Editar ${m.name}`}>
            <Card style={{ gap: S.sm }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: S.sm }}>
                <PText v="h2" style={{ flex: 1 }}>
                  {m.name}
                </PText>
                <PText v="h2">{money(m.priceCents)}</PText>
              </View>
              <PText v="tiny">
                {`${m.occasion}, desde ${m.minPeople} personas, ${m.depositPct ? `señal ${m.depositPct} %` : "sin señal"}`}
              </PText>
              <MenuPreview menu={m} />
            </Card>
          </Tap>
        ))
      ) : (
        <Panel>
          <Empty
            icon={UtensilsCrossed}
            title="Sin menús cerrados"
            body="Prepara dos o tres (previa, cena de clase, graduación) y responder a un grupo será cuestión de segundos."
          />
        </Panel>
      )}
      <MenuSheet menu={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function MenuSheet({ menu, onClose }: { menu: ProGroupMenu | "new" | null; onClose: () => void }) {
  const { save } = useTablesOps();
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
    setCourses(
      m
        ? m.courses.map((c) => ({ label: c.label, options: c.options.join(", ") }))
        : [
            { label: "Entrante", options: "" },
            { label: "Principal", options: "" },
            { label: "Postre", options: "" },
          ],
    );
    setIncludes(m?.includes ?? "Pan, bebida y café");
    setMinPeople(m?.minPeople ?? 10);
    setDepositPct(m?.depositPct ?? 20);
  }, [menu]);
  if (!menu) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
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
        .map((c) => ({
          label: c.label.trim() || "Plato",
          options: c.options
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean),
        })),
      includes: includes.trim(),
      minPeople,
      depositPct,
    };
    const ok = await save("group.menu", (o) => ({
      ...o,
      groupMenus: menu === "new" ? [...o.groupMenus, next] : o.groupMenus.map((m) => (m.id === next.id ? next : m)),
    }));
    if (!ok) return;
    toast("Menú guardado", { kind: "success", body: next.name });
    onClose();
  };
  const remove = async () => {
    if (menu === "new") return;
    if (await save("group.menu.remove", (o) => ({ ...o, groupMenus: o.groupMenus.filter((m) => m.id !== menu.id) }))) onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={menu === "new" ? "Nuevo menú cerrado" : menu.name}
      footer={
        <>
          {menu !== "new" ? <PButton label="Borrar" icon={Trash2} variant="ghost" onPress={() => void remove()} /> : null}
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar" disabled={!valid} onPress={() => void submit()} />
        </>
      }
    >
      <Field label="Nombre">
        <Input label="Nombre" value={name} onChangeText={setName} placeholder="Menú graduación" />
      </Field>
      <MoneyField label="Precio por persona" value={price} onChange={setPrice} />
      <Field label="Para qué ocasión">
        <Input label="Para qué ocasión" value={occasion} onChangeText={setOccasion} placeholder="Previa, cumpleaños, partido..." />
      </Field>
      <Field label="Platos" hint="Separa las opciones con comas: el grupo elige una de cada.">
        <View style={{ gap: S.sm }}>
          {courses.map((c, i) => (
            <View key={i} style={{ gap: 6, borderRadius: R.md, borderWidth: 1, borderColor: C.borderLight, padding: S.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Curso"
                    value={c.label}
                    onChangeText={(t) => setCourses((prev) => prev.map((x, j) => (j === i ? { ...x, label: t } : x)))}
                    placeholder="Curso"
                  />
                </View>
                <IconButton icon={Trash2} label="Quitar curso" onPress={() => setCourses((prev) => prev.filter((_, j) => j !== i))} />
              </View>
              <Input
                label="Opciones"
                value={c.options}
                onChangeText={(t) => setCourses((prev) => prev.map((x, j) => (j === i ? { ...x, options: t } : x)))}
                placeholder="Opción 1, opción 2"
              />
            </View>
          ))}
          <PButton label="Curso" icon={Plus} variant="ghost" onPress={() => setCourses((prev) => [...prev, { label: "", options: "" }])} />
        </View>
      </Field>
      <Field label="Incluye">
        <Input label="Incluye" value={includes} onChangeText={setIncludes} />
      </Field>
      <Field label="Desde (personas)">
        <Stepper label="Mínimo de personas" value={minPeople} onChange={setMinPeople} min={1} />
      </Field>
      <Field label="Señal">
        <Stepper label="Señal en porcentaje" value={depositPct} onChange={setDepositPct} min={0} max={100} step={5} format={(v) => `${v} %`} />
      </Field>
    </Sheet>
  );
}
