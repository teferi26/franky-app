import React from "react";
import { Text, View } from "react-native";
import { BadgeCheck, MapPin, Zap } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { ProOffer } from "../../../../../shared/pro/types";
import { atLocal, localDate, localMinutes, minutesToLabel, money } from "../../../../../shared/pro/format";
import type { Gap } from "../../../../../shared/pro/agenda";
import { UNIVERSITIES } from "../../../../../shared/pro/demo/common";
import { localId, usePro } from "../../store";
import { ChoiceGrid, DayChips, Field, Input, MultiChips, PButton, PText, Sheet, Stepper, TimeStepper, Toggle } from "../../kit";

export type OfferPreset = {
  gap?: Gap;
  /** Para sectores sin agenda: qué se ofrece y en qué franja. */
  title?: string;
  what?: string;
  date?: string;
  from?: number;
  to?: number;
  priceCents?: number;
  slots?: number;
} | null;

/** Alcance aproximado: estudiantes con la app que pasan cerca en esa franja. */
function estimatedReach(radiusKm: number, unis: number) {
  const base = radiusKm <= 1 ? 420 : radiusKm <= 2 ? 860 : 2100;
  return Math.round(base * (unis > 1 ? 1.35 : 1));
}

function weekday(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "long" });
}

export function OfferComposer({ preset, onClose }: { preset: OfferPreset; onClose: () => void }) {
  const { data, update, now, vertical, pending, can } = usePro();
  const gap = preset?.gap;
  const staff = gap ? data.staff.find((s) => s.id === gap.staffId) : undefined;
  const staffServices = gap ? data.services.filter((s) => s.staffIds.includes(gap.staffId) && s.online) : [];
  const today = localDate(now);

  const [serviceId, setServiceId] = React.useState("");
  const [what, setWhat] = React.useState("");
  const [basePrice, setBasePrice] = React.useState("10");
  const [discount, setDiscount] = React.useState(30);
  const [radius, setRadius] = React.useState<"1" | "2" | "5">("2");
  const [unis, setUnis] = React.useState<string[]>([UNIVERSITIES[0]]);
  const [studentsOnly, setStudentsOnly] = React.useState(true);
  const [date, setDate] = React.useState(today);
  const [from, setFrom] = React.useState(17 * 60);
  const [to, setTo] = React.useState(19 * 60);
  const [slots, setSlots] = React.useState(3);

  React.useEffect(() => {
    if (!preset) return;
    const first = staffServices.find((s) => s.popular) ?? staffServices[0];
    setServiceId(first?.id ?? "");
    setWhat(preset.what ?? "");
    setBasePrice(preset.priceCents ? String(preset.priceCents / 100) : "10");
    setDiscount(30);
    setRadius("2");
    setUnis([UNIVERSITIES[0]]);
    setStudentsOnly(true);
    setDate(gap?.date ?? preset.date ?? today);
    const nowMin = Math.ceil((localMinutes(now) + 30) / 15) * 15;
    setFrom(gap?.from ?? preset.from ?? Math.max(nowMin, 10 * 60));
    setTo(gap?.to ?? preset.to ?? Math.max(nowMin + 120, 12 * 60));
    setSlots(preset.slots ?? (first && gap ? Math.max(1, Math.floor((gap.to - gap.from) / first.durationMin)) : 3));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const service = data.services.find((s) => s.id === serviceId);
  const price = service ? service.priceCents : Math.round(Number(basePrice.replace(",", ".")) * 100) || 0;
  const finalPrice = Math.round((price * (100 - discount)) / 100 / 50) * 50;
  const itemName = service?.name ?? (what || "Tu oferta");
  const reach = estimatedReach(Number(radius), unis.length);
  const valid = to > from && price > 0 && Boolean(service || what.trim());

  React.useEffect(() => {
    if (service && gap) setSlots(Math.max(1, Math.floor((gap.to - gap.from) / service.durationMin)));
  }, [service, gap]);

  const launch = async () => {
    const offer: ProOffer = {
      id: localId("o"),
      kind: "flash",
      title: gap ? "Hueco de última hora" : "Oferta relámpago",
      detail: `${itemName} a ${money(finalPrice)} ${date === today ? "hoy" : "el " + weekday(date)} de ${minutesToLabel(from)} a ${minutesToLabel(to)}`,
      discountPct: discount,
      startsAt: atLocal(date, from),
      endsAt: atLocal(date, to),
      slots,
      claimed: 0,
      audience: { studentsOnly, radiusKm: Number(radius), universities: unis },
      status: "live",
      reach,
      views: 0,
      bookings: 0,
      revenueCents: 0,
      createdAt: new Date().toISOString(),
    };
    if (!(await update("offer.launch", (d) => ({ ...d, offers: [offer, ...d.offers] })))) return;
    toast("Oferta publicada", { kind: "success" });
    onClose();
  };

  return (
    <Sheet
      open={Boolean(preset)}
      onClose={onClose}
      title={gap ? "Ofrecer este hueco a estudiantes" : "Nueva oferta relámpago"}
      description={
        gap && staff
          ? `${staff.name.split(" ")[0]} tiene libre de ${minutesToLabel(gap.from)} a ${minutesToLabel(gap.to)}.`
          : "Llena una franja floja con un descuento solo para estudiantes."
      }
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Publicar ahora" icon={Zap} onPress={() => void launch()} disabled={pending || !can("offer.launch") || !valid} />
        </>
      }
    >
      {gap ? (
        <Field label="Qué ofreces">
          <ChoiceGrid value={serviceId} onChange={setServiceId} options={staffServices.map((s) => ({ value: s.id, label: s.name, hint: money(s.priceCents) }))} />
        </Field>
      ) : (
        <>
          <Field label="Qué ofreces" hint="Una frase corta. Por ejemplo: menú del día, clase de prueba, partido de 1 hora.">
            <Input value={what} onChangeText={setWhat} placeholder={vertical.engine === "tables" ? "Café y tostada" : "Tu servicio"} label="Qué ofreces" />
          </Field>
          <View style={{ flexDirection: "row", gap: S.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Precio normal (€)">
                <Input value={basePrice} onChangeText={setBasePrice} keyboardType="decimal-pad" label="Precio normal en euros" />
              </Field>
            </View>
            <Field label="Plazas">
              <Stepper value={slots} onChange={setSlots} min={1} max={200} label="plazas" />
            </Field>
          </View>
          <Field label="Día">
            <DayChips value={date} onChange={setDate} today={today} />
          </Field>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.lg }}>
            <Field label="Desde">
              <TimeStepper value={from} onChange={setFrom} label="hora de inicio" />
            </Field>
            <Field label="Hasta">
              <TimeStepper value={to} onChange={setTo} label="hora de fin" />
            </Field>
          </View>
        </>
      )}

      <Field label={`Descuento: ${discount} %`} hint={`Pasa de ${money(price)} a ${money(finalPrice)}.`}>
        <Stepper value={discount} onChange={setDiscount} min={10} max={60} step={5} format={(v) => `${v} %`} label="descuento" />
      </Field>

      <Field label="A quién se enseña">
        <ChoiceGrid
          value={radius}
          onChange={setRadius}
          options={[
            { value: "1", label: "A 1 km", hint: "Muy cerca" },
            { value: "2", label: "A 2 km", hint: "El campus" },
            { value: "5", label: "A 5 km", hint: "Toda la zona" },
          ]}
        />
      </Field>
      <MultiChips value={unis} onChange={setUnis} options={UNIVERSITIES.slice(0, 2).map((u) => ({ value: u, label: u }))} />
      <Toggle label="Solo estudiantes verificados" value={studentsOnly} onChange={setStudentsOnly} />

      <PText v="label" style={{ marginTop: S.sm }}>Así lo ven</PText>
      <View style={{ borderRadius: 26, borderWidth: 1, borderColor: C.border, backgroundColor: C.input, padding: 10 }}>
        <View style={{ borderRadius: 20, backgroundColor: C.surface, padding: S.lg, gap: 4, ...SHADOW.card }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: C.blue, borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Zap size={11} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontSize: 11, fontFamily: FONT.heading }} maxFontSizeMultiplier={1.2}>Ahora cerca</Text>
          </View>
          <PText v="h3" style={{ marginTop: 4 }}>{itemName}</PText>
          <PText v="tiny">{data.space.name}</PText>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 }}>
            <Text style={{ fontFamily: FONT.display, fontSize: 22, color: C.text }} maxFontSizeMultiplier={1.2}>{money(finalPrice)}</Text>
            <Text style={{ fontSize: 12, color: C.muted, textDecorationLine: "line-through" }} maxFontSizeMultiplier={1.2}>{money(price)}</Text>
          </View>
          <PText v="tiny" color={C.text}>{`${date === today ? "Hoy" : weekday(date)} · ${minutesToLabel(from)} a ${minutesToLabel(to)}`}</PText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <MapPin size={12} color={C.muted} />
            <PText v="tiny">{`A ${data.space.walkMinutesToCampus} min de tu facultad`}</PText>
          </View>
          {studentsOnly ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <BadgeCheck size={12} color={C.blueDeep} />
              <PText v="tiny" color={C.blueDeep}>Solo estudiantes</PText>
            </View>
          ) : null}
          <View style={{ marginTop: S.sm, height: 34, borderRadius: R.sm, backgroundColor: C.text, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: C.bg, fontFamily: FONT.semibold, fontSize: 13 }} maxFontSizeMultiplier={1.2}>{`Reservar · quedan ${slots}`}</Text>
          </View>
        </View>
      </View>
      <Text style={{ fontSize: 14, color: C.muted }} maxFontSizeMultiplier={1.4}>
        <Text style={{ fontFamily: FONT.display, fontSize: 18, color: C.text }}>{reach.toLocaleString("es-ES")}</Text> estudiantes lo verán. Sin comisión por cada reserva.
      </Text>
    </Sheet>
  );
}
