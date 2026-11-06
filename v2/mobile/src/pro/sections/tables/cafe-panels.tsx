import React from "react";
import { Text, View } from "react-native";
import { BookOpen, Cake, Laptop, Plug, Plus, Recycle, Settings2, ShoppingBag, Wifi } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProStudySettings } from "../../../../../shared/pro/tables-types";
import { STUDY_RULE_LABEL, ordersOn, ordersToRemind, studyStatus } from "../../../../../shared/pro/tables-ops";
import {
  defaultStudySettings,
  leftoversOffer,
  leftoversWindow,
  sellLeftovers,
  setShowcaseItem,
  showcaseCandidates,
  showcaseToday,
  studyCount,
} from "../../../../../shared/pro/tables-day";
import { localDate, localMinutes, minutesToLabel, money, plural, time, weekdayIndex } from "../../../../../shared/pro/format";
import { localId, usePro } from "../../store";
import { useGoSection } from "../../shell";
import { ChoiceGrid, Empty, Field, ListRow, Meter, PButton, PText, Panel, Pill, Sheet, Stepper, Toggle, TimeStepper } from "../../kit";
import type { OfferPreset } from "../common/offer-composer";
import { AllergenCodes } from "./table-kit";
import { useTablesOps } from "./ops";
import { BigFigure, TextLink } from "./ui";

/**
 * Tarjetas de Hoy propias de la cafetería, versión nativa de cafe-cards.tsx:
 * el sitio para estudiar con sus reglas y su contador, la vitrina del día con
 * las sobras de última hora y los pedidos para recoger.
 */

type OnOffer = (preset: OfferPreset) => void;

const WEEKDAY_SHORT = ["L", "M", "X", "J", "V", "S", "D"];
const WEEKDAY_LONG = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/* ------------------------------------------------------------------ */
/* Sitio para estudiar                                                  */
/* ------------------------------------------------------------------ */

export function StudyPanel({ onOffer }: { onOffer: OnOffer }) {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const [editing, setEditing] = React.useState(false);
  if (!ops) return null;
  const today = localDate(now);
  const hours = data.space.hours[weekdayIndex(today)];
  const study = ops.study;

  if (!study || !study.enabled) {
    return (
      <Panel title="Sitio para estudiar">
        <Empty
          icon={BookOpen}
          title="Llena las tardes con gente que estudia"
          body="Di cuántos sitios tienes, si hay enchufes y qué consumición pides. Los estudiantes de cerca ven los sitios libres y tus reglas."
          action={
            <PButton
              label="Activar sitio para estudiar"
              onPress={async () => {
                const next = study ? { ...study, enabled: true } : defaultStudySettings(hours);
                if (await save("study.enable", (o) => ({ ...o, study: next }))) setEditing(true);
              }}
            />
          }
        />
        <StudySheet open={editing} onClose={() => setEditing(false)} />
      </Panel>
    );
  }

  const status = studyStatus(study, now);
  const setCount = (value: number) =>
    save("study.count", (o) => (o.study ? { ...o, study: studyCount(o.study, value - o.study.occupied, now.toISOString()) } : o));
  const facts = [
    { icon: Plug, label: study.plugs > 0 ? `${study.plugs} enchufes` : "Sin enchufes" },
    { icon: Wifi, label: study.wifi ? "Wifi" : "Sin wifi" },
    { icon: BookOpen, label: STUDY_RULE_LABEL[study.rule] },
    { icon: Laptop, label: status.laptopsToday ? "Portátiles hoy sí" : "Hoy sin portátiles" },
  ];

  return (
    <Panel
      title="Sitio para estudiar"
      description={
        status.open
          ? "Lo que ven ahora los estudiantes que buscan dónde estudiar."
          : `Abre de ${minutesToLabel(study.fromMinute)} a ${minutesToLabel(study.toMinute)}.`
      }
      action={<PButton label="Reglas" icon={Settings2} variant="outline" small onPress={() => setEditing(true)} />}
    >
      <BigFigure value={status.open ? status.free : study.seats} suffix={status.open ? `libres de ${study.seats}` : "sitios"} />
      <View style={{ marginTop: S.md }}>
        <Meter value={status.open ? study.occupied : 0} max={study.seats} tone={status.free <= 3 ? "warning" : "violet"} />
      </View>
      {status.open ? (
        <View style={{ marginTop: S.md, gap: S.sm }}>
          <PText v="h3">Estudiando ahora</PText>
          <Stepper label="Personas estudiando ahora" value={study.occupied} min={0} max={study.seats} onChange={(v) => void setCount(v)} />
          <PText v="tiny">Toca más o menos cuando alguien se sienta o se va. Así nadie viene para nada.</PText>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: S.lg, rowGap: 4, marginTop: S.md }}>
        {facts.map(({ icon: Icon, label }) => (
          <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon size={13} color={C.muted} strokeWidth={1.9} />
            <PText v="tiny">{label}</PText>
          </View>
        ))}
      </View>
      {status.open && status.free > 0 ? (
        <PButton
          label="Avisar de que hay sitio"
          variant="secondary"
          full
          style={{ marginTop: S.lg }}
          onPress={() => {
            onOffer({
              title: "Sitio para estudiar",
              what: `Sitio con enchufe y ${study.rule === "none" ? "café a precio de estudiante" : "tu consumición"}`,
              from: Math.ceil(localMinutes(now) / 15) * 15,
              to: Math.min(study.toMinute, hours?.close ?? study.toMinute),
              priceCents: 160,
              slots: status.free,
            });
            toast("Oferta preparada", { kind: "info", body: "Revisa el precio y publícala." });
          }}
        />
      ) : null}
      <StudySheet open={editing} onClose={() => setEditing(false)} />
    </Panel>
  );
}

function StudySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now } = usePro();
  const { ops, save, pending } = useTablesOps();
  const hours = data.space.hours[weekdayIndex(localDate(now))];
  const [draft, setDraft] = React.useState<ProStudySettings>(() => ops?.study ?? defaultStudySettings(hours));

  React.useEffect(() => {
    if (open) setDraft(ops?.study ?? defaultStudySettings(hours));
    // Solo al abrir: mientras se edita no se pisa el borrador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (patch: Partial<ProStudySettings>) => setDraft((d) => ({ ...d, ...patch }));
  const valid = draft.seats > 0 && draft.toMinute > draft.fromMinute;

  const submit = async () => {
    const ok = await save("study.save", (o) => ({
      ...o,
      study: { ...draft, enabled: true, occupied: Math.min(draft.occupied, draft.seats) },
    }));
    if (!ok) return;
    toast("Reglas guardadas", {
      kind: "success",
      body: `${plural(draft.seats, "sitio", "sitios")} de ${minutesToLabel(draft.fromMinute)} a ${minutesToLabel(draft.toMinute)}.`,
    });
    onClose();
  };

  const pause = async () => {
    if (await save("study.disable", (o) => ({ ...o, study: { ...draft, enabled: false } }))) {
      toast("Sitio para estudiar pausado", { kind: "success" });
      onClose();
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Reglas del sitio para estudiar"
      description="Los estudiantes las ven antes de venir. Así nadie se queda cuatro horas con un café."
      footer={
        <>
          {draft.enabled ? <PButton label="Pausar" variant="ghost" onPress={() => void pause()} /> : null}
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar" disabled={pending || !valid} onPress={() => void submit()} />
        </>
      }
    >
      <Field label="Sitios">
        <Stepper label="Sitios" value={draft.seats} min={1} max={80} onChange={(v) => set({ seats: v })} />
      </Field>
      <Field label="Enchufes">
        <Stepper label="Enchufes" value={draft.plugs} min={0} max={80} onChange={(v) => set({ plugs: v })} />
      </Field>
      <Toggle label="Wifi para clientes" value={draft.wifi} onChange={(v) => set({ wifi: v })} />
      <Field label="Desde">
        <TimeStepper label="Desde" value={draft.fromMinute} step={30} onChange={(v) => set({ fromMinute: v })} />
      </Field>
      <Field label="Hasta">
        <TimeStepper label="Hasta" value={draft.toMinute} step={30} onChange={(v) => set({ toMinute: v })} />
      </Field>
      <Field label="Consumición" hint="Una cada dos horas es lo que mejor funciona en tardes de exámenes.">
        <ChoiceGrid
          value={draft.rule}
          onChange={(v) => set({ rule: v })}
          options={(["none", "one", "every2h"] as const).map((r) => ({ value: r, label: STUDY_RULE_LABEL[r] }))}
        />
      </Field>
      <Field
        label="Días sin portátiles"
        hint={
          draft.noLaptopDays.length
            ? `Sin portátiles el ${draft.noLaptopDays.map((d) => WEEKDAY_LONG[d]).join(", ")}.`
            : "Portátiles bienvenidos todos los días."
        }
      >
        <View style={{ flexDirection: "row", gap: 6 }}>
          {WEEKDAY_SHORT.map((label, day) => {
            const on = draft.noLaptopDays.includes(day);
            return (
              <Tap
                key={label}
                onPress={() =>
                  set({ noLaptopDays: on ? draft.noLaptopDays.filter((d) => d !== day) : [...draft.noLaptopDays, day].sort() })
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`Sin portátiles el ${WEEKDAY_LONG[day]}`}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: R.md,
                  borderWidth: 1,
                  borderColor: on ? C.blue : C.border,
                  backgroundColor: on ? C.accentSoft : C.surface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: on ? C.blueDeep : C.muted }} maxFontSizeMultiplier={1.2}>
                  {label}
                </Text>
              </Tap>
            );
          })}
        </View>
      </Field>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Vitrina del día y sobras                                             */
/* ------------------------------------------------------------------ */

export function ShowcasePanel({ onOffer }: { onOffer: OnOffer }) {
  const { data, now } = usePro();
  const { ops, saveAll } = useTablesOps();
  const [adding, setAdding] = React.useState(false);
  if (!ops) return null;
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const hours = data.space.hours[weekdayIndex(today)];
  const rows = showcaseToday(ops, data.menu, today);
  const late = leftoversWindow(ops, hours, nowMin);
  const units = rows.reduce((a, r) => a + (r.item.available ? r.left : 0), 0);
  const soldLate = rows.reduce((a, r) => a + r.soldLate, 0);
  const offer = late?.active ? leftoversOffer(rows, late, nowMin) : null;

  // Agotar quita el producto de la carta y del QR; reponer lo devuelve.
  const setLeft = (menuItemId: string, left: number) =>
    saveAll("showcase.set", (d, o) => ({
      ...d,
      tablesOps: setShowcaseItem(o, today, menuItemId, left),
      menu: d.menu.map((m) => (m.id === menuItemId ? { ...m, available: left > 0 } : m)),
    }));

  const sell = async (menuItemId: string) => {
    const item = data.menu.find((m) => m.id === menuItemId);
    if (!item) return;
    const ok = await saveAll("showcase.leftover", (d, o) => {
      const next = sellLeftovers(o, { id: localId("w"), date: today, at: now.toISOString(), item, qty: 1 });
      const row = next.showcase?.items.find((r) => r.menuItemId === item.id);
      return {
        ...d,
        tablesOps: next,
        menu: row && row.left === 0 ? d.menu.map((m) => (m.id === item.id ? { ...m, available: false } : m)) : d.menu,
      };
    });
    if (ok) toast("Sobra vendida", { kind: "success", body: `${item.name}. Queda apuntada en tu plan contra el desperdicio.` });
  };

  return (
    <Panel
      title="Vitrina de hoy"
      description={
        rows.length
          ? `${plural(units, "unidad", "unidades")} a la vista. Agotar lo quita al momento de la carta y del QR.`
          : "Lo que cambia cada día: tartas, bollería y bocadillos."
      }
      action={<PButton label="Añadir" icon={Plus} variant="outline" small onPress={() => setAdding(true)} />}
      flush
    >
      {rows.length ? (
        rows.map(({ item, left }, i) => (
          <View
            key={item.id}
            style={{
              paddingHorizontal: S.lg,
              paddingVertical: S.md,
              gap: S.sm,
              borderBottomWidth: i === rows.length - 1 && !late ? 0 : 1,
              borderBottomColor: C.borderLight,
              backgroundColor: item.available ? undefined : C.input,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <PText
                v="h3"
                numberOfLines={1}
                color={item.available ? C.text : C.muted}
                style={[{ flex: 1 }, !item.available ? { textDecorationLine: "line-through" } : null]}
              >
                {item.name}
              </PText>
              <PText v="small">{money(item.priceCents)}</PText>
            </View>
            <AllergenCodes list={item.allergens} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
              <Stepper label={`Quedan de ${item.name}`} value={item.available ? left : 0} min={0} max={99} onChange={(v) => void setLeft(item.id, v)} />
              {late?.active && item.available && left > 0 ? (
                <PButton label="Vendida" variant="secondary" small onPress={() => void sell(item.id)} />
              ) : (
                <PButton
                  label={item.available ? "Agotar" : "Agotado"}
                  variant={item.available ? "outline" : "danger"}
                  small
                  onPress={() => void setLeft(item.id, item.available ? 0 : 1)}
                />
              )}
            </View>
          </View>
        ))
      ) : (
        <Empty
          icon={Cake}
          title="Pon lo que ha llegado hoy"
          body="Cuántas unidades hay de cada cosa. Cuando se acabe, un toque y desaparece del QR y de tu ficha."
          action={<PButton label="Preparar la vitrina" onPress={() => setAdding(true)} />}
        />
      )}

      {late ? (
        <View style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.sm }}>
          <View style={{ flexDirection: "row", gap: S.sm }}>
            <Recycle size={16} color={C.blue} strokeWidth={1.9} style={{ marginTop: 2 }} />
            <PText v="body" style={{ flex: 1 }}>
              {late.active
                ? `Sobras hasta las ${minutesToLabel(late.until)}. ${soldLate ? `Hoy ya has colocado ${plural(soldLate, "unidad", "unidades")}.` : "Lo que quede, a mitad de precio para los estudiantes de al lado."}`
                : `A partir de las ${minutesToLabel(late.from)} podrás ofrecer lo que quede a mitad de precio.`}
            </PText>
          </View>
          {offer ? <PButton label="Ofrecer lo que queda" full onPress={() => onOffer(offer)} /> : null}
        </View>
      ) : null}

      <ShowcaseSheet open={adding} onClose={() => setAdding(false)} />
    </Panel>
  );
}

function ShowcaseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now } = usePro();
  const { ops, saveAll, pending } = useTablesOps();
  const today = localDate(now);
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [hour, setHour] = React.useState<string>("none");

  React.useEffect(() => {
    if (!open || !ops) return;
    const rows = showcaseToday(ops, data.menu, today);
    setQty(Object.fromEntries(rows.map((r) => [r.item.id, r.left])));
    setHour(ops.leftoversFrom === undefined ? "none" : String(ops.leftoversFrom));
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!ops) return null;
  const candidates = showcaseCandidates(data.menu);
  const current = showcaseToday(ops, data.menu, today).map((r) => r.item.id);

  const submit = async () => {
    // Lo que tiene unidades entra en la vitrina y en la carta; lo que ya
    // estaba y se deja a cero queda como agotado.
    const touched = candidates.filter((item) => (qty[item.id] ?? 0) > 0 || current.includes(item.id));
    const ok = await saveAll("showcase.save", (d, o) => {
      let next = o;
      for (const item of touched) next = setShowcaseItem(next, today, item.id, qty[item.id] ?? 0);
      return {
        ...d,
        tablesOps: { ...next, leftoversFrom: hour === "none" ? undefined : Number(hour) },
        menu: d.menu.map((m) => (touched.some((t) => t.id === m.id) ? { ...m, available: (qty[m.id] ?? 0) > 0 } : m)),
      };
    });
    if (!ok) return;
    toast("Vitrina lista", { kind: "success", body: "Tus clientes ven lo que hay hoy en la carta y en el QR." });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Vitrina de hoy"
      description="Cuántas unidades han llegado de cada cosa. Los alérgenos vienen de tu carta."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar vitrina" disabled={pending} onPress={() => void submit()} />
        </>
      }
    >
      {candidates.length ? (
        <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border }}>
          {candidates.map((item, i) => (
            <View
              key={item.id}
              style={{ flexDirection: "row", alignItems: "center", gap: S.sm, padding: S.md, borderTopWidth: i ? 1 : 0, borderTopColor: C.borderLight }}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <PText v="h3" numberOfLines={1}>
                  {item.name}
                </PText>
                <AllergenCodes list={item.allergens} />
              </View>
              <Stepper
                label={`Unidades de ${item.name}`}
                value={qty[item.id] ?? 0}
                min={0}
                max={99}
                onChange={(v) => setQty((q) => ({ ...q, [item.id]: v }))}
              />
            </View>
          ))}
        </View>
      ) : (
        <PText v="small">Crea en la carta tus dulces, bollería y bocadillos y aparecerán aquí.</PText>
      )}
      <Field label="Sobras de última hora desde" hint="Desde esa hora, Hoy te propone ofrecer lo que quede hasta el cierre.">
        <ChoiceGrid
          value={hour}
          onChange={setHour}
          options={[
            { value: String(17 * 60), label: "17:00" },
            { value: String(18 * 60), label: "18:00" },
            { value: String(19 * 60), label: "19:00" },
            { value: "none", label: "No ofrecer" },
          ]}
        />
      </Field>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Pedidos para recoger                                                 */
/* ------------------------------------------------------------------ */

export function OrdersMini() {
  const { now, vertical } = usePro();
  const { ops } = useTablesOps();
  const go = useGoSection();
  if (!ops || !vertical.nav.some((n) => n.id === "pedidos")) return null;
  const today = localDate(now);
  const open = ordersOn(ops, today, "pickup").filter((o) => o.status !== "collected" && o.status !== "cancelled");
  const remind = ordersToRemind(ops, today);
  if (!open.length && !remind.length) return null;
  return (
    <Panel
      title="Pedidos para recoger"
      description={remind.length ? `${plural(remind.length, "encargo recoge", "encargos recogen")} mañana: recuérdaselo hoy.` : undefined}
      action={<TextLink label="Pedidos" onPress={() => go("pedidos")} />}
      flush
    >
      {open.length ? (
        open.slice(0, 4).map((o, i, arr) => (
          <ListRow key={o.id} last={i === arr.length - 1} onPress={() => go("pedidos")} accessibilityLabel={`${time(o.pickupAt)}, ${o.clientName}`}>
            <Text style={{ width: 46, fontFamily: FONT.heading, fontSize: 14, color: C.text }} maxFontSizeMultiplier={1.2}>
              {time(o.pickupAt)}
            </Text>
            <View style={{ flex: 1 }}>
              <PText v="h3" numberOfLines={1}>
                {o.clientName}
              </PText>
              <PText v="tiny" numberOfLines={1}>
                {o.lines.map((l) => `${l.qty} ${l.name}`).join(", ")}
              </PText>
            </View>
            <Pill tone={o.status === "ready" ? "success" : "violet"} label={o.status === "ready" ? "Listo" : o.status === "preparing" ? "Preparando" : "Nuevo"} />
          </ListRow>
        ))
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, padding: S.lg }}>
          <ShoppingBag size={16} color={C.muted} strokeWidth={1.9} />
          <PText v="small">Nada por preparar ahora.</PText>
        </View>
      )}
    </Panel>
  );
}
