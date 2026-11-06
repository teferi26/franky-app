"use client";

import * as React from "react";
import {
  Calculator,
  Plus,
  Printer,
  Trash2,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProMenuItem } from "@/lib/pro/types";
import type { ProIngredient, ProRecipe } from "@/lib/pro/tables-types";
import {
  dishMargin,
  marginRanking,
  netPrice,
  priceForTarget,
  priceImpact,
  priceRises,
  recipeCost,
  type DishMargin,
} from "@/lib/pro/tables-ops";
import { ALLERGEN_BY_ID } from "@/lib/pro/tables";
import { dailyMenuCost, setDishCost } from "@/lib/pro/tables-insights";
import { money, plural } from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import {
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  IconButton,
  Kpi,
  KpiRow,
  PageHeader,
  Panel,
  Pill,
  RowList,
  Segmented,
  Tip,
  inputClass,
  textareaClass,
} from "../../kit";
import { AllergenCodes } from "./table-kit";
import {
  OpsMissing,
  escapeHtml,
  eurosText,
  parseEuros,
  printDocument,
  useTablesOps,
} from "./ops-kit";

type Tab = "platos" | "menu" | "ingredientes" | "fichas";
type Sort = "best" | "worst";

const STATUS_TONE = { ok: "success", watch: "warning", high: "danger" } as const;
const STATUS_LABEL = { ok: "Sano", watch: "Vigilar", high: "Pierde margen" } as const;

export default function TablesCostes() {
  const { data, vertical } = usePro();
  const { ops, save } = useTablesOps();
  const [tab, setTab] = React.useState<Tab>("platos");
  if (!ops) return <OpsMissing icon={Calculator} title="Sin escandallos todavía" />;
  const ranking = marginRanking(ops, data.menu);
  const high = ranking.filter((m) => m.status === "high");
  const rises = priceRises(ops);
  const avg = ranking.length
    ? Math.round(ranking.reduce((a, m) => a + m.foodCostPct, 0) / ranking.length)
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Márgenes"
        title={vertical.id === "cafe" ? "Lo que te deja cada taza" : "Lo que te deja cada plato"}
        description={
          ranking.length
            ? `${plural(ranking.length, "producto con escandallo", "productos con escandallo")}. ${high.length ? `${plural(high.length, "pasa", "pasan")} de tu objetivo del ${ops.targetFoodCostPct} %.` : `Todos dentro de tu objetivo del ${ops.targetFoodCostPct} %.`}`
            : "Apunta lo que cuesta cada ingrediente y los gramos de cada plato. Franky calcula el resto."
        }
      >
        <Segmented
          label="Apartado"
          value={tab}
          onChange={setTab}
          options={[
            { value: "platos", label: vertical.id === "cafe" ? "Productos" : "Platos", count: ranking.length },
            { value: "menu", label: "Menú del día" },
            { value: "ingredientes", label: "Ingredientes", count: ops.ingredients.length },
            { value: "fichas", label: "Fichas del equipo" },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={Calculator} label="Coste medio" value={`${avg} %`} hint="de materia prima sobre precio sin IVA" />
        <Kpi label="Pierden margen" value={high.length} hint={high.length ? high.map((m) => m.item.name).slice(0, 2).join(", ") : "ninguno"} emphasis={high.length > 0} />
        <Kpi icon={TrendingUp} label="Subidas de proveedor" value={rises.length} hint={rises[0] ? `${rises[0].ingredient.name} +${rises[0].risePct} %` : "sin cambios"} />
        <Kpi
          label="El que más deja"
          value={ranking[0] ? money(ranking[0].marginCents) : "0 €"}
          hint={ranking[0]?.item.name ?? "sin datos"}
        />
      </KpiRow>

      <section className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold">Tu objetivo de coste</p>
        <ChoiceChips
          value={String(ops.targetFoodCostPct)}
          onChange={(v) => save("costs.target", (o) => ({ ...o, targetFoodCostPct: Number(v) }))}
          options={["28", "30", "32", "35", "38"].map((v) => ({ value: v, label: `${v} %` }))}
        />
      </section>

      {tab === "platos" ? (
        <DishesTab />
      ) : tab === "menu" ? (
        <DailyMenuTab />
      ) : tab === "ingredientes" ? (
        <IngredientsTab />
      ) : (
        <CardsTab />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Platos                                                              */
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
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Panel
        title="Carta por margen"
        action={
          <Segmented<Sort>
            size="sm"
            label="Ordenar"
            value={sort}
            onChange={setSort}
            options={[
              { value: "best", label: "Más deja" },
              { value: "worst", label: "Peor coste" },
            ]}
          />
        }
        flush
      >
        {list.length ? (
          <div className="overflow-x-auto pro-scroll">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border-light text-left text-xs text-text-muted">
                  <th className="px-4 py-2 font-semibold sm:px-5">Producto</th>
                  <th className="px-2 py-2 text-right font-semibold">Precio</th>
                  <th className="px-2 py-2 text-right font-semibold">Coste</th>
                  <th className="px-2 py-2 text-right font-semibold">Coste %</th>
                  <th className="px-4 py-2 text-right font-semibold sm:px-5">Te deja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {list.map((m) => (
                  <MarginRow key={m.item.id} m={m} onOpen={() => setOpen(m.item)} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={Calculator} title="Sin escandallos" body="Elige un producto de la derecha y apunta sus ingredientes." />
        )}
      </Panel>

      <Panel title="Sin escandallo" description={`${without.length} de ${data.menu.length} productos`} flush>
        <RowList className="max-h-[520px] overflow-y-auto pro-scroll">
          {without.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setOpen(m)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary sm:px-5"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}</span>
              <span className="text-xs text-text-muted tabular">{money(m.priceCents)}</span>
              <Plus className="h-4 w-4 text-violet" />
            </button>
          ))}
        </RowList>
      </Panel>

      <RecipeDrawer item={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function MarginRow({ m, onOpen }: { m: DishMargin; onOpen: () => void }) {
  return (
    <tr onClick={onOpen} className="cursor-pointer transition-colors hover:bg-bg-secondary">
      <td className="px-4 py-3 sm:px-5">
        <span className="block font-semibold">{m.item.name}</span>
        <span className="text-xs text-text-muted">{m.item.section}</span>
      </td>
      <td className="px-2 py-3 text-right tabular">{money(m.item.priceCents)}</td>
      <td className="px-2 py-3 text-right tabular text-text-muted">{money(m.costCents)}</td>
      <td className="px-2 py-3 text-right">
        <span title={STATUS_LABEL[m.status]}>
          <Pill tone={STATUS_TONE[m.status]}>{m.foodCostPct.toLocaleString("es-ES")} %</Pill>
          <span className="sr-only"> {STATUS_LABEL[m.status]}</span>
        </span>
      </td>
      <td className="px-4 py-3 text-right font-semibold tabular sm:px-5">{money(m.marginCents)}</td>
    </tr>
  );
}

function RecipeDrawer({ item, onClose }: { item: ProMenuItem | null; onClose: () => void }) {
  const { ops, save } = useTablesOps();
  const toast = useToast();
  const [lines, setLines] = React.useState<ProRecipe["lines"]>([]);
  const [method, setMethod] = React.useState("");
  const [adding, setAdding] = React.useState("");
  React.useEffect(() => {
    if (!item || !ops) return;
    const recipe = ops.recipes.find((r) => r.menuItemId === item.id);
    setLines(recipe?.lines ?? []);
    setMethod(recipe?.method ?? "");
    setAdding("");
    // Solo al abrir otro producto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);
  if (!item || !ops) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;

  const draft: ProRecipe = { menuItemId: item.id, lines, method };
  const cost = recipeCost(ops, draft);
  const net = netPrice(item.priceCents);
  const pctValue = net ? Math.round((cost / net) * 1000) / 10 : 0;
  const target = ops.targetFoodCostPct;
  const suggested = pctValue > target ? priceForTarget(cost, target) : null;

  const submit = async () => {
    const recipe: ProRecipe = { menuItemId: item.id, lines: lines.filter((l) => l.qty > 0), method: method.trim() || undefined };
    if (!(await save("recipe.save", (o) => ({
      ...o,
      recipes: [...o.recipes.filter((r) => r.menuItemId !== item.id), recipe],
    })))) return;
    toast.success("Escandallo guardado", `${item.name}: ${money(cost)} de coste.`);
    onClose();
  };

  return (
    <Drawer
      open
      wide
      onOpenChange={(v) => !v && onClose()}
      title={item.name}
      description={`${money(item.priceCents)} en carta, ${money(net)} sin IVA`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={submit}>Guardar escandallo</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-bg-secondary p-3">
            <p className="text-xs text-text-muted">Coste</p>
            <p className="font-heading text-xl font-bold tabular">{money(cost)}</p>
          </div>
          <div className={cn("rounded-2xl p-3", pctValue > target + 5 ? "bg-rose-50 dark:bg-rose-950/40" : pctValue > target ? "bg-amber-50 dark:bg-amber-950/40" : "bg-emerald-50 dark:bg-emerald-950/40")}>
            <p className="text-xs text-text-muted">Coste %</p>
            <p className="font-heading text-xl font-bold tabular">{pctValue.toLocaleString("es-ES")} %</p>
          </div>
          <div className="rounded-2xl bg-bg-secondary p-3">
            <p className="text-xs text-text-muted">Te deja</p>
            <p className="font-heading text-xl font-bold tabular">{money(net - cost)}</p>
          </div>
        </div>
        {suggested ? (
          <p className="rounded-2xl border border-amber-300/60 px-4 py-3 text-sm">
            Para volver a tu objetivo del {target} %, el precio en carta sería <strong>{money(suggested)}</strong>.
          </p>
        ) : null}

        <FormField label="Ingredientes por ración">
          <div className="flex flex-col gap-2">
            {lines.map((line, i) => {
              const ing = ops.ingredients.find((x) => x.id === line.ingredientId);
              if (!ing) return null;
              return (
                <div key={line.ingredientId} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{ing.name}</span>
                  <input
                    aria-label={`Cantidad de ${ing.name}`}
                    inputMode="decimal"
                    value={String(line.qty).replace(".", ",")}
                    onChange={(e) => {
                      const qty = Number(e.target.value.replace(",", "."));
                      setLines((prev) => prev.map((l, j) => (j === i ? { ...l, qty: Number.isFinite(qty) ? qty : 0 } : l)));
                    }}
                    className={cn(inputClass, "w-20 text-right tabular")}
                  />
                  <span className="w-6 text-xs text-text-muted">{ing.unit}</span>
                  <span className="w-16 text-right text-xs tabular text-text-muted">{money(Math.round(ing.costCents * line.qty))}</span>
                  <IconButton label={`Quitar ${ing.name}`} icon={Trash2} onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))} />
                </div>
              );
            })}
            <select
              aria-label="Añadir ingrediente"
              value={adding}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                setLines((prev) => (prev.some((l) => l.ingredientId === id) ? prev : [...prev, { ingredientId: id, qty: 0.1 }]));
                setAdding("");
              }}
              className={inputClass}
            >
              <option value="">Añadir ingrediente</option>
              {ops.ingredients
                .filter((ing) => !lines.some((l) => l.ingredientId === ing.id))
                .map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name} ({money(ing.costCents)}/{ing.unit})
                  </option>
                ))}
            </select>
          </div>
        </FormField>
        <FormField label="Cómo se prepara" htmlFor="rc-method" hint="Sale en las fichas del equipo: el camarero nuevo lo tiene a mano.">
          <textarea id="rc-method" value={method} onChange={(e) => setMethod(e.target.value)} className={textareaClass} placeholder="Gramos, punto, en qué plato o taza se sirve..." />
        </FormField>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Menú del día                                                        */
/* ------------------------------------------------------------------ */

/**
 * Lo que cuesta servir el menú del día a una persona frente a lo que se
 * cobra (normal y con precio de estudiante). El coste de cada plato se
 * apunta a mano, sin escandallo completo: basta con una aproximación.
 */
function DailyMenuTab() {
  const { data } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [extras, setExtras] = React.useState(() =>
    eurosText(ops?.dailyMenuExtrasCents ?? 0),
  );
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
  const tone = (p: number | null) =>
    p === null
      ? "bg-bg-secondary"
      : p > target + 5
        ? "bg-rose-50 dark:bg-rose-950/40"
        : p > target
          ? "bg-amber-50 dark:bg-amber-950/40"
          : "bg-emerald-50 dark:bg-emerald-950/40";

  // Se guarda al salir del campo: cada plato se apunta una vez y ya está.
  const saveDish = async (dish: string) => {
    const text = draft[dish];
    if (text === undefined) return;
    const cents = text.trim() ? parseEuros(text) : null;
    if (text.trim() && cents === null) return;
    if (await save("daily.cost", (o) => setDishCost(o, dish, cents))) {
      setDraft((d) => {
        const next = { ...d };
        delete next[dish];
        return next;
      });
      toast.success("Coste guardado", dish);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Panel
          title="Por comensal"
          description={`Menú a ${money(menu.priceCents)}${menu.studentPriceCents ? `, ${money(menu.studentPriceCents)} para estudiantes` : ""}.`}
        >
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div className="rounded-2xl bg-bg-secondary p-3">
              <p className="text-xs text-text-muted">Te cuesta</p>
              <p className="font-heading text-xl font-bold tabular">
                {cost.perDinerCents === null ? "Falta algún plato" : money(cost.perDinerCents)}
              </p>
            </div>
            <div className={cn("rounded-2xl p-3", tone(cost.foodCostPct))}>
              <p className="text-xs text-text-muted">Coste %</p>
              <p className="font-heading text-xl font-bold tabular">
                {cost.foodCostPct === null
                  ? "Sin datos"
                  : `${cost.foodCostPct.toLocaleString("es-ES")} %`}
              </p>
            </div>
            <div className="rounded-2xl bg-bg-secondary p-3">
              <p className="text-xs text-text-muted">Te deja</p>
              <p className="font-heading text-xl font-bold tabular">
                {cost.marginCents === null ? "Sin datos" : money(cost.marginCents)}
              </p>
            </div>
            {menu.studentPriceCents ? (
              <div className={cn("rounded-2xl p-3", tone(cost.studentFoodCostPct))}>
                <p className="text-xs text-text-muted">Con precio estudiante</p>
                <p className="font-heading text-xl font-bold tabular">
                  {cost.studentMarginCents === null
                    ? "Sin datos"
                    : money(cost.studentMarginCents)}
                </p>
              </div>
            ) : null}
          </div>
          {cost.foodCostPct !== null &&
          cost.foodCostPct > target &&
          cost.targetPriceCents ? (
            <p className="mt-3 rounded-2xl border border-amber-300/60 px-4 py-3 text-sm">
              Para tu objetivo del {target} %, el menú saldría a{" "}
              <strong>{money(cost.targetPriceCents)}</strong>. También puedes
              cambiar un plato caro por otro.
            </p>
          ) : null}
          {cost.missing.length ? (
            <p className="mt-3 text-sm text-text-muted">
              Sin coste: {cost.missing.join(", ")}.
            </p>
          ) : null}
        </Panel>

        {cost.courses.map((course) => (
          <Panel
            key={course.label}
            title={course.label}
            description={
              course.avgCents !== null
                ? `Media ${money(course.avgCents)} por ración`
                : "Sin coste apuntado"
            }
            flush
          >
            <RowList>
              {course.dishes.map((d) => (
                <div key={d.dish} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {d.dish}
                  </span>
                  {d.costCents === null && draft[d.dish] === undefined ? (
                    <Pill tone="warning">Sin coste</Pill>
                  ) : null}
                  <div className="relative w-28 shrink-0">
                    <input
                      aria-label={`Coste por ración de ${d.dish}`}
                      inputMode="decimal"
                      value={
                        draft[d.dish] ??
                        (d.costCents === null ? "" : eurosText(d.costCents))
                      }
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [d.dish]: e.target.value.replace(/[^\d,.]/g, ""),
                        }))
                      }
                      onBlur={() => void saveDish(d.dish)}
                      placeholder="0,00"
                      className={cn(inputClass, "pr-7 text-right tabular")}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
                      €
                    </span>
                  </div>
                </div>
              ))}
            </RowList>
          </Panel>
        ))}
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Lo que incluye" description={menu.includes || "Pan, bebida y café"}>
          <FormField
            label="Coste por comensal (€)"
            htmlFor="dm-extras"
            hint="Pan, bebida y café o postre."
          >
            <input
              id="dm-extras"
              inputMode="decimal"
              value={extras}
              onChange={(e) => setExtras(e.target.value.replace(/[^\d,.]/g, ""))}
              onBlur={() => {
                const cents = parseEuros(extras);
                if (cents === null) return;
                setExtras(eurosText(cents));
                void save("daily.extras", (o) => ({ ...o, dailyMenuExtrasCents: cents }));
              }}
              className={cn(inputClass, "text-right tabular")}
            />
          </FormField>
        </Panel>
        <Tip title="Sin IVA">
          El coste se compara con el precio del menú sin el 10 % de IVA. Si das
          precio de estudiante, mira que el margen siga saliendo.
        </Tip>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ingredientes                                                        */
/* ------------------------------------------------------------------ */

function IngredientsTab() {
  const { data } = usePro();
  const { ops } = useTablesOps();
  const [editing, setEditing] = React.useState<ProIngredient | "new" | null>(null);
  if (!ops) return null;
  const rises = priceRises(ops);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel
        title="Precio de compra"
        description="Cuando te suba un proveedor, cámbialo aquí y verás qué platos se resienten."
        action={
          <Button size="sm" variant="outline" className="h-10" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Ingrediente
          </Button>
        }
        flush
      >
        <RowList>
          {ops.ingredients.map((ing) => {
            const rise = rises.find((r) => r.ingredient.id === ing.id);
            const uses = ops.recipes.filter((r) => r.lines.some((l) => l.ingredientId === ing.id)).length;
            return (
              <button
                key={ing.id}
                type="button"
                onClick={() => setEditing(ing)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary sm:px-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{ing.name}</span>
                  <span className="block text-xs text-text-muted">{uses ? `En ${plural(uses, "producto", "productos")}` : "Sin usar en escandallos"}</span>
                </span>
                {rise ? <Pill tone="warning">+{rise.risePct.toLocaleString("es-ES")} %</Pill> : null}
                <span className="w-24 text-right text-sm font-semibold tabular">
                  {money(ing.costCents)}<span className="text-xs font-normal text-text-muted">/{ing.unit}</span>
                </span>
              </button>
            );
          })}
        </RowList>
      </Panel>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Subidas recientes" flush>
          {rises.length ? (
            <RowList>
              {rises.map(({ ingredient, risePct }) => {
                const hurt = priceImpact(ops, data.menu, ingredient.id, ingredient.costCents).filter((x) => x.after.status !== "ok");
                return (
                  <div key={ingredient.id} className="px-4 py-3 text-sm sm:px-5">
                    <p className="flex items-center justify-between gap-2 font-semibold">
                      <span className="truncate">{ingredient.name}</span>
                      <span className="text-amber-700 tabular dark:text-amber-300">+{risePct.toLocaleString("es-ES")} %</span>
                    </p>
                    <p className="text-xs text-text-muted">
                      {money(ingredient.previousCostCents ?? 0)} a {money(ingredient.costCents)} por {ingredient.unit}
                      {hurt.length ? ` · afecta a ${hurt.map((h) => h.item.name).join(", ")}` : ""}
                    </p>
                  </div>
                );
              })}
            </RowList>
          ) : (
            <p className="px-4 py-4 text-sm text-text-muted sm:px-5">Ningún precio ha subido.</p>
          )}
        </Panel>
        <Tip title="Sin IVA">
          El coste se compara con el precio de carta sin el 10 % de IVA, que es lo que de verdad entra en caja.
        </Tip>
      </div>
      <IngredientDrawer ingredient={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function IngredientDrawer({ ingredient, onClose }: { ingredient: ProIngredient | "new" | null; onClose: () => void }) {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
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
  if (!ingredient || !ops) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;
  const cents = parseEuros(price);
  const current = ingredient === "new" ? null : ingredient;
  const impact =
    current && cents !== null && cents !== current.costCents
      ? priceImpact(ops, data.menu, current.id, cents)
      : [];

  const submit = async () => {
    if (cents === null) return;
    const next: ProIngredient = current
      ? { ...current, name: name.trim(), unit, costCents: cents, previousCostCents: cents !== current.costCents ? current.costCents : current.previousCostCents, updatedAt: now.toISOString() }
      : { id: localId("i"), name: name.trim(), unit, costCents: cents, updatedAt: now.toISOString() };
    if (!(await save("ingredient.save", (o) => ({
      ...o,
      ingredients: current ? o.ingredients.map((x) => (x.id === next.id ? next : x)) : [...o.ingredients, next],
    })))) return;
    const hurt = impact.filter((x) => x.after.status !== "ok").length;
    toast.success("Precio guardado", hurt ? `${plural(hurt, "producto pierde", "productos pierden")} margen. Revísalo en Productos.` : next.name);
    onClose();
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={current ? current.name : "Nuevo ingrediente"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" disabled={name.trim().length < 2 || cents === null} onClick={submit}>Guardar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Nombre" htmlFor="in-name">
          <input id="in-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="Se compra por">
          <ChoiceChips value={unit} onChange={setUnit} options={[{ value: "kg", label: "Kilo" }, { value: "l", label: "Litro" }, { value: "ud", label: "Unidad" }]} />
        </FormField>
        <FormField label={`Precio por ${unit === "ud" ? "unidad" : unit === "l" ? "litro" : "kilo"} (€, sin IVA)`} htmlFor="in-price">
          <input id="in-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={cn(inputClass, "tabular")} />
        </FormField>
        {impact.length ? (
          <div className="rounded-2xl border border-border p-4 text-sm">
            <p className="font-semibold">Con este precio</p>
            <ul className="mt-2 space-y-2">
              {impact.map(({ item, before, after, suggestedPriceCents }) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{item.name}</span>
                  <span className="flex items-center gap-2 text-xs">
                    <span className="tabular text-text-muted">{before.foodCostPct.toLocaleString("es-ES")} %</span>
                    <span aria-hidden>→</span>
                    <Pill tone={STATUS_TONE[after.status]}>{after.foodCostPct.toLocaleString("es-ES")} %</Pill>
                    {suggestedPriceCents ? <span className="font-semibold">subir a {money(suggestedPriceCents)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Fichas del equipo                                                   */
/* ------------------------------------------------------------------ */

function CardsTab() {
  const { data } = usePro();
  const { ops } = useTablesOps();
  if (!ops) return null;
  const cards = ops.recipes
    .map((r) => ({ recipe: r, item: data.menu.find((m) => m.id === r.menuItemId) }))
    .filter((x): x is { recipe: ProRecipe; item: ProMenuItem } => Boolean(x.item));

  const print = () => {
    const html = cards
      .map(({ recipe, item }) => {
        const lines = recipe.lines
          .map((l) => {
            const ing = ops.ingredients.find((i) => i.id === l.ingredientId);
            return ing ? `<li>${escapeHtml(ing.name)}: ${quantity(l.qty, ing.unit)}</li>` : "";
          })
          .join("");
        const allergens = item.allergens.map((a) => ALLERGEN_BY_ID[a].label).join(", ") || "Sin alérgenos";
        return `<h2>${escapeHtml(item.name)}</h2><p class="muted">Alérgenos: ${escapeHtml(allergens)}</p><ul>${lines}</ul>${recipe.method ? `<p>${escapeHtml(recipe.method)}</p>` : ""}`;
      })
      .join("");
    printDocument("Fichas del equipo", `<h1>Fichas del equipo: ${escapeHtml(data.space.name)}</h1>${html}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-text-muted">
          Cada producto con sus cantidades, cómo se prepara y sus alérgenos. Lo primero que enseñas a quien empieza.
        </p>
        <Button variant="outline" onClick={print} disabled={!cards.length}>
          <Printer className="h-4 w-4" strokeWidth={1.9} /> Imprimir fichas
        </Button>
      </div>
      {cards.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ recipe, item }) => (
            <article key={item.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-bg-primary p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-heading text-base font-bold">{item.name}</h3>
                <AllergenCodes list={item.allergens} />
              </div>
              <ul className="space-y-0.5 text-sm text-text-secondary">
                {recipe.lines.map((l) => {
                  const ing = ops.ingredients.find((i) => i.id === l.ingredientId);
                  return ing ? (
                    <li key={l.ingredientId} className="flex justify-between gap-3">
                      <span className="truncate">{ing.name}</span>
                      <span className="shrink-0 tabular text-text-muted">{quantity(l.qty, ing.unit)}</span>
                    </li>
                  ) : null;
                })}
              </ul>
              {recipe.method ? <p className="border-t border-border-light pt-2 text-sm">{recipe.method}</p> : null}
            </article>
          ))}
        </div>
      ) : (
        <Panel>
          <Empty icon={Calculator} title="Sin fichas" body="Cuando apuntes el escandallo y cómo se prepara un producto, aparecerá aquí su ficha." />
        </Panel>
      )}
    </div>
  );
}

/** 0,008 kg se lee mejor como 8 g. */
function quantity(qty: number, unit: ProIngredient["unit"]): string {
  if (unit === "kg" && qty < 1) return `${Math.round(qty * 1000)} g`;
  if (unit === "l" && qty < 1) return `${Math.round(qty * 1000)} ml`;
  return `${qty.toLocaleString("es-ES")} ${unit}`;
}
