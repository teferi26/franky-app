import React from "react";
import { Alert, ScrollView, Share, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { BadgeCheck, Leaf, MapPin, Plus, QrCode, Share2, Star, Trash2, UtensilsCrossed, X } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { Allergen, ProDailyMenu, ProMenuItem } from "../../../../../shared/pro/types";
import { localDate, money } from "../../../../../shared/pro/format";
import { ALLERGENS, nearbyReach } from "../../../../../shared/pro/tables";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { Chips, Empty, Field, Input, PButton, PText, PageHeader, Panel, Pill, SearchInput, Segmented, Sheet, Tip, Toggle } from "../../kit";
import { AllergenCodes } from "./table-kit";
import { PickButton, statusTone } from "./ui";

type Tab = "carta" | "menu";

export default function TablesCarta() {
  const { data } = usePro();
  const [tab, setTab] = React.useState<Tab>("carta");
  const [editing, setEditing] = React.useState<ProMenuItem | "new" | null>(null);
  const [qr, setQr] = React.useState(false);

  const sections = [...new Set(data.menu.map((m) => m.section))];
  const soldOut = data.menu.filter((m) => !m.available).length;
  const menu = data.dailyMenu;

  return (
    <ProPage>
      <PageHeader
        eyebrow="Carta"
        title="Carta y menú del día"
        description={`${data.menu.length} productos en ${sections.length} secciones${soldOut ? `, ${soldOut} agotados` : ""}. Menú del día ${menu?.published ? "publicado" : "sin publicar"}.`}
        actions={
          <>
            <PButton label="QR de la carta" icon={QrCode} variant="outline" onPress={() => setQr(true)} />
            {tab === "carta" ? <PButton label="Nuevo producto" icon={Plus} onPress={() => setEditing("new")} /> : null}
          </>
        }
      >
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "carta", label: "Carta", count: data.menu.length },
            { value: "menu", label: "Menú del día" },
          ]}
        />
      </PageHeader>

      {tab === "carta" ? <CartaTab onEdit={setEditing} /> : <DailyTab />}

      <DishDrawer item={editing} onClose={() => setEditing(null)} />
      <QrDrawer open={qr} onClose={() => setQr(false)} />
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */
/* Carta                                                               */
/* ------------------------------------------------------------------ */

function CartaTab({ onEdit }: { onEdit: (item: ProMenuItem | "new") => void }) {
  const { data, update } = usePro();
  const [q, setQ] = React.useState("");
  const [section, setSection] = React.useState("all");
  const [avoid, setAvoid] = React.useState<Allergen[]>([]);
  const [limit, setLimit] = React.useState(40);

  const sections = [...new Set(data.menu.map((m) => m.section))];
  const list = data.menu.filter(
    (m) => (section === "all" || m.section === section) && (!q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase())),
  );
  // Cartas muy largas: se pintan 40 productos y un botón para ver más.
  const shown = list.length > 60 ? list.slice(0, limit) : list;
  const safe = (m: ProMenuItem) => !m.allergens.some((a) => avoid.includes(a));
  const amber = statusTone("amber");
  const emerald = statusTone("emerald");
  const rose = statusTone("rose");

  const toggle = (item: ProMenuItem, key: "available" | "studentFavorite") => {
    const value = !item[key];
    void update(`menu.${key}`, (d) => ({ ...d, menu: d.menu.map((m) => (m.id === item.id ? { ...m, [key]: value } : m)) }));
    if (key === "available")
      toast(value ? "Disponible otra vez" : "Marcado como agotado", { kind: "success", body: value ? item.name : `${item.name} ya no aparece en la carta online.` });
    else
      toast(value ? "Favorito de estudiantes" : "Ya no es favorito", { kind: "success", body: value ? `${item.name} sale destacado en tu ficha de Franky.` : item.name });
  };

  if (!data.menu.length) {
    return (
      <Panel>
        <Empty
          icon={UtensilsCrossed}
          title="Sube tu carta"
          body="Con precio y alérgenos de cada producto. Los estudiantes la ven en tu ficha y en el QR de las mesas."
          action={<PButton label="Primer producto" icon={Plus} onPress={() => onEdit("new")} />}
        />
      </Panel>
    );
  }

  return (
    <>
      <SearchInput value={q} onChange={setQ} placeholder="Buscar producto" />
      <Chips value={section} onChange={setSection} options={[{ value: "all", label: "Todo" }, ...sections.map((s) => ({ value: s, label: s }))]} />

      <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: S.md, marginBottom: S.lg, gap: S.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
          <PText v="h3" style={{ flex: 1 }}>¿Un cliente con alergia? Marca a qué y verás qué puede tomar.</PText>
          {avoid.length ? (
            <Tap onPress={() => setAvoid([])} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center" }}>
              <Text style={{ fontFamily: FONT.semibold, fontSize: 12.5, color: C.blue }} maxFontSizeMultiplier={1.3}>Quitar filtro</Text>
            </Tap>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {ALLERGENS.map((a) => {
            const on = avoid.includes(a.id);
            return (
              <Tap
                key={a.id}
                onPress={() => setAvoid((prev) => (on ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={a.label}
                style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: on ? amber.border : C.border, backgroundColor: on ? amber.bg : C.surface }}
              >
                <Text style={{ fontFamily: FONT.heading, fontSize: 12, color: on ? amber.fg : C.text }} maxFontSizeMultiplier={1.3}>{a.code}</Text>
                <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: on ? amber.fg : C.muted }} maxFontSizeMultiplier={1.3}>{a.label}</Text>
              </Tap>
            );
          })}
        </ScrollView>
        {avoid.length ? (
          <PText v="tiny">
            {`Puede tomar ${data.menu.filter((m) => m.available && safe(m)).length} de ${data.menu.filter((m) => m.available).length} productos disponibles. Lo que no, aparece atenuado.`}
          </PText>
        ) : null}
      </View>

      {sections
        .filter((s) => shown.some((m) => m.section === s))
        .map((s) => {
          const rows = shown.filter((m) => m.section === s);
          return (
            <Panel key={s} title={s} description={`${list.filter((m) => m.section === s).length} productos`} flush>
              {rows.map((m, i) => (
                <View
                  key={m.id}
                  style={{
                    paddingHorizontal: S.lg,
                    paddingVertical: S.md,
                    gap: S.sm,
                    borderBottomWidth: i === rows.length - 1 ? 0 : 1,
                    borderBottomColor: C.borderLight,
                    opacity: !m.available || (avoid.length && !safe(m)) ? 0.5 : 1,
                  }}
                >
                  <Tap onPress={() => onEdit(m)} accessibilityRole="button" accessibilityLabel={`Editar ${m.name}, ${money(m.priceCents)}`} style={{ flexDirection: "row", gap: S.md }}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: S.sm, rowGap: 2 }}>
                        <PText v="h3">{m.name}</PText>
                        {m.vegetarian ? (
                          <View accessible accessibilityLabel="Vegetariano">
                            <Leaf size={14} color={emerald.fg} strokeWidth={1.9} />
                          </View>
                        ) : null}
                        {m.studentFavorite ? <Pill label="Favorito de estudiantes" tone="violet" /> : null}
                      </View>
                      {m.description ? <PText v="tiny" numberOfLines={1}>{m.description}</PText> : null}
                      {m.allergens.length ? <AllergenCodes list={m.allergens} /> : <PText v="tiny">Sin alérgenos declarados</PText>}
                    </View>
                    <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: C.text }} maxFontSizeMultiplier={1.3}>{money(m.priceCents)}</Text>
                  </Tap>
                  <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: S.sm }}>
                    <Tap
                      onPress={() => toggle(m, "studentFavorite")}
                      accessibilityRole="button"
                      accessibilityState={{ selected: Boolean(m.studentFavorite) }}
                      accessibilityLabel={m.studentFavorite ? "Quitar de favoritos de estudiantes" : "Marcar favorito de estudiantes"}
                      style={{ width: 44, height: 44, borderRadius: R.md, borderWidth: 1, borderColor: m.studentFavorite ? `${C.blue}66` : C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface }}
                    >
                      <Star size={18} color={m.studentFavorite ? C.blue : C.text} fill={m.studentFavorite ? C.blue : "transparent"} strokeWidth={1.9} />
                    </Tap>
                    <Tap
                      onPress={() => toggle(m, "available")}
                      accessibilityRole="button"
                      accessibilityState={{ selected: !m.available }}
                      accessibilityLabel={m.available ? `${m.name}: disponible. Marcar como agotado` : `${m.name}: agotado. Marcar como disponible`}
                      style={{
                        height: 44,
                        width: 100,
                        borderRadius: R.md,
                        borderWidth: 1,
                        borderColor: m.available ? emerald.border : rose.border,
                        backgroundColor: m.available ? emerald.bg : rose.bg,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontFamily: FONT.semibold, fontSize: 12.5, color: m.available ? emerald.fg : rose.fg }} maxFontSizeMultiplier={1.3}>
                        {m.available ? "Disponible" : "Agotado"}
                      </Text>
                    </Tap>
                  </View>
                </View>
              ))}
            </Panel>
          );
        })}
      {shown.length < list.length ? <PButton label="Ver más" variant="outline" full onPress={() => setLimit((l) => l + 40)} style={{ marginBottom: S.lg }} /> : null}
      {!list.length ? (
        <Panel>
          <Empty icon={UtensilsCrossed} title="Nada con esa búsqueda" body="Prueba con otro nombre o crea el producto." />
        </Panel>
      ) : null}

      <Panel title="Los 14 alérgenos" description="Las siglas que ven tus clientes en la carta y en el QR.">
        <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: S.sm }}>
          {ALLERGENS.map((a) => (
            <View key={a.id} style={{ width: "50%", flexDirection: "row", alignItems: "center", gap: S.sm, paddingRight: S.sm }}>
              <View style={{ width: 34, height: 24, borderRadius: 6, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: FONT.heading, fontSize: 11, color: C.text }} maxFontSizeMultiplier={1.2}>{a.code}</Text>
              </View>
              <PText v="small" numberOfLines={1} style={{ flex: 1 }}>{a.label}</PText>
            </View>
          ))}
        </View>
      </Panel>
      <Tip title="Alérgenos al día">
        Informar de los 14 alérgenos es obligatorio en cualquier bar o restaurante. Marca cada producto una vez y tu carta, el QR y tu ficha de Franky los enseñan siempre bien.
      </Tip>
      <Tip title="Favoritos de estudiantes">
        Los productos marcados con estrella salen primero en tu ficha de Franky. Elige los que mejor precio tienen: son los que traen gente nueva.
      </Tip>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Editar o crear producto                                             */
/* ------------------------------------------------------------------ */

function DishDrawer({ item, onClose }: { item: ProMenuItem | "new" | null; onClose: () => void }) {
  const { data, update } = usePro();
  const isNew = item === "new";
  const sections = [...new Set(data.menu.map((m) => m.section))];
  const amber = statusTone("amber");

  const [name, setName] = React.useState("");
  const [section, setSection] = React.useState("");
  const [newSection, setNewSection] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [allergens, setAllergens] = React.useState<Allergen[]>([]);
  const [vegetarian, setVegetarian] = React.useState(false);
  const [favorite, setFavorite] = React.useState(false);
  const [available, setAvailable] = React.useState(true);

  React.useEffect(() => {
    if (!item) return;
    const src = item === "new" ? null : item;
    setName(src?.name ?? "");
    setSection(src?.section ?? sections[0] ?? "");
    setNewSection("");
    setDescription(src?.description ?? "");
    setPrice(src ? (src.priceCents / 100).toFixed(2).replace(".", ",") : "");
    setAllergens(src?.allergens ?? []);
    setVegetarian(Boolean(src?.vegetarian));
    setFavorite(Boolean(src?.studentFavorite));
    setAvailable(src?.available ?? true);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const cents = Math.round(Number(price.replace(",", ".")) * 100) || 0;
  const targetSection = newSection.trim() || section || "Carta";
  const valid = name.trim().length > 1 && cents > 0;

  const save = () => {
    const next: ProMenuItem = {
      id: isNew || !item ? localId("mi") : item.id,
      section: targetSection,
      name: name.trim(),
      description: description.trim() || undefined,
      priceCents: cents,
      allergens: ALLERGENS.map((a) => a.id).filter((a) => allergens.includes(a)),
      available,
      studentFavorite: favorite || undefined,
      vegetarian: vegetarian || undefined,
    };
    void update(isNew ? "menu.create" : "menu.edit", (d) => ({
      ...d,
      menu: isNew ? [...d.menu, next] : d.menu.map((m) => (m.id === next.id ? next : m)),
    }));
    toast(isNew ? "Producto añadido" : "Cambios guardados", { kind: "success", body: `${next.name}, ${money(next.priceCents)}. Ya sale en tu carta y en el QR.` });
    onClose();
  };

  const remove = () => {
    if (!item || item === "new") return;
    Alert.alert("Quitar de la carta", item.name, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Quitar",
        style: "destructive",
        onPress: () => {
          void update("menu.remove", (d) => ({ ...d, menu: d.menu.filter((m) => m.id !== item.id) }));
          toast("Producto quitado de la carta", { kind: "success", body: item.name });
          onClose();
        },
      },
    ]);
  };

  return (
    <Sheet
      open={Boolean(item)}
      onClose={onClose}
      title={isNew ? "Nuevo producto" : "Editar producto"}
      description="Precio y alérgenos se actualizan al momento en la carta y en el QR."
      footer={
        <>
          {!isNew ? <PButton label="Quitar" icon={Trash2} variant="ghost" onPress={remove} style={{ marginRight: "auto" }} /> : null}
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar" onPress={save} disabled={!valid} />
        </>
      }
    >
      <Field label="Nombre">
        <Input value={name} onChangeText={setName} placeholder="Patatas bravas" label="Nombre" />
      </Field>
      <Field label="Precio (€)">
        <Input value={price} onChangeText={setPrice} placeholder="5,50" label="Precio en euros" keyboardType="decimal-pad" />
      </Field>

      <Field label="Sección">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {sections.map((s) => (
            <PickButton
              key={s}
              title={s}
              selected={!newSection && section === s}
              onPress={() => {
                setSection(s);
                setNewSection("");
              }}
            />
          ))}
        </View>
        <Input value={newSection} onChangeText={setNewSection} placeholder="O crea una sección nueva" label="Sección nueva" style={{ marginTop: S.sm }} />
      </Field>

      <Field label="Descripción" hint="Opcional. Una línea que abra el apetito.">
        <Input value={description} onChangeText={setDescription} label="Descripción" multiline style={{ minHeight: 64 }} />
      </Field>

      <Field
        label={`Alérgenos (${allergens.length})`}
        hint={allergens.length ? "Toca otra vez para quitar." : "Si no contiene ninguno de los 14, déjalo así y saldrá como sin alérgenos declarados."}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {ALLERGENS.map((a) => {
            const on = allergens.includes(a.id);
            return (
              <Tap
                key={a.id}
                onPress={() => setAllergens((prev) => (on ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={a.label}
                style={{
                  width: "48.8%",
                  minHeight: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: S.sm,
                  paddingHorizontal: 10,
                  borderRadius: R.md,
                  borderWidth: 1,
                  borderColor: on ? amber.border : C.border,
                  backgroundColor: on ? amber.bg : C.surface,
                }}
              >
                <View style={{ width: 32, height: 24, borderRadius: 6, borderWidth: 1, borderColor: on ? amber.border : C.border, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: FONT.heading, fontSize: 10.5, color: on ? amber.fg : C.text }} maxFontSizeMultiplier={1.2}>{a.code}</Text>
                </View>
                <Text style={{ flex: 1, fontFamily: FONT.semibold, fontSize: 13.5, color: on ? amber.fg : C.text }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {a.label}
                </Text>
              </Tap>
            );
          })}
        </View>
      </Field>

      <View>
        <Toggle label="Vegetariano" value={vegetarian} onChange={setVegetarian} />
        <Toggle label="Favorito de estudiantes" detail="Sale destacado en tu ficha de Franky." value={favorite} onChange={setFavorite} />
        <Toggle label="Disponible hoy" detail="Si lo quitas, se marca como agotado." value={available} onChange={setAvailable} />
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Menú del día                                                        */
/* ------------------------------------------------------------------ */

const INCLUDES = ["Pan", "Bebida", "Postre o café"] as const;

function DailyTab() {
  const { data, update, now } = usePro();
  const today = localDate(now);
  const reach = data.space.demo && data.space.walkMinutesToCampus !== null ? nearbyReach(data.space.walkMinutesToCampus) : null;
  const [draft, setDraft] = React.useState<ProDailyMenu | null>(data.dailyMenu);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (!dirty) setDraft(data.dailyMenu);
  }, [data.dailyMenu, dirty]);

  if (!draft) {
    return (
      <Panel>
        <Empty
          icon={UtensilsCrossed}
          title="Aún no tienes menú del día"
          body="Un menú a mediodía con precio de estudiante es lo que más visitas trae entre semana."
          action={
            <PButton
              label="Crear menú de hoy"
              onPress={() => {
                const fresh: ProDailyMenu = {
                  date: today,
                  priceCents: 1200,
                  studentPriceCents: 1000,
                  starters: [],
                  mains: [],
                  desserts: [],
                  includes: "Pan, bebida y postre o café",
                  published: false,
                };
                void update("daily.create", (d) => ({ ...d, dailyMenu: fresh }));
              }}
            />
          }
        />
      </Panel>
    );
  }

  const edit = (fn: (m: ProDailyMenu) => ProDailyMenu) => {
    setDraft((m) => (m ? fn(m) : m));
    setDirty(true);
  };
  const includes = INCLUDES.filter((i) => draft.includes.toLowerCase().includes(i.toLowerCase()));
  const setIncludes = (list: string[]) => {
    const sorted = INCLUDES.filter((i) => list.includes(i));
    const text = sorted.length <= 1 ? sorted.join("") : `${sorted.slice(0, -1).join(", ")} y ${sorted[sorted.length - 1].toLowerCase()}`;
    edit((m) => ({ ...m, includes: text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() }));
  };
  const valid = draft.priceCents > 0 && draft.mains.length > 0;

  const save = (publish?: boolean) => {
    const next = { ...draft, date: today, published: publish ?? draft.published };
    void update(publish ? "daily.publish" : "daily.save", (d) => ({ ...d, dailyMenu: next }));
    setDraft(next);
    setDirty(false);
    if (publish)
      toast("Menú publicado para estudiantes", {
        kind: "success",
        body: reach === null ? undefined : `Avisamos a unos ${reach.toLocaleString("es-ES")} estudiantes a menos de 2 km. Lo verán antes de comer.`,
      });
    else toast("Menú guardado", { kind: "success", body: next.published ? "Los cambios ya se ven en Franky." : "Cuando quieras, publícalo para estudiantes." });
  };

  return (
    <>
      <Panel
        title="Menú de hoy"
        description={
          draft.published
            ? reach === null
              ? "Publicado."
              : `Publicado. Lo ven unos ${reach.toLocaleString("es-ES")} estudiantes cerca.`
            : "Sin publicar: solo lo ves tú."
        }
        action={draft.published ? <Pill label="Publicado" tone="success" /> : <Pill label="Sin publicar" tone="warning" />}
      >
        <View style={{ gap: S.lg }}>
          <View style={{ flexDirection: "row", gap: S.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Precio (€)">
                <PriceInput label="Precio en euros" cents={draft.priceCents} onChange={(c) => edit((m) => ({ ...m, priceCents: c }))} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Precio estudiante (€)" hint="Con Franky verificado.">
                <PriceInput label="Precio estudiante en euros" cents={draft.studentPriceCents ?? 0} onChange={(c) => edit((m) => ({ ...m, studentPriceCents: c || undefined }))} />
              </Field>
            </View>
          </View>
          <ListEditor label="Primeros" items={draft.starters} onChange={(l) => edit((m) => ({ ...m, starters: l }))} placeholder="Ensalada de la huerta" />
          <ListEditor label="Segundos" items={draft.mains} onChange={(l) => edit((m) => ({ ...m, mains: l }))} placeholder="Arroz del señoret" />
          <ListEditor label="Postres" items={draft.desserts} onChange={(l) => edit((m) => ({ ...m, desserts: l }))} placeholder="Flan casero" />
          <Field label="Incluye">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
              {INCLUDES.map((i) => {
                const on = includes.includes(i);
                return <PickButton key={i} title={i} selected={on} onPress={() => setIncludes(on ? includes.filter((x) => x !== i) : [...includes, i])} />;
              })}
            </View>
          </Field>
        </View>
        <View style={{ gap: S.sm, marginTop: S.lg, paddingTop: S.lg, borderTopWidth: 1, borderTopColor: C.borderLight }}>
          {!draft.published ? <PButton label="Publicar para estudiantes" full disabled={!valid} onPress={() => save(true)} /> : null}
          <PButton label="Guardar cambios" variant="outline" full disabled={!dirty || !valid} onPress={() => save()} />
          {draft.published ? (
            <PButton
              label="Retirar"
              variant="ghost"
              full
              onPress={() => {
                void update("daily.unpublish", (d) => (d.dailyMenu ? { ...d, dailyMenu: { ...d.dailyMenu, published: false } } : d));
                setDraft({ ...draft, published: false });
                toast("Menú retirado", { kind: "success", body: "Ya no se enseña a los estudiantes." });
              }}
            />
          ) : null}
        </View>
      </Panel>
      <Tip title="Cuándo publicar">
        Publica antes de las 12:30. Es cuando los estudiantes deciden dónde comer al salir de clase, y el aviso les llega con tu precio de estudiante.
      </Tip>

      <PText v="label" style={{ marginBottom: S.sm }}>Así lo ven los estudiantes</PText>
      <DailyPreview menu={draft} />
      {reach !== null ? (
        <Text style={{ fontSize: 14, color: C.muted, marginTop: S.md }} maxFontSizeMultiplier={1.4}>
          <Text style={{ fontFamily: FONT.display, fontSize: 18, color: C.text }}>{reach.toLocaleString("es-ES")}</Text> estudiantes a menos de 2 km
        </Text>
      ) : null}
    </>
  );
}

function PriceInput({ label, cents, onChange }: { label: string; cents: number; onChange: (cents: number) => void }) {
  const [text, setText] = React.useState(cents ? (cents / 100).toFixed(2).replace(".", ",") : "");
  React.useEffect(() => {
    const parsed = Math.round(Number(text.replace(",", ".")) * 100) || 0;
    if (parsed !== cents) setText(cents ? (cents / 100).toFixed(2).replace(".", ",") : "");
    // Solo cuando cambia el valor desde fuera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);
  return (
    <Input
      label={label}
      keyboardType="decimal-pad"
      value={text}
      onChangeText={(v) => {
        setText(v);
        onChange(Math.round(Number(v.replace(",", ".")) * 100) || 0);
      }}
    />
  );
}

function ListEditor({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  const [value, setValue] = React.useState("");
  const add = () => {
    const v = value.trim();
    if (!v) return;
    onChange([...items, v]);
    setValue("");
  };
  return (
    <Field label={label}>
      {items.map((it, i) => (
        <View key={`${it}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
          <Input
            label={`${label} ${i + 1}`}
            value={it}
            onChangeText={(v) => onChange(items.map((x, j) => (j === i ? v : x)))}
            style={{ flex: 1 }}
          />
          <Tap
            onPress={() => onChange(items.filter((_, j) => j !== i))}
            accessibilityRole="button"
            accessibilityLabel={`Quitar ${it}`}
            style={{ width: 44, height: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface }}
          >
            <X size={17} color={C.text} />
          </Tap>
        </View>
      ))}
      <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
        <Input
          label={`Añadir a ${label.toLowerCase()}`}
          value={value}
          onChangeText={setValue}
          onSubmitEditing={add}
          returnKeyType="done"
          blurOnSubmit={false}
          placeholder={`Añadir: ${placeholder}`}
          style={{ flex: 1 }}
        />
        <PButton label="Añadir" variant="outline" onPress={add} disabled={!value.trim()} />
      </View>
    </Field>
  );
}

function DailyPreview({ menu }: { menu: ProDailyMenu }) {
  const { data } = usePro();
  const groups = [
    { label: "Primeros", items: menu.starters },
    { label: "Segundos", items: menu.mains },
    { label: "Postres", items: menu.desserts },
  ];
  return (
    <View style={{ borderRadius: 26, borderWidth: 1, borderColor: C.border, backgroundColor: C.input, padding: 10 }}>
      <View style={{ borderRadius: 20, backgroundColor: C.surface, padding: S.lg, gap: 4, ...SHADOW.card }}>
        <View style={{ alignSelf: "flex-start", backgroundColor: C.blue, borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 11, fontFamily: FONT.heading }} maxFontSizeMultiplier={1.2}>Menú del día</Text>
        </View>
        <PText v="h3" style={{ marginTop: 4 }}>{data.space.name}</PText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <MapPin size={12} color={C.muted} />
          <PText v="tiny">{`A ${data.space.walkMinutesToCampus} min de tu facultad`}</PText>
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: S.sm, marginTop: S.sm }}>
          <Text style={{ fontFamily: FONT.display, fontSize: 24, color: C.text }} maxFontSizeMultiplier={1.2}>{money(menu.studentPriceCents ?? menu.priceCents)}</Text>
          {menu.studentPriceCents ? (
            <Text style={{ fontSize: 12, color: C.muted, textDecorationLine: "line-through" }} maxFontSizeMultiplier={1.2}>{money(menu.priceCents)}</Text>
          ) : null}
        </View>
        {menu.studentPriceCents ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <BadgeCheck size={12} color={C.blueDeep} />
            <PText v="tiny" color={C.blueDeep}>Precio de estudiante</PText>
          </View>
        ) : null}
        <View style={{ gap: 10, marginTop: S.md, paddingTop: S.md, borderTopWidth: 1, borderTopColor: C.borderLight }}>
          {groups.map((g) => (
            <View key={g.label}>
              <PText v="label">{g.label}</PText>
              {g.items.length ? (
                g.items.map((i, k) => (
                  <PText key={`${i}-${k}`} v="body">{i}</PText>
                ))
              ) : (
                <PText v="small">Por añadir</PText>
              )}
            </View>
          ))}
        </View>
        {menu.includes ? <PText v="tiny" color={C.text} style={{ marginTop: S.md }}>{`Incluye ${menu.includes.toLowerCase()}.`}</PText> : null}
        <PText v="tiny">Alérgenos: pregunta al personal o mira la carta.</PText>
        <View style={{ marginTop: S.md, height: 36, borderRadius: R.sm, backgroundColor: C.text, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: C.bg, fontFamily: FONT.semibold, fontSize: 13 }} maxFontSizeMultiplier={1.2}>Cómo llegar</Text>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* QR de la carta                                                      */
/* ------------------------------------------------------------------ */

function QrDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = usePro();
  const url = `franky.es/n/${data.space.slug}`;
  // En la app no hay portapapeles: se comparte el enlace con la hoja del sistema.
  const share = async () => {
    try {
      await Share.share({ message: `https://${url}` });
    } catch {
      toast("Enlace de tu carta", { kind: "info", body: url });
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="QR de la carta"
      description="Para las mesas y la barra. Siempre al día: lo agotado desaparece al momento."
      footer={
        <>
          <PButton label="Cerrar" variant="ghost" onPress={onClose} />
          <PButton label="Compartir enlace" icon={Share2} onPress={() => void share()} />
        </>
      }
    >
      <View style={{ alignItems: "center", gap: S.md }}>
        {/* El QR va siempre en negro sobre blanco para que se lea bien, también en tema oscuro. */}
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Código QR de ${url}`}
          style={{ borderRadius: 24, borderWidth: 1, borderColor: C.border, backgroundColor: "#FFFFFF", padding: 20, alignItems: "center", ...SHADOW.card }}
        >
          <QRCode value={`https://${url}`} size={208} color="#000000" backgroundColor="#FFFFFF" quietZone={4} />
          <Text style={{ marginTop: S.md, fontFamily: FONT.heading, fontSize: 14, color: "#000000", textAlign: "center" }} maxFontSizeMultiplier={1.3}>{data.space.name}</Text>
          <Text style={{ fontSize: 12, color: "#737373", textAlign: "center" }} maxFontSizeMultiplier={1.3}>Carta y alérgenos</Text>
        </View>
        <Text selectable style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.text }} maxFontSizeMultiplier={1.3}>{url}</Text>
      </View>
      <Tip title="Truco">
        Pon el QR también en la puerta: quien lo escanea sin estar sentado ve tu menú del día y guarda tu local en Franky.
      </Tip>
    </Sheet>
  );
}
