import React from "react";
import { Alert, Text, View } from "react-native";
import { Globe, Plus, Scissors, TrendingUp } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProService } from "../../../../../shared/pro/types";
import { durationLabel, money } from "../../../../../shared/pro/format";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { sectionLabel } from "../../sections";
import { Empty, Field, Input, Kpi, KpiRow, ListRow, PAvatar, PButton, PText, PageHeader, Panel, Pill, Sheet, Tip, Toggle } from "../../kit";

export default function ServiciosSection() {
  const { data, vertical, update } = usePro();
  const [editing, setEditing] = React.useState<ProService | "new" | null>(null);
  const label = sectionLabel(vertical.id, "servicios");

  const counts = new Map<string, number>();
  for (const b of data.bookings) if (b.serviceId && b.status !== "cancelled") counts.set(b.serviceId, (counts.get(b.serviceId) ?? 0) + 1);
  const categories = Array.from(new Set(data.services.map((s) => s.category)));
  const top = [...data.services].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))[0];
  const avgPrice = data.services.length ? Math.round(data.services.reduce((a, s) => a + s.priceCents, 0) / data.services.length) : 0;
  const online = data.services.filter((s) => s.online).length;
  const withStudent = data.services.filter((s) => s.studentPriceCents).length;

  return (
    <ProPage>
      <PageHeader
        eyebrow={label}
        title={`${data.services.length} ${label.toLowerCase()}`}
        description={`${online} se pueden reservar online y ${withStudent} tienen precio estudiante.`}
        actions={<PButton label="Añadir" icon={Plus} onPress={() => setEditing("new")} />}
      />

      <KpiRow>
        <Kpi label="El más pedido" value={top?.name ?? "Ninguno"} hint={top ? `${counts.get(top.id) ?? 0} citas en 10 días` : undefined} />
        <Kpi label="Precio medio" value={money(avgPrice)} />
        <Kpi label="Reservables online" value={`${online}/${data.services.length}`} />
        <Kpi icon={TrendingUp} label="Con precio estudiante" value={withStudent} emphasis />
      </KpiRow>

      {data.services.length ? (
        categories.map((cat) => {
          const list = data.services.filter((s) => s.category === cat);
          return (
            <Panel key={cat} title={cat} flush>
              {list.map((s, i) => (
                <ListRow key={s.id} onPress={() => setEditing(s)} accessibilityLabel={`${s.name}, ${durationLabel(s.durationMin)}, ${money(s.priceCents)}`} last={i === list.length - 1}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                      <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{s.name}</PText>
                      {s.popular ? <Pill tone="violet" label="Popular" /> : null}
                    </View>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: S.md, rowGap: 2 }}>
                      <PText v="tiny">{durationLabel(s.durationMin)}</PText>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        {s.online ? <Globe size={11} color={C.muted} /> : null}
                        <PText v="tiny">{s.online ? "Online" : "Solo en el local"}</PText>
                      </View>
                      <PText v="tiny">{`${counts.get(s.id) ?? 0} citas en 10 días`}</PText>
                    </View>
                    <View style={{ flexDirection: "row", marginTop: 2 }}>
                      {s.staffIds.map((id, k) => {
                        const st = data.staff.find((x) => x.id === id);
                        return st ? (
                          <View key={id} style={{ marginLeft: k ? -6 : 0, borderRadius: 13, borderWidth: 2, borderColor: C.surface }}>
                            <PAvatar name={st.name} toneKey={st.tone} size={22} />
                          </View>
                        ) : null;
                      })}
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <PText v="h3" style={{ fontVariant: ["tabular-nums"] }}>{money(s.priceCents)}</PText>
                    {s.studentPriceCents ? (
                      <PText v="tiny" color={C.blueDeep} style={{ fontVariant: ["tabular-nums"] }}>{`${money(s.studentPriceCents)} estudiante`}</PText>
                    ) : null}
                  </View>
                </ListRow>
              ))}
            </Panel>
          );
        })
      ) : (
        <Panel>
          <Empty
            icon={Scissors}
            title="Añade tu primer servicio"
            body="Nombre, duración y precio. Con eso ya te pueden reservar."
            action={<PButton label="Añadir servicio" onPress={() => setEditing("new")} />}
          />
        </Panel>
      )}

      <Tip title="Precio estudiante">
        No bajes el precio a todo el mundo: ponlo solo para estudiantes verificados y en tus horas flojas. Llenas los huecos sin tocar tus horas buenas.
      </Tip>

      <ServiceDrawer
        value={editing}
        onClose={() => setEditing(null)}
        onSave={async (s, isNew) => {
          if (
            !(await update(isNew ? "service.create" : "service.update", (d) => ({
              ...d,
              services: isNew ? [...d.services, s] : d.services.map((x) => (x.id === s.id ? s : x)),
            })))
          )
            return;
          toast(isNew ? "Servicio añadido" : "Servicio guardado", { kind: "success", body: s.name });
          setEditing(null);
        }}
        onDelete={async (s) => {
          if (!(await update("service.delete", (d) => ({ ...d, services: d.services.filter((x) => x.id !== s.id) })))) return;
          toast("Servicio eliminado", { kind: "success", body: s.name });
          setEditing(null);
        }}
      />
    </ProPage>
  );
}

const DURATIONS = [15, 20, 30, 45, 60, 75, 90, 120, 150];

function ServiceDrawer({
  value,
  onClose,
  onSave,
  onDelete,
}: {
  value: ProService | "new" | null;
  onClose: () => void;
  onSave: (s: ProService, isNew: boolean) => Promise<void>;
  onDelete: (s: ProService) => Promise<void>;
}) {
  const { data, pending, can } = usePro();
  const isNew = value === "new";
  const base: ProService | null = value === "new" ? null : value;
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [duration, setDuration] = React.useState(30);
  const [price, setPrice] = React.useState("");
  const [student, setStudent] = React.useState("");
  const [staffIds, setStaffIds] = React.useState<string[]>([]);
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    if (!value) return;
    setName(base?.name ?? "");
    setCategory(base?.category ?? data.services[0]?.category ?? "General");
    setDuration(base?.durationMin ?? 30);
    setPrice(base ? String(base.priceCents / 100).replace(".", ",") : "");
    setStudent(base?.studentPriceCents ? String(base.studentPriceCents / 100).replace(".", ",") : "");
    setStaffIds(base?.staffIds ?? data.staff.filter((s) => s.role !== "reception").map((s) => s.id));
    setOnline(base?.online ?? true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const cents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100) || 0;
  const valid = name.trim().length > 1 && cents(price) > 0 && staffIds.length > 0;
  const knownCategories = Array.from(new Set(data.services.map((s) => s.category)));

  const confirmDelete = (s: ProService) =>
    Alert.alert("Eliminar servicio", s.name, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => void onDelete(s) },
    ]);

  const chip = (on: boolean) => ({
    minHeight: 44,
    paddingHorizontal: S.md,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: on ? C.blue : C.border,
    backgroundColor: on ? C.accentSoft : C.surface,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: S.sm,
  });

  return (
    <Sheet
      open={Boolean(value)}
      onClose={onClose}
      title={isNew ? "Nuevo servicio" : "Editar servicio"}
      footer={
        <>
          {!isNew && base ? (
            <PButton label="Eliminar" variant="ghost" disabled={pending || !can("service.delete")} onPress={() => confirmDelete(base)} style={{ marginRight: "auto" }} />
          ) : null}
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton
            label="Guardar"
            disabled={pending || !can(isNew ? "service.create" : "service.update") || !valid}
            onPress={() =>
              void onSave(
                {
                  id: base?.id ?? localId("sv"),
                  name: name.trim(),
                  category: category.trim() || "General",
                  durationMin: duration,
                  priceCents: cents(price),
                  studentPriceCents: cents(student) || undefined,
                  staffIds,
                  online,
                  popular: base?.popular,
                },
                isNew,
              )
            }
          />
        </>
      }
    >
      <Field label="Nombre">
        <Input value={name} onChangeText={setName} placeholder="Corte y barba" label="Nombre" />
      </Field>
      <Field label="Categoría">
        <Input value={category} onChangeText={setCategory} label="Categoría" />
        {knownCategories.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
            {knownCategories.map((c) => (
              <Tap
                key={c}
                onPress={() => setCategory(c)}
                accessibilityRole="button"
                accessibilityState={{ selected: category === c }}
                accessibilityLabel={`Categoría ${c}`}
                style={{ minHeight: 34, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: category === c ? C.text : C.border, justifyContent: "center" }}
              >
                <Text style={{ fontFamily: FONT.semibold, fontSize: 12.5, color: C.text }} maxFontSizeMultiplier={1.3}>{c}</Text>
              </Tap>
            ))}
          </View>
        ) : null}
      </Field>
      <Field label="Duración">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
          {DURATIONS.map((m) => (
            <Tap key={m} onPress={() => setDuration(m)} accessibilityRole="button" accessibilityState={{ selected: duration === m }} style={chip(duration === m)}>
              <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: duration === m ? C.blueDeep : C.text, fontVariant: ["tabular-nums"] }} maxFontSizeMultiplier={1.3}>
                {durationLabel(m)}
              </Text>
            </Tap>
          ))}
        </View>
      </Field>
      <View style={{ flexDirection: "row", gap: S.md }}>
        <View style={{ flex: 1 }}>
          <Field label="Precio (€)">
            <Input value={price} onChangeText={setPrice} keyboardType="decimal-pad" label="Precio en euros" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Precio estudiante (€)" hint="Opcional, en horas valle.">
            <Input value={student} onChangeText={setStudent} keyboardType="decimal-pad" label="Precio estudiante en euros" />
          </Field>
        </View>
      </View>
      <Field label="Quién lo hace">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
          {data.staff.map((s) => {
            const on = staffIds.includes(s.id);
            return (
              <Tap
                key={s.id}
                onPress={() => setStaffIds((prev) => (on ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={s.name}
                style={[chip(on), { paddingLeft: 6 }]}
              >
                <PAvatar name={s.name} toneKey={s.tone} size={28} />
                <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: on ? C.blueDeep : C.text }} maxFontSizeMultiplier={1.3}>{s.name.split(" ")[0]}</Text>
              </Tap>
            );
          })}
        </View>
      </Field>
      <Toggle label="Se puede reservar online desde Franky" value={online} onChange={setOnline} />
    </Sheet>
  );
}
