import React from "react";
import { View } from "react-native";
import { Minus, Plus, Users } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, R, S } from "@/theme";
import type { ProOffer, ProProperty, ProRoom } from "../../../../../shared/pro/types";
import { localDate, money } from "../../../../../shared/pro/format";
import { ROOM_STATUS, ZONES, currentTenants, shortDate } from "../../../../../shared/pro/housing";
import { UNIVERSITIES } from "../../../../../shared/pro/demo/common";
import { localId, usePro } from "../../store";
import { ChoiceGrid, Field, Input, PAvatar, PButton, PText, Pill, Sheet, Stepper, Toggle } from "../../kit";
import { PropertyCover, RoomTraits, euros, staffName } from "./shared";
import { Box, DateField, MiniStat, SelectField, TextLink } from "./ui";
import { canPublish, complianceGaps } from "../../../../../shared/pro/housing-ops";
import { ComplianceBox, KeysBox, OwnerField } from "./property-tools";

/* ------------------------------------------------------------------ */
/* Piso                                                                */
/* ------------------------------------------------------------------ */

export function PropertyDrawer({ propertyId, onClose }: { propertyId: string | null; onClose: () => void }) {
  const { data } = usePro();
  const property = data.properties.find((p) => p.id === propertyId);
  if (!property) return null;
  return <PropertyBody key={property.id} property={property} onClose={onClose} />;
}

type RoomDraft = { id: string; price: string; status: ProRoom["status"]; availableFrom: string };

function PropertyBody({ property, onClose }: { property: ProProperty; onClose: () => void }) {
  const { data, update, now, pending } = usePro();
  const today = localDate(now);
  const [rooms, setRooms] = React.useState<RoomDraft[]>(
    property.rooms.map((r) => ({ id: r.id, price: String(r.priceCents / 100), status: r.status, availableFrom: r.availableFrom.slice(0, 10) })),
  );
  const [whole, setWhole] = React.useState(String(Math.round((property.wholeFlatPriceCents ?? property.rooms.reduce((a, r) => a + r.priceCents, 0) * 0.93) / 100)));
  const [showWhole, setShowWhole] = React.useState(false);
  const month = today.slice(0, 7);
  const visitsMonth = data.visits.filter((v) => v.propertyId === property.id && v.start.slice(0, 7) === month && v.status !== "cancelled").length;
  const leads = data.leads.filter((l) => l.propertyId === property.id && l.stage !== "lost" && l.stage !== "signed").length;
  const groups = data.leads.filter((l) => l.roomieGroup && l.stage !== "lost" && l.roomieGroup.size <= property.rooms.length).length;
  const tenants = currentTenants(data, now).filter((t) => t.propertyId === property.id);
  const dirty = rooms.some((d) => {
    const r = property.rooms.find((x) => x.id === d.id);
    return r && (euros(d.price) !== r.priceCents || d.status !== r.status || d.availableFrom !== r.availableFrom.slice(0, 10));
  });
  const isAgency = data.staff.length > 1;

  const saveRooms = async () => {
    const ok = await update("property.rooms", (d) => ({
      ...d,
      properties: d.properties.map((p) =>
        p.id === property.id
          ? {
              ...p,
              rooms: p.rooms.map((r) => {
                const draft = rooms.find((x) => x.id === r.id);
                return draft ? { ...r, priceCents: euros(draft.price) || r.priceCents, status: draft.status, availableFrom: draft.availableFrom || r.availableFrom } : r;
              }),
            }
          : p,
      ),
    }));
    if (!ok) return;
    toast("Habitaciones guardadas", { kind: "success", body: "Los interesados ven los precios nuevos al momento." });
  };

  const togglePublish = async () => {
    // Sin NRUA ni letra energética no se anuncia: la ficha pública enseña la letra.
    if (!property.published && !canPublish(property)) {
      toast("Antes de publicarlo", { kind: "info", body: `Falta ${complianceGaps(property).join(" y ")}. Complétalo abajo, en los datos del piso.` });
      return;
    }
    const ok = await update("property.publish", (d) => ({ ...d, properties: d.properties.map((p) => (p.id === property.id ? { ...p, published: !p.published } : p)) }));
    if (!ok) return;
    toast(property.published ? "Piso oculto" : "Piso publicado", {
      kind: "success",
      body: property.published ? "Ya no aparece a los estudiantes." : "Ya aparece en el buscador de pisos de Franky.",
    });
  };

  const offerWhole = async () => {
    const cents = euros(whole);
    const offer: ProOffer = {
      id: localId("o"),
      kind: "group",
      title: `${property.title} entero para grupos de Roomie`,
      detail: `${property.rooms.length} habitaciones por ${money(cents)} al mes para un grupo compatible`,
      discountPct: 0,
      slots: 1,
      claimed: 0,
      audience: { studentsOnly: true, radiusKm: 10, universities: UNIVERSITIES.slice(0, 2) },
      status: "live",
      reach: 300 + groups * 120,
      views: 0,
      bookings: 0,
      revenueCents: 0,
      createdAt: new Date().toISOString(),
    };
    const ok = await update("property.whole", (d) => ({
      ...d,
      offers: [offer, ...d.offers],
      properties: d.properties.map((p) => (p.id === property.id ? { ...p, wholeFlatPriceCents: cents } : p)),
    }));
    if (!ok) return;
    toast("Ofrecido a grupos de Roomie", { kind: "success", body: `${groups ? `${groups} grupos compatibles lo ven ya` : "Los grupos compatibles lo verán"} en su búsqueda.` });
    setShowWhole(false);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={property.title}
      description={`${property.address} · ${property.minutesToCampus} min al campus`}
      footer={
        <>
          <PButton label={property.published ? "Ocultar" : "Publicar"} variant="outline" onPress={() => void togglePublish()} disabled={pending} />
          <PButton label="Guardar cambios" onPress={() => void saveRooms()} disabled={pending || !dirty} />
        </>
      }
    >
      <PropertyCover property={property} height={144} radius={R.lg} />
      <View style={{ flexDirection: "row", gap: S.sm }}>
        <MiniStat boxed value={visitsMonth} label="visitas este mes" />
        <MiniStat boxed value={property.views30} label="vistas en 30 días" />
        <MiniStat boxed value={leads} label="interesados activos" />
      </View>

      <View style={{ gap: S.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <PText v="label">Habitaciones</PText>
          {!property.published ? <Pill tone="warning" label="Oculto" /> : <Pill tone="success" label="Publicado" />}
        </View>
        {property.rooms.map((r, i) => {
          const draft = rooms[i];
          const tenant = data.tenants.find((t) => t.id === r.tenantId);
          const set = (fields: Partial<RoomDraft>) => setRooms((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...fields } : x)));
          return (
            <Box key={r.id}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3">{r.name}</PText>
                  <RoomTraits room={r} />
                </View>
                {tenant && (r.status === "occupied" || r.status === "leaving") ? (
                  <PText v="tiny" numberOfLines={1} style={{ maxWidth: "45%" }}>{tenant.name}</PText>
                ) : null}
              </View>
              <Field label="Precio (€)">
                <Input value={draft.price} onChangeText={(v) => set({ price: v })} keyboardType="decimal-pad" label={`Precio de ${r.name}`} />
              </Field>
              <Field label="Estado">
                <ChoiceGrid
                  value={draft.status}
                  onChange={(s) => set({ status: s })}
                  options={(Object.keys(ROOM_STATUS) as ProRoom["status"][]).map((s) => ({ value: s, label: ROOM_STATUS[s].label }))}
                />
              </Field>
              <DateField label="Libre desde" value={draft.availableFrom} onChange={(v) => set({ availableFrom: v })} today={today} />
            </Box>
          );
        })}
      </View>

      <ComplianceBox property={property} />
      <KeysBox property={property} />
      {isAgency ? <OwnerField property={property} /> : null}

      <Box accent>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Users size={16} color={C.blueDeep} strokeWidth={1.9} />
          <PText v="h3" color={C.blueDeep}>Piso entero para grupos de Roomie</PText>
        </View>
        <PText v="tiny" color={C.text}>
          {groups
            ? `${groups} grupos ya formados y compatibles buscan piso de ${property.rooms.length} o menos. Firmas un contrato y llenas todas las habitaciones de una vez.`
            : "Roomie junta estudiantes compatibles para alquilar pisos enteros. Un contrato, todas las habitaciones llenas."}
        </PText>
        {property.wholeFlatPriceCents && !showWhole ? (
          <View style={{ gap: 2 }}>
            <PText v="small" color={C.text}>{`Ofrecido por ${money(property.wholeFlatPriceCents)} al mes.`}</PText>
            <TextLink label="Cambiar" onPress={() => setShowWhole(true)} />
          </View>
        ) : showWhole ? (
          <View style={{ gap: S.sm }}>
            <Field label="Precio del piso entero (€/mes)">
              <Input value={whole} onChangeText={setWhole} keyboardType="decimal-pad" label="Precio del piso entero en euros al mes" />
            </Field>
            <PButton label="Ofrecer" onPress={() => void offerWhole()} disabled={pending || euros(whole) <= 0} />
          </View>
        ) : (
          <PButton small label="Ofrecer piso entero a grupos Roomie" variant="secondary" onPress={() => setShowWhole(true)} />
        )}
      </Box>

      {isAgency ? (
        <SelectField
          label="Agente del piso"
          value={property.agentId ?? ""}
          onChange={async (v) => {
            const ok = await update("property.agent", (d) => ({ ...d, properties: d.properties.map((p) => (p.id === property.id ? { ...p, agentId: v || undefined } : p)) }));
            if (!ok) return;
            toast("Agente asignado", { kind: "success", body: staffName(data, v) ?? "Sin agente" });
          }}
          options={[{ value: "", label: "Sin asignar" }, ...data.staff.map((s) => ({ value: s.id, label: s.name }))]}
        />
      ) : null}

      <View style={{ gap: 6 }}>
        <PText v="label">Viven aquí</PText>
        {tenants.length ? (
          tenants.map((t) => (
            <View key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 32 }}>
              <PAvatar name={t.name} size={26} />
              <PText v="small" color={C.text} numberOfLines={1} style={{ flex: 1 }}>{t.name}</PText>
              <PText v="tiny">{`hasta ${shortDate(t.leavingAt ?? t.contractEnd)}`}</PText>
            </View>
          ))
        ) : (
          <PText v="small">Nadie todavía.</PText>
        )}
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Nuevo piso                                                          */
/* ------------------------------------------------------------------ */

type NewRoom = { size: string; price: string; exterior: boolean; bath: boolean };

const START_ROOMS: NewRoom[] = [
  { size: "12", price: "330", exterior: true, bath: false },
  { size: "10", price: "310", exterior: false, bath: false },
  { size: "11", price: "320", exterior: true, bath: false },
];

export function NewPropertyDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, now, pending } = usePro();
  const [address, setAddress] = React.useState("");
  const [zone, setZone] = React.useState(ZONES[0]);
  const [minutes, setMinutes] = React.useState(10);
  const [rooms, setRooms] = React.useState<NewRoom[]>(START_ROOMS);
  const valid = address.trim().length > 4 && rooms.length > 0 && rooms.every((r) => euros(r.price) > 0);

  const create = async () => {
    const id = localId("p");
    const property: ProProperty = {
      id,
      title: `Piso ${address.trim().split(",")[0]}`,
      address: address.trim(),
      zone,
      minutesToCampus: Math.max(1, minutes || 1),
      rooms: rooms.map((r, i) => ({
        id: `${id}-r${i + 1}`,
        name: `Habitación ${i + 1}`,
        sizeM2: Math.max(6, Number(r.size) || 10),
        priceCents: euros(r.price),
        status: "free",
        availableFrom: localDate(now),
        exterior: r.exterior,
        privateBath: r.bath,
      })),
      photos: 0,
      views30: 0,
      published: false,
      agentId: data.staff.find((s) => s.role === "agent")?.id,
    };
    // Sin NRUA ni letra energética se guarda oculto: se completan en su ficha.
    property.published = canPublish(property);
    if (!(await update("property.create", (d) => ({ ...d, properties: [...d.properties, property] })))) return;
    if (property.published) toast("Piso publicado", { kind: "success", body: "Añade fotos desde la ficha: los pisos con fotos reciben muchas más visitas." });
    else toast("Piso guardado sin publicar", { kind: "success", body: `Añade ${complianceGaps(property).join(" y ")} en su ficha y publícalo.` });
    setAddress("");
    onClose();
  };

  const setRoom = (i: number, fields: Partial<NewRoom>) => setRooms((prev) => prev.map((r, j) => (j === i ? { ...r, ...fields } : r)));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Añadir piso"
      description="Por habitaciones: cada una con su precio. Lo verán estudiantes verificados que buscan en tu zona."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Publicar piso" onPress={() => void create()} disabled={pending || !valid} />
        </>
      }
    >
      <Field label="Dirección">
        <Input value={address} onChangeText={setAddress} placeholder="Calle Pintor Picasso 7, 2.º B" label="Dirección" />
      </Field>
      <Field label="Zona">
        <ChoiceGrid value={zone} onChange={setZone} options={ZONES.map((z) => ({ value: z, label: z }))} />
      </Field>
      <Field label="Minutos al campus" hint="Andando o en tranvía, lo que tarde de verdad un estudiante.">
        <Stepper value={minutes} onChange={setMinutes} min={1} max={90} format={(v) => `${v} min`} label="minutos al campus" />
      </Field>
      <View style={{ gap: S.sm }}>
        <PText v="h3">Habitaciones</PText>
        {rooms.map((r, i) => (
          <Box key={i}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <PText v="h3">{`Habitación ${i + 1}`}</PText>
              <Tap
                onPress={() => setRooms((prev) => prev.filter((_, j) => j !== i))}
                disabled={rooms.length === 1}
                accessibilityRole="button"
                accessibilityLabel={`Quitar habitación ${i + 1}`}
                style={{ width: 44, height: 44, borderRadius: R.md, alignItems: "center", justifyContent: "center", opacity: rooms.length === 1 ? 0.4 : 1 }}
              >
                <Minus size={17} color={C.muted} />
              </Tap>
            </View>
            <View style={{ flexDirection: "row", gap: S.sm }}>
              <View style={{ flex: 1 }}>
                <Field label="Metros">
                  <Input value={r.size} onChangeText={(v) => setRoom(i, { size: v })} keyboardType="number-pad" label={`Metros de la habitación ${i + 1}`} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Precio (€/mes)">
                  <Input value={r.price} onChangeText={(v) => setRoom(i, { price: v })} keyboardType="decimal-pad" label={`Precio de la habitación ${i + 1}`} />
                </Field>
              </View>
            </View>
            <Toggle label="Exterior" value={r.exterior} onChange={(v) => setRoom(i, { exterior: v })} />
            <Toggle label="Baño propio" value={r.bath} onChange={(v) => setRoom(i, { bath: v })} />
          </Box>
        ))}
        <PButton
          small
          label="Añadir habitación"
          variant="outline"
          icon={Plus}
          disabled={rooms.length >= 8}
          onPress={() => setRooms((prev) => [...prev, { size: "10", price: prev[prev.length - 1]?.price ?? "320", exterior: false, bath: false }])}
        />
      </View>
    </Sheet>
  );
}
