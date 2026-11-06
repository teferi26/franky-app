import React from "react";
import { Text, View } from "react-native";
import { Building2, CalendarCheck2, Euro, Eye, EyeOff, Plus, Users } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { ProProperty } from "../../../../../shared/pro/types";
import { localDate, money, pct } from "../../../../../shared/pro/format";
import { freeBy, intakes, occupancy, priceRange, propertyOccupancy } from "../../../../../shared/pro/housing";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { sectionLabel } from "../../sections";
import { Chips, Empty, Kpi, KpiRow, Meter, PButton, PText, PageHeader, Pill, SearchInput, Segmented, Tip } from "../../kit";
import { NewPropertyDrawer, PropertyDrawer } from "./drawers";
import { AgentDot, PropertyCover, RoomChip, RoomLegend } from "./shared";

type Filter = "all" | "free" | "full" | "hidden";

export default function HousingCartera() {
  const { data, now, vertical } = usePro();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [zone, setZone] = React.useState("");
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  const label = sectionLabel(vertical.id, "cartera");
  const occ = occupancy(data);
  const win = intakes(now);
  const freeFeb = freeBy(data, win.feb.by).length;
  const month = localDate(now).slice(0, 7);
  const zones = [...new Set(data.properties.map((p) => p.zone))];
  const allPrices = data.properties.flatMap((p) => p.rooms.map((r) => r.priceCents));
  const avg = allPrices.length ? Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length) : 0;
  const views = data.properties.reduce((a, p) => a + p.views30, 0);
  const groupsWaiting = data.leads.filter((l) => l.roomieGroup && l.stage !== "lost" && l.stage !== "signed").length;

  const needle = q.trim().toLowerCase();
  const list = data.properties.filter((p) => {
    if (needle && !`${p.title} ${p.address} ${p.zone}`.toLowerCase().includes(needle)) return false;
    if (zone && p.zone !== zone) return false;
    const free = p.rooms.some((r) => r.status === "free" || r.status === "leaving");
    if (filter === "free" && !free) return false;
    if (filter === "full" && free) return false;
    if (filter === "hidden" && p.published) return false;
    return true;
  });

  const counts = {
    all: data.properties.length,
    free: data.properties.filter((p) => p.rooms.some((r) => r.status === "free" || r.status === "leaving")).length,
    full: data.properties.filter((p) => !p.rooms.some((r) => r.status === "free" || r.status === "leaving")).length,
    hidden: data.properties.filter((p) => !p.published).length,
  };

  return (
    <>
      <ProPage>
        <PageHeader
          eyebrow={label}
          title={`${data.properties.length} ${data.properties.length === 1 ? "piso" : "pisos"}, ${occ.total} habitaciones`}
          description={`${occ.free} libres ahora y ${freeFeb} para febrero. Ocupación del ${pct(occ.occupied, occ.total)} %.`}
          actions={<PButton label="Añadir piso" icon={Plus} onPress={() => setAdding(true)} />}
        />

        <KpiRow>
          <Kpi icon={Building2} label="Ocupación" value={`${pct(occ.occupied, occ.total)} %`} hint={`${occ.occupied} de ${occ.total} habitaciones`} />
          <Kpi icon={CalendarCheck2} label="Libres ahora" value={occ.free} hint={occ.reserved ? `${occ.reserved} reservadas` : "Sin reservas pendientes"} emphasis={occ.free > 0} />
          <Kpi icon={Euro} label="Precio medio" value={money(avg, { round: true })} hint="por habitación y mes" />
          <Kpi icon={Eye} label="Vistas en 30 días" value={views.toLocaleString("es-ES")} hint="de estudiantes verificados" />
        </KpiRow>

        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Todos", count: counts.all },
            { value: "free", label: "Con libres", count: counts.free },
            { value: "full", label: "Llenos", count: counts.full },
            { value: "hidden", label: "Ocultos", count: counts.hidden },
          ]}
        />
        {zones.length > 1 ? (
          // Tocar la zona activa la quita (como en la web).
          <Chips value={zone} onChange={(z) => setZone((cur) => (cur === z ? "" : z))} options={zones.map((z) => ({ value: z, label: z }))} />
        ) : null}
        {data.properties.length > 3 ? <SearchInput value={q} onChange={setQ} placeholder="Buscar calle o zona" /> : null}

        <RoomLegend style={{ marginBottom: S.md }} />

        {list.length ? (
          <View style={{ gap: S.md, marginBottom: S.lg }}>
            {list.map((p) => (
              <PropertyCard key={p.id} property={p} month={month} onOpen={() => setOpen(p.id)} />
            ))}
            <Tap
              onPress={() => setAdding(true)}
              accessibilityRole="button"
              accessibilityLabel="Añadir otro piso"
              style={{ minHeight: 150, alignItems: "center", justifyContent: "center", gap: 6, borderRadius: R.lg, borderWidth: 1, borderStyle: "dashed", borderColor: C.border, paddingHorizontal: S.lg }}
            >
              <Plus size={24} color={C.muted} strokeWidth={1.6} />
              <PText v="h3" color={C.muted}>Añadir otro piso</PText>
              <PText v="tiny" style={{ textAlign: "center" }}>Por habitaciones o entero, en dos minutos.</PText>
            </Tap>
          </View>
        ) : data.properties.length ? (
          <Empty
            icon={Building2}
            title="Ningún piso con ese filtro"
            body="Cambia el filtro o la zona para ver el resto."
            action={
              <PButton
                label="Ver todos"
                variant="outline"
                onPress={() => {
                  setFilter("all");
                  setZone("");
                  setQ("");
                }}
              />
            }
          />
        ) : (
          <Empty
            icon={Building2}
            title="Sube tu primer piso"
            body="Por habitaciones, cada una con su precio y su fecha de disponibilidad. Lo verán estudiantes verificados de la UA y la UMH."
            action={<PButton label="Añadir piso" onPress={() => setAdding(true)} />}
          />
        )}

        <Tip title="Piso entero para grupos">
          {groupsWaiting
            ? `Hay ${groupsWaiting} grupos de Roomie buscando piso ahora. Abre un piso con varias habitaciones libres y ofrécelo entero: un contrato y todo lleno.`
            : "Roomie junta estudiantes compatibles. Ofrece tus pisos con varias habitaciones libres enteros y llénalos con un solo contrato."}
        </Tip>
        <Tip title="Publica febrero ya">
          Las habitaciones que se liberan en enero se reservan antes si están publicadas con su fecha. Los Erasmus miran piso desde noviembre.
        </Tip>
      </ProPage>

      <PropertyDrawer propertyId={open} onClose={() => setOpen(null)} />
      <NewPropertyDrawer open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function PropertyCard({ property, month, onOpen }: { property: ProProperty; month: string; onOpen: () => void }) {
  const { data } = usePro();
  const { occupied, total } = propertyOccupancy(property);
  const { min, max } = priceRange(property);
  const visits = data.visits.filter((v) => v.propertyId === property.id && v.start.slice(0, 7) === month && v.status !== "cancelled").length;
  const interested = data.leads.filter((l) => l.propertyId === property.id && l.stage !== "lost" && l.stage !== "signed").length;
  const agent = data.staff.find((s) => s.id === property.agentId);
  const free = property.rooms.filter((r) => r.status === "free").length;
  const facts = [`${property.minutesToCampus} min al campus`, `${visits} visitas este mes`, ...(interested ? [`${interested} interesados`] : [])];

  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, overflow: "hidden", ...SHADOW.card }}>
      <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Abrir ${property.title}`}>
        <PropertyCover property={property}>
          <View style={{ position: "absolute", top: S.md, right: S.md, flexDirection: "row", gap: 4 }}>
            {!property.published ? <Pill tone="warning" icon={EyeOff} label="Oculto" /> : null}
            {property.wholeFlatPriceCents ? <Pill tone="violet" icon={Users} label="Entero" /> : null}
          </View>
        </PropertyCover>
        <View style={{ paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.sm, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: S.sm }}>
            <Text style={{ flex: 1, fontFamily: FONT.heading, fontSize: 16.5, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.3}>{property.title}</Text>
            <PText v="h3">{min === max ? `${Math.round(min / 100)} €` : `${Math.round(min / 100)} a ${Math.round(max / 100)} €`}</PText>
          </View>
          <PText v="tiny" numberOfLines={1}>{property.address}</PText>
          <PText v="tiny" color={C.text} style={{ marginTop: 4 }}>{facts.join(" · ")}</PText>
        </View>
      </Tap>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: S.lg, paddingBottom: S.md, paddingTop: 4 }}>
        {property.rooms.map((r) => (
          <RoomChip key={r.id} room={r} onPress={onOpen} />
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, borderTopWidth: 1, borderTopColor: C.borderLight, paddingHorizontal: S.lg, paddingVertical: 10 }}>
        <View style={{ flex: 1 }}>
          <Meter value={occupied} max={total} tone={free ? "violet" : "success"} />
        </View>
        <PText v="tiny">{`${occupied}/${total}`}</PText>
        {agent && data.staff.length > 1 ? <AgentDot name={agent.name} toneKey={agent.tone} /> : null}
      </View>
    </View>
  );
}
