import React from "react";
import { Text, View } from "react-native";
import { Calculator, Plus, Share2, Trash2, TrendingUp, UtensilsCrossed } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProMenuItem } from "../../../../../shared/pro/types";
import type { ProIngredient, ProRecipe } from "../../../../../shared/pro/tables-types";
import {
  dishMargin,
  marginRanking,
  netPrice,
  priceForTarget,
  priceImpact,
  priceRises,
  recipeCost,
  type DishMargin,
} from "../../../../../shared/pro/tables-ops";
import { dailyMenuCost, setDishCost } from "../../../../../shared/pro/tables-insights";
import { ALLERGEN_BY_ID } from "../../../../../shared/pro/tables";
import { money, plural } from "../../../../../shared/pro/format";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import {
  Chips,
  ChoiceGrid,
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
  Tip,
} from "../../kit";
import { AllergenCodes } from "./table-kit";
import { MoneyField, OpsMissing, eurosText, parseEuros, shareText, useTablesOps } from "./ops";
import { Card, PickList, statusTone } from "./ui";

/**
 * Márgenes: escandallo de cada producto, precio de compra de cada
 * ingrediente, coste del menú del día y fichas del equipo. Versión nativa de
 * web/.../tables/costes.tsx.
 */

type Tab = "platos" | "menu" | "ingredientes" | "fichas";
type Sort = "best" | "worst";

const STATUS_TONE = { ok: "success", watch: "warning", high: "danger" } as const;
const STATUS_LABEL = { ok: "Sano", watch: "Vigilar", high: "Pierde margen" } as const;

export default function TablesCostes() {
  const { data, vertical } = usePro();
  const { ops, save } = useTablesOps();
  const [tab, setTab] = React.useState<Tab>("platos");
  if (!ops) {
    return (
      <ProPage>
        <PageHeader eyebrow="Márgenes" title="Lo que te deja cada plato" />
        <OpsMissing icon={Calculator} title="Sin escandallos todavía" />
      </ProPage>
    );
  }
  const ranking = marginRanking(ops, data.menu);
  const high = ranking.filter((m) => m.status === "high");
  const rises = priceRises(ops);
  const avg = ranking.length ? Math.round(ranking.reduce((a, m) => a + m.foodCostPct, 0) / ranking.length) : 0;

  return (
    <ProPage>
      <PageHeader
        eyebrow="Márgenes"
        title={vertical.id === "cafe" ? "Lo que te deja cada taza" : "Lo que te deja cada plato"}
        description={
          ranking.length
            ? `${plural(ranking.length, "producto con escandallo", "productos con escandallo")}. ${high.length ? `${plural(high.length, "pasa", "pasan")} de tu objetivo del ${ops.targetFoodCostPct} %.` : `Todos dentro de tu objetivo del ${ops.targetFoodCostPct} %.`}`
            : "Apunta lo que cuesta cada ingrediente y los gramos de cada plato. Franky calcula el resto."
        }
      >
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "platos", label: vertical.id === "cafe" ? "Productos" : "Platos", count: ranking.length },
            { value: "menu", label: "Menú del día" },
            { value: "ingredientes", label: "Ingredientes", count: ops.ingredients.length },
            { value: "fichas", label: "Fichas" },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={Calculator} label="Coste medio" value={`${avg} %`} hint="de materia prima sobre precio sin IVA" />
        <Kpi
          label="Pierden margen"
          value={high.length}
          hint={high.length ? high.map((m) => m.item.name).slice(0, 2).join(", ") : "ninguno"}
          emphasis={high.length > 0}
        />
        <Kpi
          icon={TrendingUp}
          label="Subidas de proveedor"
          value={rises.length}
          hint={rises[0] ? `${rises[0].ingredient.name} +${rises[0].risePct} %` : "sin cambios"}
        />
        <Kpi label="El que más deja" value={ranking[0] ? money(ranking[0].marginCents) : "0 €"} hint={ranking[0]?.item.name ?? "sin datos"} />
      </KpiRow>

      <PText v="h3" style={{ marginBottom: S.sm }}>
        Tu objetivo de coste
      </PText>
      <Chips
        value={String(ops.targetFoodCostPct)}
        onChange={(v) => void save("costs.target", (o) => ({ ...o, targetFoodCostPct: Number(v) }))}
        options={["28", "30", "32", "35", "38"].map((v) => ({ value: v, label: `${v} %` }))}
      />

      {tab === "platos" ? <DishesTab /> : tab === "menu" ? <DailyMenuTab /> : tab === "ingredientes" ? <IngredientsTab /> : <CardsTab />}
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */
/* Platos                                                               */
/* ------------------------------------------------------------------ */

function DishesTab() {
  const { data } = usePro();
  const { ops } = useTablesOps();
  const [sort, setSort] = React.useState<Sort>("best");
  const [open, setOpen] = React.useState<ProMenuItem | null>(null);
  if (!ops) return null;
  const ranking = marginRanking(ops, data.menu);
  const list = sort === "best" ? ranking : [...ranking].sort((a, b) => b.foodCostPct - a.foodCostPct);
  const without = data.menu.filter((m) => !dishMargin(ops, m));

  return (
    <>
      <Segmented<Sort>
        value={sort}
        onChange={setSort}
        options={[
          { value: "best", label: "Más deja" },
          { value: "worst", label: "Peor coste" },
        ]}
      />
      <Panel title="Carta por margen" flush>
        {list.length ? (
          list.map((m, i) => <MarginRow key={m.item.id} m={m} last={i === list.length - 1} onOpen={() => setOpen(m.item)} />)
        ) : (
          <Empty icon={Calculator} title="Sin escandallos" body="Elige un producto de la lista de abajo y apunta sus ingredientes." />
        )}
      </Panel>

      <Panel title="Sin escandallo" description={`${without.length} de ${data.menu.length} productos`} flush>
        {without.slice(0, 40).map((m, i, arr) => (
          <ListRow key={m.id} last={i === arr.length - 1} onPress={() => setOpen(m)} accessibilityLabel={`Escandallo de ${m.name}`}>
            <PText v="h3" numberOfLines={1} style={{ flex: 1 }}>
              {m.name}
            </PText>
            <PText v="small">{money(m.priceCents)}</PText>
            <Plus size={16} color={C.blue} />
          </ListRow>
        ))}
      </Panel>

      <RecipeSheet item={open} onClose={() => setOpen(null)} />
    </>
  );
}

function MarginRow({ m, onOpen, last }: { m: DishMargin; onOpen: () => void; last?: boolean }) {
  return (
    <ListRow onPress={onOpen} last={last} accessibilityLabel={`${m.item.name}: ${STATUS_LABEL[m.status]}`}>
      <View style={{ flex: 1, gap: 2 }}>
        <PText v="h3" numberOfLines={1}>
          {m.item.name}
        </PText>
        <PText v="tiny">{`${money(m.item.priceCents)} en carta, coste ${money(m.costCents)}`}</PText>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Pill tone={STATUS_TONE[m.status]} label={`${m.foodCostPct.toLocaleString("es-ES")} %`} />
        <PText v="small" color={C.text}>{`deja ${money(m.marginCents)}`}</PText>
      </View>
    </ListRow>
  );
}

function RecipeSheet({ item, onClose }: { item: ProMenuItem | null; onClose: () => void }) {
  const { ops, save } = useTablesOps();
  const [lines, setLines] = React.useState<ProRecipe["lines"]>([]);
  const [method, setMethod] = React.useState("");
  const [picking, setPicking] = React.useState(false);
  React.useEffect(() => {
    if (!item || !ops) return;
    const recipe = ops.recipes.find((r) => r.menuItemId === item.id);
    setLines(recipe?.lines ?? []);
    setMethod(recipe?.method ?? "");
    setPicking(false);
    // Solo al abrir otro producto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);
  if (!item || !ops) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;

  const cost = recipeCost(ops, { menuItemId: item.id, lines, method });
  const net = netPrice(item.priceCents);
  const pctValue = net ? Math.round((cost / net) * 1000) / 10 : 0;
  const target = ops.targetFoodCostPct;
  const suggested = pctValue > target ? priceForTarget(cost, target) : null;
  const pctTone = statusTone(pctValue > target + 5 ? "rose" : pctValue > target ? "amber" : "emerald");
  const available = ops.ingredients.filter((ing) => !lines.some((l) => l.ingredientId === ing.id));

  const submit = async () => {
    const recipe: ProRecipe = { menuItemId: item.id, lines: lines.filter((l) => l.qty > 0), method: method.trim() || undefined };
    const ok = await save("recipe.save", (o) => ({ ...o, recipes: [...o.recipes.filter((r) => r.menuItemId !== item.id), recipe] }));
    if (!ok) return;
    toast("Escandallo guardado", { kind: "success", body: `${item.name}: ${money(cost)} de coste.` });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      description={`${money(item.priceCents)} en carta, ${money(net)} sin IVA`}
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar escandallo" onPress={() => void submit()} />
        </>
      }
    >
      <View style={{ flexDirection: "row", gap: S.sm }}>
        <Box label="Coste" value={money(cost)} />
        <Box label="Coste %" value={`${pctValue.toLocaleString("es-ES")} %`} bg={pctTone.bg} />
        <Box label="Te deja" value={money(net - cost)} />
      </View>
      {suggested ? (
        <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: `${C.warning}88`, padding: S.md }}>
          <PText v="body">
            {`Para volver a tu objetivo del ${target} %, el precio en carta sería `}
            <Text style={{ fontFamily: FONT.heading }}>{money(suggested)}</Text>.
          </PText>
        </View>
      ) : null}

      <Field label="Ingredientes por ración">
        <View style={{ gap: S.sm }}>
          {lines.map((line, i) => {
            const ing = ops.ingredients.find((x) => x.id === line.ingredientId);
            if (!ing) return null;
            return (
              <View key={line.ingredientId} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                <View style={{ flex: 1 }}>
                  <PText v="body" numberOfLines={1}>
                    {ing.name}
                  </PText>
                  <PText v="tiny">{money(Math.round(ing.costCents * line.qty))}</PText>
                </View>
                <View style={{ width: 84 }}>
                  <Input
                    label={`Cantidad de ${ing.name} en ${ing.unit}`}
                    keyboardType="decimal-pad"
                    defaultValue={String(line.qty).replace(".", ",")}
                    onChangeText={(t) => {
                      const qty = Number(t.replace(",", "."));
                      setLines((prev) => prev.map((l, j) => (j === i ? { ...l, qty: Number.isFinite(qty) ? qty : 0 } : l)));
                    }}
                    style={{ textAlign: "right" }}
                  />
                </View>
                <PText v="tiny" style={{ width: 20 }}>
                  {ing.unit}
                </PText>
                <IconButton icon={Trash2} label={`Quitar ${ing.name}`} onPress={() => setLines((prev) => prev.filter((_, j) => j !== i))} />
              </View>
            );
          })}
          {picking ? (
            <PickList
              value=""
              onChange={(id) => {
                setLines((prev) => (prev.some((l) => l.ingredientId === id) ? prev : [...prev, { ingredientId: id, qty: 0.1 }]));
                setPicking(false);
              }}
              options={available.map((ing) => ({ value: ing.id, label: ing.name, detail: `${money(ing.costCents)}/${ing.unit}` }))}
              empty="Ya están todos los ingredientes."
              searchPlaceholder="Buscar ingrediente"
            />
          ) : (
            <PButton label="Añadir ingrediente" icon={Plus} variant="outline" disabled={!available.length} onPress={() => setPicking(true)} />
          )}
        </View>
      </Field>
      <Field label="Cómo se prepara" hint="Sale en las fichas del equipo: el camarero nuevo lo tiene a mano.">
        <Input label="Cómo se prepara" multiline value={method} onChangeText={setMethod} placeholder="Gramos, punto, en qué plato o taza se sirve..." />
      </Field>
    </Sheet>
  );
}

function Box({ label, value, bg }: { label: string; value: string; bg?: string }) {
  return (
    <View style={{ flex: 1, borderRadius: R.md, backgroundColor: bg ?? C.input, padding: S.md, alignItems: "center", gap: 2 }}>
      <PText v="tiny">{label}</PText>
      <Text style={{ fontFamily: FONT.heading, fontSize: 17, color: C.text }} maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Menú del día                                                         */
/* ------------------------------------------------------------------ */

/**
 * Lo que cuesta servir el menú del día a una persona frente a lo que se
 * cobra (normal y con precio de estudiante). El coste de cada plato se
 * apunta a mano, sin escandallo completo: basta con una aproximación.
 */
function DailyMenuTab() {
  const { data } = usePro();
  const { ops, save } = useTablesOps();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [value, setValue] = React.useState("");
  const [extras, setExtras] = React.useState("");
  React.useEffect(() => {
    if (ops) setExtras(eurosText(ops.dailyMenuExtrasCents ?? 0));
    // Solo al entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!ops) return null;
  const menu = data.dailyMenu;
  if (!menu) {
    return (
      <Panel>
        <Empty
          icon={UtensilsCrossed}
          title="Sin menú del día"
          body="Cuando publiques tu menú del día en Carta, aquí verás lo que te cuesta cada comensal y lo que te deja."
        />
      </Panel>
    );
  }
  const cost = dailyMenuCost(ops, menu);
  const target = ops.targetFoodCostPct;
  const pctTone = (p: number | null) => statusTone(p === null ? "slate" : p > target + 5 ? "rose" : p > target ? "amber" : "emerald");

  const saveDish = async (dish: string) => {
    const cents = parseEuros(value);
    const ok = await save("daily.cost", (o) => setDishCost(o, dish, cents));
    if (ok) setEditing(null);
  };

  return (
    <>
      <Card style={{ gap: S.md }}>
        <PText v="label">Por comensal</PText>
        <View style={{ flexDirection: "row", gap: S.sm }}>
          <Box label="Te cuesta" value={cost.perDinerCents === null ? "Falta algún plato" : money(cost.perDinerCents)} />
          <Box
            label={`Coste % a ${money(menu.priceCents)}`}
            value={cost.foodCostPct === null ? "Sin datos" : `${cost.foodCostPct.toLocaleString("es-ES")} %`}
            bg={pctTone(cost.foodCostPct).bg}
          />
        </View>
        <View style={{ flexDirection: "row", gap: S.sm }}>
          <Box label="Te deja" value={cost.marginCents === null ? "Sin datos" : money(cost.marginCents)} />
          {menu.studentPriceCents ? (
            <Box
              label={`Estudiante a ${money(menu.studentPriceCents)}`}
              value={cost.studentMarginCents === null ? "Sin datos" : `deja ${money(cost.studentMarginCents)}`}
              bg={pctTone(cost.studentFoodCostPct).bg}
            />
          ) : null}
        </View>
        {cost.foodCostPct !== null && cost.foodCostPct > target && cost.targetPriceCents ? (
          <PText v="small" color={C.text}>
            {`Para tu objetivo del ${target} %, el menú saldría a ${money(cost.targetPriceCents)}. También puedes cambiar un plato caro por otro.`}
          </PText>
        ) : null}
        {cost.missing.length ? (
          <PText v="small">{`Sin coste: ${cost.missing.join(", ")}. Toca un plato para apuntarlo.`}</PText>
        ) : null}
      </Card>

      {cost.courses.map((course) => (
        <Panel key={course.label} title={course.label} description={course.avgCents !== null ? `Media ${money(course.avgCents)} por ración` : "Sin coste apuntado"} flush>
          {course.dishes.map((d, i) => (
            <View key={d.dish} style={{ borderBottomWidth: i === course.dishes.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
              <ListRow
                last
                onPress={() => {
                  setEditing(editing === d.dish ? null : d.dish);
                  setValue(d.costCents === null ? "" : eurosText(d.costCents));
                }}
                accessibilityLabel={`Coste de ${d.dish}`}
              >
                <PText v="h3" numberOfLines={2} style={{ flex: 1 }}>
                  {d.dish}
                </PText>
                {d.costCents === null ? <Pill tone="warning" label="Sin coste" /> : <PText v="body">{money(d.costCents)}</PText>}
              </ListRow>
              {editing === d.dish ? (
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: S.sm, paddingHorizontal: S.lg, paddingBottom: S.md }}>
                  <View style={{ flex: 1 }}>
                    <MoneyField label="Coste por ración" value={value} onChange={setValue} />
                  </View>
                  <PButton label="Guardar" onPress={() => void saveDish(d.dish)} />
                </View>
              ) : null}
            </View>
          ))}
        </Panel>
      ))}

      <Panel title="Lo que incluye" description={menu.includes || "Pan, bebida y café"}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: S.sm }}>
          <View style={{ flex: 1 }}>
            <MoneyField label="Coste por comensal" value={extras} onChange={setExtras} hint="Pan, bebida y café o postre." />
          </View>
          <PButton
            label="Guardar"
            variant="outline"
            onPress={() => void save("daily.extras", (o) => ({ ...o, dailyMenuExtrasCents: parseEuros(extras) ?? 0 }))}
          />
        </View>
      </Panel>

      <Tip title="Sin IVA">
        El coste se compara con el precio del menú sin el 10 % de IVA. Si das precio de estudiante, mira que el margen siga saliendo.
      </Tip>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Ingredientes                                                         */
/* ------------------------------------------------------------------ */

function IngredientsTab() {
  const { data } = usePro();
  const { ops } = useTablesOps();
  const [editing, setEditing] = React.useState<ProIngredient | "new" | null>(null);
  if (!ops) return null;
  const rises = priceRises(ops);
  return (
    <>
      <Panel
        title="Precio de compra"
        description="Cuando te suba un proveedor, cámbialo aquí y verás qué platos se resienten."
        action={<PButton label="Ingrediente" icon={Plus} variant="outline" small onPress={() => setEditing("new")} />}
        flush
      >
        {ops.ingredients.map((ing, i) => {
          const rise = rises.find((r) => r.ingredient.id === ing.id);
          const uses = ops.recipes.filter((r) => r.lines.some((l) => l.ingredientId === ing.id)).length;
          return (
            <ListRow key={ing.id} last={i === ops.ingredients.length - 1} onPress={() => setEditing(ing)} accessibilityLabel={`Editar ${ing.name}`}>
              <View style={{ flex: 1 }}>
                <PText v="h3" numberOfLines={1}>
                  {ing.name}
                </PText>
                <PText v="tiny">{uses ? `En ${plural(uses, "producto", "productos")}` : "Sin usar en escandallos"}</PText>
              </View>
              {rise ? <Pill tone="warning" label={`+${rise.risePct.toLocaleString("es-ES")} %`} /> : null}
              <PText v="h3">{`${money(ing.costCents)}/${ing.unit}`}</PText>
            </ListRow>
          );
        })}
      </Panel>
      <Panel title="Subidas recientes" flush>
        {rises.length ? (
          rises.map(({ ingredient, risePct }, i) => {
            const hurt = priceImpact(ops, data.menu, ingredient.id, ingredient.costCents).filter((x) => x.after.status !== "ok");
            return (
              <View key={ingredient.id} style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: 2, borderBottomWidth: i === rises.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.sm }}>
                  <PText v="h3" numberOfLines={1} style={{ flex: 1 }}>
                    {ingredient.name}
                  </PText>
                  <PText v="h3" color={C.warning}>{`+${risePct.toLocaleString("es-ES")} %`}</PText>
                </View>
                <PText v="tiny">
                  {`${money(ingredient.previousCostCents ?? 0)} a ${money(ingredient.costCents)} por ${ingredient.unit}${hurt.length ? `, afecta a ${hurt.map((h) => h.item.name).join(", ")}` : ""}`}
                </PText>
              </View>
            );
          })
        ) : (
          <View style={{ padding: S.lg }}>
            <PText v="small">Ningún precio ha subido.</PText>
          </View>
        )}
      </Panel>
      <Tip title="Sin IVA">
        El coste se compara con el precio de carta sin el 10 % de IVA, que es lo que de verdad entra en caja.
      </Tip>
      <IngredientSheet ingredient={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function IngredientSheet({ ingredient, onClose }: { ingredient: ProIngredient | "new" | null; onClose: () => void }) {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const [name, setName] = React.useState("");
  const [unit, setUnit] = React.useState<ProIngredient["unit"]>("kg");
  const [price, setPrice] = React.useState("");
  React.useEffect(() => {
    if (!ingredient) return;
    const i = ingredient === "new" ? null : ingredient;
    setName(i?.name ?? "");
    setUnit(i?.unit ?? "kg");
    setPrice(i ? eurosText(i.costCents) : "");
  }, [ingredient]);
  if (!ingredient || !ops) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const cents = parseEuros(price);
  const current = ingredient === "new" ? null : ingredient;
  const impact = current && cents !== null && cents !== current.costCents ? priceImpact(ops, data.menu, current.id, cents) : [];

  const submit = async () => {
    if (cents === null) return;
    const next: ProIngredient = current
      ? {
          ...current,
          name: name.trim(),
          unit,
          costCents: cents,
          previousCostCents: cents !== current.costCents ? current.costCents : current.previousCostCents,
          updatedAt: now.toISOString(),
        }
      : { id: localId("i"), name: name.trim(), unit, costCents: cents, updatedAt: now.toISOString() };
    const ok = await save("ingredient.save", (o) => ({
      ...o,
      ingredients: current ? o.ingredients.map((x) => (x.id === next.id ? next : x)) : [...o.ingredients, next],
    }));
    if (!ok) return;
    const hurt = impact.filter((x) => x.after.status !== "ok").length;
    toast("Precio guardado", {
      kind: "success",
      body: hurt ? `${plural(hurt, "producto pierde", "productos pierden")} margen. Revísalo en Productos.` : next.name,
    });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={current ? current.name : "Nuevo ingrediente"}
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar" disabled={name.trim().length < 2 || cents === null} onPress={() => void submit()} />
        </>
      }
    >
      <Field label="Nombre">
        <Input label="Nombre" value={name} onChangeText={setName} />
      </Field>
      <Field label="Se compra por">
        <ChoiceGrid
          value={unit}
          onChange={setUnit}
          options={[
            { value: "kg", label: "Kilo" },
            { value: "l", label: "Litro" },
            { value: "ud", label: "Unidad" },
          ]}
        />
      </Field>
      <MoneyField label={`Precio por ${unit === "ud" ? "unidad" : unit === "l" ? "litro" : "kilo"}, sin IVA`} value={price} onChange={setPrice} />
      {impact.length ? (
        <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.md, gap: S.sm }}>
          <PText v="h3">Con este precio</PText>
          {impact.map(({ item, before, after, suggestedPriceCents }) => (
            <View key={item.id} style={{ gap: 4 }}>
              <PText v="body" numberOfLines={1}>
                {item.name}
              </PText>
              <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, flexWrap: "wrap" }}>
                <PText v="tiny">{`${before.foodCostPct.toLocaleString("es-ES")} % pasa a`}</PText>
                <Pill tone={STATUS_TONE[after.status]} label={`${after.foodCostPct.toLocaleString("es-ES")} %`} />
                {suggestedPriceCents ? <PText v="small" color={C.text}>{`subir a ${money(suggestedPriceCents)}`}</PText> : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Fichas del equipo                                                    */
/* ------------------------------------------------------------------ */

function CardsTab() {
  const { data } = usePro();
  const { ops } = useTablesOps();
  if (!ops) return null;
  const cards = ops.recipes
    .map((r) => ({ recipe: r, item: data.menu.find((m) => m.id === r.menuItemId) }))
    .filter((x): x is { recipe: ProRecipe; item: ProMenuItem } => Boolean(x.item));

  const text = () =>
    [
      `Fichas del equipo: ${data.space.name}`,
      ...cards.map(({ recipe, item }) => {
        const lines = recipe.lines
          .map((l) => {
            const ing = ops.ingredients.find((i) => i.id === l.ingredientId);
            return ing ? `- ${ing.name}: ${quantity(l.qty, ing.unit)}` : "";
          })
          .filter(Boolean);
        const allergens = item.allergens.map((a) => ALLERGEN_BY_ID[a].label).join(", ") || "Sin alérgenos";
        const method = recipe.method ? [recipe.method] : [];
        return ["", item.name.toUpperCase(), `Alérgenos: ${allergens}`, ...lines, ...method].join("\n");
      }),
    ].join("\n");

  return (
    <>
      <PText v="body" color={C.muted} style={{ marginBottom: S.md }}>
        Cada producto con sus cantidades, cómo se prepara y sus alérgenos. Lo primero que enseñas a quien empieza.
      </PText>
      <PButton
        label="Compartir las fichas"
        icon={Share2}
        variant="outline"
        disabled={!cards.length}
        onPress={() => shareText("Fichas del equipo", text())}
        style={{ marginBottom: S.lg }}
      />
      {cards.length ? (
        cards.map(({ recipe, item }) => (
          <Card key={item.id} style={{ gap: S.sm }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: S.sm }}>
              <PText v="h2" style={{ flex: 1 }}>
                {item.name}
              </PText>
              <AllergenCodes list={item.allergens} />
            </View>
            {recipe.lines.map((l) => {
              const ing = ops.ingredients.find((i) => i.id === l.ingredientId);
              return ing ? (
                <View key={l.ingredientId} style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md }}>
                  <PText v="body" color={C.muted} numberOfLines={1} style={{ flex: 1 }}>
                    {ing.name}
                  </PText>
                  <PText v="small">{quantity(l.qty, ing.unit)}</PText>
                </View>
              ) : null;
            })}
            {recipe.method ? (
              <View style={{ borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: S.sm }}>
                <PText v="body">{recipe.method}</PText>
              </View>
            ) : null}
          </Card>
        ))
      ) : (
        <Panel>
          <Empty icon={Calculator} title="Sin fichas" body="Cuando apuntes el escandallo y cómo se prepara un producto, aparecerá aquí su ficha." />
        </Panel>
      )}
    </>
  );
}

/** 0,008 kg se lee mejor como 8 g. */
function quantity(qty: number, unit: ProIngredient["unit"]): string {
  if (unit === "kg" && qty < 1) return `${Math.round(qty * 1000)} g`;
  if (unit === "l" && qty < 1) return `${Math.round(qty * 1000)} ml`;
  return `${qty.toLocaleString("es-ES")} ${unit}`;
}
