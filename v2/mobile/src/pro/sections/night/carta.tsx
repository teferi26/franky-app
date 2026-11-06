import React from "react";
import { Alert, Share, Switch, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Plus, QrCode, Share2, Star, Wine } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, R, S } from "@/theme";
import type { Allergen, ProMenuItem } from "../../../../../shared/pro/types";
import { money } from "../../../../../shared/pro/format";
import { ALLERGENS } from "../../../../../shared/pro/tables";
import { offerWindows } from "../../../../../shared/pro/night-ops";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { Chips, ChoiceGrid, Empty, Field, Input, MultiChips, PButton, PText, PageHeader, Panel, SearchInput, Sheet, Tip, Toggle } from "../../kit";
import { AllergenCodes } from "../tables/table-kit";
import { Note, euros, eurosInput } from "./ops-ui";

/**
 * Carta de copas del pub con alérgenos y agotados: versión nativa de
 * web/.../night/carta.tsx. La misma carta alimenta el consumo de los reservados.
 */
export default function NightCarta() {
  const { data, now, update } = usePro();
  const [section, setSection] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState<ProMenuItem | "new" | null>(null);
  const [qr, setQr] = React.useState(false);

  const sections = [...new Set(data.menu.map((m) => m.section))];
  const list = data.menu.filter((m) => (section === "all" || m.section === section) && (!q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase())));
  const soldOut = data.menu.filter((m) => !m.available).length;
  const withAllergens = data.menu.filter((m) => m.allergens.length).length;
  const { active } = offerWindows(data, now);

  const toggle = async (item: ProMenuItem, available: boolean) => {
    const ok = await update("menu.available", (d) => ({ ...d, menu: d.menu.map((m) => (m.id === item.id ? { ...m, available } : m)) }));
    if (!ok) return;
    toast(available ? `${item.name} disponible` : `${item.name} agotado`, {
      kind: "success",
      body: available ? undefined : "Deja de salir en la carta y en los reservados.",
    });
  };

  return (
    <ProPage>
      <PageHeader
        eyebrow="Carta"
        title="Carta de copas"
        description={
          data.menu.length
            ? `${data.menu.length} productos en ${sections.length} secciones, ${withAllergens} con alérgenos marcados${soldOut ? ` y ${soldOut} agotados` : ""}. Tus clientes la ven en tu ficha y en el QR de las mesas.`
            : "Sube tus bebidas y el picoteo con sus alérgenos. Sale en tu ficha de Franky y en un QR para las mesas."
        }
        actions={
          <>
            <PButton label="Nuevo producto" icon={Plus} onPress={() => setEditing("new")} />
            <PButton label="QR de la carta" icon={QrCode} variant="outline" onPress={() => setQr(true)} />
          </>
        }
      />

      {active.length ? (
        <View style={{ marginBottom: S.lg }}>
          <Note>{`Ahora: ${active[0].offer.title}. ${active[0].offer.detail}`}</Note>
        </View>
      ) : null}

      {data.menu.length ? (
        <>
          <Chips value={section} onChange={setSection} options={[{ value: "all", label: "Todo" }, ...sections.map((s) => ({ value: s, label: s }))]} />
          <SearchInput value={q} onChange={setQ} placeholder="Buscar en la carta" />
          {(section === "all" ? sections : [section]).map((s) => {
            const items = list.filter((m) => m.section === s);
            if (!items.length) return null;
            return (
              <Panel key={s} title={s} flush>
                {items.map((m, i) => (
                  <View
                    key={m.id}
                    style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md, borderBottomWidth: i === items.length - 1 ? 0 : 1, borderBottomColor: C.borderLight, opacity: m.available ? 1 : 0.55 }}
                  >
                    <Tap onPress={() => setEditing(m)} accessibilityRole="button" accessibilityLabel={`Editar ${m.name}`} style={{ flex: 1, gap: 4, minHeight: 44, justifyContent: "center" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{m.name}</PText>
                        {m.studentFavorite ? <Star size={13} color={C.blue} strokeWidth={1.9} accessibilityLabel="Favorito de estudiantes" /> : null}
                      </View>
                      {m.description ? <PText v="tiny" numberOfLines={1}>{m.description}</PText> : null}
                      <AllergenCodes list={m.allergens} />
                    </Tap>
                    <PText v="h3">{money(m.priceCents)}</PText>
                    <Switch
                      value={m.available}
                      onValueChange={(v) => void toggle(m, v)}
                      accessibilityLabel={`${m.name} disponible`}
                      trackColor={{ true: C.blue, false: C.border }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                ))}
              </Panel>
            );
          })}
          {!list.length ? <PText v="small">No hay nada con ese nombre.</PText> : null}
        </>
      ) : (
        <Panel>
          <Empty
            icon={Wine}
            title="Tu carta está vacía"
            body="Empieza por lo que más se pide: cañas, combinados y las botellas para compartir. Marca los alérgenos de cada uno."
            action={<PButton label="Nuevo producto" icon={Plus} onPress={() => setEditing("new")} />}
          />
        </Panel>
      )}

      <Tip title="Alérgenos también en las copas">
        La cerveza lleva gluten, el vino y el vermut sulfitos y algunos cócteles huevo. Márcalos una vez y salen siempre en la carta y en el QR.
      </Tip>

      <ItemSheet item={editing} sections={sections} onClose={() => setEditing(null)} />
      <QrSheet open={qr} onClose={() => setQr(false)} />
    </ProPage>
  );
}

function ItemSheet({ item, sections, onClose }: { item: ProMenuItem | "new" | null; sections: string[]; onClose: () => void }) {
  const { update } = usePro();
  const isNew = item === "new";
  const current = item && item !== "new" ? item : null;
  const [name, setName] = React.useState("");
  const [section, setSection] = React.useState("");
  const [newSection, setNewSection] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [allergens, setAllergens] = React.useState<Allergen[]>([]);
  const [favorite, setFavorite] = React.useState(false);

  React.useEffect(() => {
    if (!item) return;
    const it = item === "new" ? null : item;
    setName(it?.name ?? "");
    setSection(it?.section ?? sections[0] ?? "__new");
    setNewSection("");
    setPrice(it ? eurosInput(it.priceCents) : "");
    setDescription(it?.description ?? "");
    setAllergens(it?.allergens ?? []);
    setFavorite(Boolean(it?.studentFavorite));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  if (!item) return null;

  const finalSection = section === "__new" ? newSection.trim() : section;
  const valid = name.trim().length > 1 && euros(price) > 0 && finalSection.length > 1;

  const save = async () => {
    const next: ProMenuItem = {
      id: current?.id ?? localId("m"),
      section: finalSection,
      name: name.trim(),
      description: description.trim() || undefined,
      priceCents: euros(price),
      allergens,
      available: current?.available ?? true,
      studentFavorite: favorite,
    };
    const ok = await update(isNew ? "menu.create" : "menu.update", (d) => ({
      ...d,
      menu: isNew ? [...d.menu, next] : d.menu.map((m) => (m.id === next.id ? next : m)),
    }));
    if (!ok) return;
    toast(isNew ? "Añadido a la carta" : "Guardado", { kind: "success" });
    onClose();
  };

  const remove = () => {
    if (!current) return;
    Alert.alert(`¿Quitar ${current.name} de la carta?`, undefined, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Quitar",
        style: "destructive",
        onPress: async () => {
          const ok = await update("menu.delete", (d) => ({ ...d, menu: d.menu.filter((m) => m.id !== current.id) }));
          if (!ok) return;
          toast(`${current.name} quitado de la carta`, { kind: "success" });
          onClose();
        },
      },
    ]);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? "Nuevo producto" : current?.name ?? "Producto"}
      description="Precio, sección y los 14 alérgenos."
      footer={
        <>
          {current ? <PButton label="Quitar" variant="ghost" onPress={remove} /> : null}
          <PButton label="Guardar" onPress={() => void save()} disabled={!valid} />
        </>
      }
    >
      <Field label="Nombre">
        <Input value={name} onChangeText={setName} placeholder="Ginebra con tónica" label="Nombre del producto" />
      </Field>
      <Field label="Precio (€)">
        <Input value={price} onChangeText={setPrice} keyboardType="decimal-pad" label="Precio en euros" />
      </Field>
      <Field label="Sección">
        <ChoiceGrid value={section} onChange={setSection} options={[...sections.map((s) => ({ value: s, label: s })), { value: "__new", label: "Otra" }]} />
        {section === "__new" ? <Input value={newSection} onChangeText={setNewSection} placeholder="Vermut, cafés, cócteles sin alcohol..." label="Nombre de la sección" /> : null}
      </Field>
      <Field label="Descripción">
        <Input value={description} onChangeText={setDescription} placeholder="Marcas o lo que incluye" label="Descripción" />
      </Field>
      <Field label="Alérgenos">
        <MultiChips value={allergens} onChange={(v) => setAllergens(v as Allergen[])} options={ALLERGENS.map((a) => ({ value: a.id, label: a.label }))} />
      </Field>
      <Toggle label="Favorito de estudiantes" detail="Sale destacado en tu ficha de Franky." value={favorite} onChange={setFavorite} />
    </Sheet>
  );
}

function QrSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = usePro();
  const url = `https://franky.es/n/${data.space.slug}`;
  const share = () => {
    void Share.share({ message: url, url }).catch(() => {
      toast("No se ha podido compartir", { kind: "error" });
    });
  };
  return (
    <Sheet open={open} onClose={onClose} title="QR de la carta" description="Para las mesas y la barra. Lo agotado deja de salir al momento." footer={<PButton label="Compartir enlace" icon={Share2} onPress={share} />}>
      <View style={{ alignItems: "center", gap: S.sm }}>
        {/* El QR necesita colores fijos: negro sobre blanco para que lo lea cualquier móvil. */}
        <View style={{ borderRadius: R.xl, borderWidth: 1, borderColor: C.border, backgroundColor: "#FFFFFF", padding: S.lg, alignItems: "center", gap: S.sm }}>
          <QRCode value={url} size={200} color="#000000" backgroundColor="#FFFFFF" quietZone={4} />
          <PText v="h3" color="#000000">{data.space.name}</PText>
          <PText v="tiny" color="#000000">Carta y alérgenos</PText>
        </View>
        <PText v="small" color={C.text}>{url.replace("https://", "")}</PText>
      </View>
      <Tip title="Truco">
        Ponlo también en la puerta y en los sofás: quien lo escanea ve la carta, tus noches y puede pedir reservado para su cumpleaños.
      </Tip>
    </Sheet>
  );
}
