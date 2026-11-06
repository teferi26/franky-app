"use client";

import * as React from "react";
import QRCode from "qrcode";
import {
  BadgeCheck,
  Copy,
  History,
  Leaf,
  MapPin,
  Plus,
  Printer,
  QrCode,
  Star,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { Allergen, ProDailyMenu, ProMenuItem } from "@/lib/pro/types";
import { localDate, money } from "@/lib/pro/format";
import { ALLERGENS, nearbyReach } from "@/lib/pro/tables";
import { cn } from "@/lib/utils";
import { Drawer, Empty, FormField, IconButton, PageHeader, Panel, Pill, RowList, SearchInput, Segmented, Tip, inputClass, textareaClass } from "../../kit";
import { AllergenCodes } from "./table-kit";
import { WhatsAppButton, useTablesOps } from "./ops-kit";
import { printAllergenSheet } from "./allergen-sheet";
import {
  dailyMenuMessage,
  recentDishes,
  rememberDailyMenu,
} from "@/lib/pro/tables-day";

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
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Carta"
        title="Carta y menú del día"
        description={`${data.menu.length} productos en ${sections.length} secciones${soldOut ? `, ${soldOut} agotados` : ""}. Menú del día ${menu?.published ? "publicado" : "sin publicar"}.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setQr(true)}>
              <QrCode className="h-4 w-4" strokeWidth={1.9} /> QR de la carta
            </Button>
            {tab === "carta" ? (
              <Button variant="dark" onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" /> Nuevo producto
              </Button>
            ) : null}
          </>
        }
      >
        <Segmented
          label="Sección"
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Carta                                                               */
/* ------------------------------------------------------------------ */

function CartaTab({ onEdit }: { onEdit: (item: ProMenuItem | "new") => void }) {
  const { data, update } = usePro();
  const toast = useToast();
  const [q, setQ] = React.useState("");
  const [section, setSection] = React.useState("all");
  const [avoid, setAvoid] = React.useState<Allergen[]>([]);

  const sections = [...new Set(data.menu.map((m) => m.section))];
  const list = data.menu.filter(
    (m) => (section === "all" || m.section === section) && (!q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const safe = (m: ProMenuItem) => !m.allergens.some((a) => avoid.includes(a));

  const toggle = (item: ProMenuItem, key: "available" | "studentFavorite") => {
    const value = !item[key];
    update(`menu.${key}`, (d) => ({ ...d, menu: d.menu.map((m) => (m.id === item.id ? { ...m, [key]: value } : m)) }));
    if (key === "available") toast.success(value ? "Disponible otra vez" : "Marcado como agotado", value ? item.name : `${item.name} ya no aparece en la carta online.`);
    else toast.success(value ? "Favorito de estudiantes" : "Ya no es favorito", value ? `${item.name} sale destacado en tu ficha de Franky.` : item.name);
  };

  if (!data.menu.length) {
    return (
      <Panel>
        <Empty
          icon={UtensilsCrossed}
          title="Sube tu carta"
          body="Con precio y alérgenos de cada producto. Los estudiantes la ven en tu ficha y en el QR de las mesas."
          action={
            <Button variant="dark" onClick={() => onEdit("new")}>
              <Plus className="h-4 w-4" /> Primer producto
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar producto" className="sm:w-64" />
          <Segmented
            size="sm"
            label="Filtrar por sección"
            value={section}
            onChange={setSection}
            options={[{ value: "all", label: "Todo" }, ...sections.map((s) => ({ value: s, label: s }))]}
          />
        </div>

        <section className="rounded-2xl border border-border bg-bg-primary p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">¿Un cliente con alergia? Marca a qué y verás qué puede tomar.</p>
            {avoid.length ? (
              <button type="button" onClick={() => setAvoid([])} className="min-h-8 text-xs font-semibold text-violet">
                Quitar filtro
              </button>
            ) : null}
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 pro-scroll">
            {ALLERGENS.map((a) => {
              const on = avoid.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAvoid((prev) => (on ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold",
                    on ? "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "border-border text-text-secondary hover:border-text-primary/25",
                  )}
                >
                  <span className="font-bold">{a.code}</span> {a.label}
                </button>
              );
            })}
          </div>
          {avoid.length ? (
            <p className="mt-2 text-xs text-text-muted">
              Puede tomar {data.menu.filter((m) => m.available && safe(m)).length} de {data.menu.filter((m) => m.available).length} productos disponibles. Lo que no, aparece atenuado.
            </p>
          ) : null}
        </section>

        {sections
          .filter((s) => list.some((m) => m.section === s))
          .map((s) => (
            <Panel key={s} title={s} description={`${list.filter((m) => m.section === s).length} productos`} flush>
              <RowList>
                {list
                  .filter((m) => m.section === s)
                  .map((m) => (
                    <div key={m.id} className={cn("flex items-center gap-3 px-4 py-3 sm:px-5", (!m.available || (avoid.length && !safe(m))) && "opacity-50")}>
                      <button type="button" onClick={() => onEdit(m)} className="min-w-0 flex-1 text-left">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold">
                          <span>{m.name}</span>
                          {m.vegetarian ? <Leaf className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.9} aria-label="Vegetariano" /> : null}
                          {m.studentFavorite ? <Pill tone="violet">Favorito de estudiantes</Pill> : null}
                        </span>
                        {m.description ? <span className="mt-0.5 block truncate text-xs text-text-muted">{m.description}</span> : null}
                        <span className="mt-1 block">
                          {m.allergens.length ? <AllergenCodes list={m.allergens} /> : <span className="text-[0.7rem] text-text-muted">Sin alérgenos declarados</span>}
                        </span>
                      </button>
                      <span className="shrink-0 text-right font-heading text-base font-bold tabular">{money(m.priceCents)}</span>
                      <IconButton
                        label={m.studentFavorite ? "Quitar de favoritos de estudiantes" : "Marcar favorito de estudiantes"}
                        icon={Star}
                        onClick={() => toggle(m, "studentFavorite")}
                        className={cn("h-10 w-10 shrink-0", m.studentFavorite && "border-violet/40 text-violet [&_svg]:fill-violet")}
                      />
                      <button
                        type="button"
                        aria-pressed={!m.available}
                        onClick={() => toggle(m, "available")}
                        className={cn(
                          "h-10 w-[5.6rem] shrink-0 rounded-xl border text-xs font-semibold transition-colors",
                          m.available
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
                        )}
                      >
                        {m.available ? "Disponible" : "Agotado"}
                      </button>
                    </div>
                  ))}
              </RowList>
            </Panel>
          ))}
        {!list.length ? (
          <Panel>
            <Empty icon={UtensilsCrossed} title="Nada con esa búsqueda" body="Prueba con otro nombre o crea el producto." />
          </Panel>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <Panel
          title="Los 14 alérgenos"
          description="Las siglas que ven tus clientes en la carta y en el QR."
          action={
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => {
                const label = new Date().toLocaleDateString("es-ES", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "Europe/Madrid",
                });
                if (!printAllergenSheet(data.space.name, data.menu, label))
                  toast.error("No se ha podido abrir la hoja", "Permite las ventanas emergentes para imprimir.");
              }}
            >
              <Printer className="h-3.5 w-3.5" strokeWidth={1.9} /> Hoja A4
            </Button>
          }
        >
          <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            {ALLERGENS.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <span className="inline-flex h-6 w-8 shrink-0 items-center justify-center rounded-md border border-border text-[0.68rem] font-bold">{a.code}</span>
                <span className="truncate text-text-secondary">{a.label}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Tip title="Alérgenos al día">
          Informar de los 14 alérgenos es obligatorio en cualquier bar o restaurante. Marca cada producto una vez y tu carta, el QR y tu ficha de Franky los enseñan siempre bien.
        </Tip>
        <Tip title="Favoritos de estudiantes">
          Los productos marcados con estrella salen primero en tu ficha de Franky. Elige los que mejor precio tienen: son los que traen gente nueva.
        </Tip>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editar o crear producto                                             */
/* ------------------------------------------------------------------ */

function DishDrawer({ item, onClose }: { item: ProMenuItem | "new" | null; onClose: () => void }) {
  const { data, update } = usePro();
  const toast = useToast();
  const isNew = item === "new";
  const sections = [...new Set(data.menu.map((m) => m.section))];

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
    update(isNew ? "menu.create" : "menu.edit", (d) => ({
      ...d,
      menu: isNew ? [...d.menu, next] : d.menu.map((m) => (m.id === next.id ? next : m)),
    }));
    toast.success(isNew ? "Producto añadido" : "Cambios guardados", `${next.name}, ${money(next.priceCents)}. Ya sale en tu carta y en el QR.`);
    onClose();
  };

  const remove = () => {
    if (!item || item === "new") return;
    update("menu.remove", (d) => ({ ...d, menu: d.menu.filter((m) => m.id !== item.id) }));
    toast.success("Producto quitado de la carta", item.name);
    onClose();
  };

  return (
    <Drawer
      open={Boolean(item)}
      onOpenChange={(v) => !v && onClose()}
      wide
      title={isNew ? "Nuevo producto" : "Editar producto"}
      description="Precio y alérgenos se actualizan al momento en la carta y en el QR."
      footer={
        <>
          {!isNew ? (
            <Button variant="ghost" className="mr-auto text-rose-600" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Quitar
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={save} disabled={!valid}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
          <FormField label="Nombre" htmlFor="dish-name">
            <input id="dish-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Patatas bravas" className={inputClass} />
          </FormField>
          <FormField label="Precio (€)" htmlFor="dish-price">
            <input id="dish-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="5,50" className={cn(inputClass, "tabular")} />
          </FormField>
        </div>

        <FormField label="Sección">
          <div className="flex flex-wrap gap-1.5">
            {sections.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={!newSection && section === s}
                onClick={() => {
                  setSection(s);
                  setNewSection("");
                }}
                className={cn(
                  "h-9 rounded-full border px-3 text-xs font-semibold",
                  !newSection && section === s ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary hover:border-text-primary/25",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <input aria-label="Sección nueva" value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="O crea una sección nueva" className={cn(inputClass, "mt-2")} />
        </FormField>

        <FormField label="Descripción" htmlFor="dish-desc" hint="Opcional. Una línea que abra el apetito.">
          <textarea id="dish-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={cn(textareaClass, "min-h-[64px]")} />
        </FormField>

        <FormField label={`Alérgenos (${allergens.length})`} hint={allergens.length ? "Toca otra vez para quitar." : "Si no contiene ninguno de los 14, déjalo así y saldrá como sin alérgenos declarados."}>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {ALLERGENS.map((a) => {
              const on = allergens.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAllergens((prev) => (on ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
                  className={cn(
                    "flex h-11 items-center gap-2 rounded-xl border px-2.5 text-left text-sm",
                    on ? "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "border-border text-text-secondary hover:border-text-primary/25",
                  )}
                >
                  <span className={cn("inline-flex h-6 w-8 shrink-0 items-center justify-center rounded-md border text-[0.66rem] font-bold", on ? "border-amber-400" : "border-border")}>{a.code}</span>
                  <span className="truncate font-semibold">{a.label}</span>
                </button>
              );
            })}
          </div>
        </FormField>

        <div className="flex flex-col gap-3">
          <Check checked={vegetarian} onChange={setVegetarian} label="Vegetariano" />
          <Check checked={favorite} onChange={setFavorite} label="Favorito de estudiantes" hint="Sale destacado en tu ficha de Franky." />
          <Check checked={available} onChange={setAvailable} label="Disponible hoy" hint="Si lo quitas, se marca como agotado." />
        </div>
      </div>
    </Drawer>
  );
}

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-start gap-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--color-violet)]" />
      <span>
        <span className="font-semibold">{label}</span>
        {hint ? <span className="block text-xs text-text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Menú del día                                                        */
/* ------------------------------------------------------------------ */

const INCLUDES = ["Pan", "Bebida", "Postre o café"] as const;

function DailyTab() {
  const { data, update, now } = usePro();
  const { ops } = useTablesOps();
  const toast = useToast();
  const today = localDate(now);
  // Menús de otros días: platos para volver a poner con un toque.
  const history = (ops?.dailyMenuHistory ?? []).filter((m) => m.date !== today);
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
            <Button
              variant="dark"
              onClick={() => {
                const fresh: ProDailyMenu = { date: today, priceCents: 1200, studentPriceCents: 1000, starters: [], mains: [], desserts: [], includes: "Pan, bebida y postre o café", published: false };
                update("daily.create", (d) => ({ ...d, dailyMenu: fresh }));
              }}
            >
              Crear menú de hoy
            </Button>
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
    update(publish ? "daily.publish" : "daily.save", (d) => ({
      ...d,
      dailyMenu: next,
      tablesOps: d.tablesOps ? rememberDailyMenu(d.tablesOps, next) : d.tablesOps,
    }));
    setDraft(next);
    setDirty(false);
    if (publish) toast.success("Menú publicado para estudiantes", reach === null ? undefined : `Avisamos a unos ${reach.toLocaleString("es-ES")} estudiantes a menos de 2 km. Lo verán antes de comer.`);
    else toast.success("Menú guardado", next.published ? "Los cambios ya se ven en Franky." : "Cuando quieras, publícalo para estudiantes.");
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Panel
          title="Menú de hoy"
          description={draft.published ? (reach === null ? "Publicado." : `Publicado. Lo ven unos ${reach.toLocaleString("es-ES")} estudiantes cerca.`) : "Sin publicar: solo lo ves tú."}
          action={draft.published ? <Pill tone="success">Publicado</Pill> : <Pill tone="warning">Sin publicar</Pill>}
        >
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Precio (€)" htmlFor="dm-price">
                <PriceInput id="dm-price" cents={draft.priceCents} onChange={(c) => edit((m) => ({ ...m, priceCents: c }))} />
              </FormField>
              <FormField label="Precio estudiante (€)" htmlFor="dm-student" hint="Con Franky verificado.">
                <PriceInput id="dm-student" cents={draft.studentPriceCents ?? 0} onChange={(c) => edit((m) => ({ ...m, studentPriceCents: c || undefined }))} />
              </FormField>
            </div>
            {history.length && !draft.starters.length && !draft.mains.length ? (
              <button
                type="button"
                onClick={() => {
                  const last = history[0];
                  edit((m) => ({ ...m, starters: last.starters, mains: last.mains, desserts: last.desserts }));
                }}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-border px-3 text-left text-sm font-semibold text-text-secondary hover:border-text-primary/25"
              >
                <History className="h-4 w-4 text-violet" strokeWidth={1.9} />
                Repetir el del {new Date(`${history[0].date}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "long", timeZone: "Europe/Madrid" })}
              </button>
            ) : null}
            <ListEditor
              label="Primeros"
              items={draft.starters}
              onChange={(l) => edit((m) => ({ ...m, starters: l }))}
              placeholder="Ensalada de la huerta"
              suggestions={recentDishes(history, "starters", draft.starters, 6)}
            />
            <ListEditor
              label="Segundos"
              items={draft.mains}
              onChange={(l) => edit((m) => ({ ...m, mains: l }))}
              placeholder="Arroz del señoret"
              suggestions={recentDishes(history, "mains", draft.mains, 6)}
            />
            <ListEditor
              label="Postres"
              items={draft.desserts}
              onChange={(l) => edit((m) => ({ ...m, desserts: l }))}
              placeholder="Flan casero"
              suggestions={recentDishes(history, "desserts", draft.desserts, 4)}
            />
            <FormField label="Incluye">
              <div className="flex flex-wrap gap-2">
                {INCLUDES.map((i) => {
                  const on = includes.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setIncludes(on ? includes.filter((x) => x !== i) : [...includes, i])}
                      className={cn(
                        "h-10 rounded-xl border px-3 text-sm font-semibold",
                        on ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary hover:border-text-primary/25",
                      )}
                    >
                      {i}
                    </button>
                  );
                })}
              </div>
            </FormField>
          </div>
          <div className="mt-5 flex flex-col gap-2 border-t border-border-light pt-4 sm:flex-row sm:justify-end">
            {draft.published ? (
              <Button
                variant="ghost"
                onClick={() => {
                  update("daily.unpublish", (d) => (d.dailyMenu ? { ...d, dailyMenu: { ...d.dailyMenu, published: false } } : d));
                  setDraft({ ...draft, published: false });
                  toast.success("Menú retirado", "Ya no se enseña a los estudiantes.");
                }}
              >
                Retirar
              </Button>
            ) : null}
            {valid ? (
              <WhatsAppButton
                share
                size="default"
                className="h-11"
                label="Compartir"
                message={dailyMenuMessage(draft, data.space.name, `https://franky.es/n/${data.space.slug}`)}
              />
            ) : null}
            <Button variant="outline" className="h-11" disabled={!dirty || !valid} onClick={() => save()}>
              Guardar cambios
            </Button>
            {!draft.published ? (
              <Button variant="dark" className="h-11" disabled={!valid} onClick={() => save(true)}>
                Publicar para estudiantes
              </Button>
            ) : null}
          </div>
        </Panel>
        <Tip title="Cuándo publicar">
          Publica antes de las 12:30. Es cuando los estudiantes deciden dónde comer al salir de clase, y el aviso les llega con tu precio de estudiante.
        </Tip>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <p className="eyebrow mb-2">Así lo ven los estudiantes</p>
        <DailyPreview menu={draft} />
        {reach !== null ? (
          <p className="mt-3 text-sm">
            <span className="font-heading text-lg font-extrabold tabular">{reach.toLocaleString("es-ES")}</span>{" "}
            <span className="text-text-muted">estudiantes a menos de 2 km</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PriceInput({ id, cents, onChange }: { id: string; cents: number; onChange: (cents: number) => void }) {
  const [text, setText] = React.useState(cents ? (cents / 100).toFixed(2).replace(".", ",") : "");
  React.useEffect(() => {
    const parsed = Math.round(Number(text.replace(",", ".")) * 100) || 0;
    if (parsed !== cents) setText(cents ? (cents / 100).toFixed(2).replace(".", ",") : "");
    // Solo cuando cambia el valor desde fuera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);
  return (
    <input
      id={id}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(Math.round(Number(e.target.value.replace(",", ".")) * 100) || 0);
      }}
      className={cn(inputClass, "tabular")}
    />
  );
}

function ListEditor({
  label,
  items,
  onChange,
  placeholder,
  suggestions = [],
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  /** Platos de otros días que se añaden con un toque. */
  suggestions?: string[];
}) {
  const [value, setValue] = React.useState("");
  const id = React.useId();
  const add = () => {
    const v = value.trim();
    if (!v) return;
    onChange([...items, v]);
    setValue("");
  };
  return (
    <FormField label={label} htmlFor={id}>
      <ul className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <li key={`${it}-${i}`} className="flex items-center gap-2">
            <input
              aria-label={`${label} ${i + 1}`}
              value={it}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              className={inputClass}
            />
            <IconButton label={`Quitar ${it}`} icon={X} onClick={() => onChange(items.filter((_, j) => j !== i))} className="h-10 w-10 shrink-0" />
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={`Añadir: ${placeholder}`}
          className={inputClass}
        />
        <Button variant="outline" className="h-10 shrink-0" onClick={add} disabled={!value.trim()}>
          Añadir
        </Button>
      </div>
      {suggestions.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-text-muted">Otros días:</span>
          {suggestions.map((dish) => (
            <button
              key={dish}
              type="button"
              onClick={() => onChange([...items, dish])}
              className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border px-3 text-xs font-semibold text-text-secondary transition-colors hover:border-text-primary/25 hover:text-text-primary"
            >
              <Plus className="h-3 w-3" /> {dish}
            </button>
          ))}
        </div>
      ) : null}
    </FormField>
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
    <div className="rounded-[1.6rem] border border-border bg-bg-secondary p-2.5">
      <div className="rounded-[1.2rem] bg-bg-primary p-4 shadow-card">
        <p className="inline-flex items-center gap-1 rounded-full bg-violet px-2 py-0.5 text-[0.65rem] font-bold text-white">Menú del día</p>
        <p className="mt-2 font-heading text-base font-bold leading-snug">{data.space.name}</p>
        <p className="flex items-center gap-1 text-xs text-text-muted">
          <MapPin className="h-3 w-3" /> A {data.space.walkMinutesToCampus} min de tu facultad
        </p>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="font-heading text-2xl font-extrabold tabular">{money(menu.studentPriceCents ?? menu.priceCents)}</span>
          {menu.studentPriceCents ? <span className="text-xs text-text-muted line-through tabular">{money(menu.priceCents)}</span> : null}
        </p>
        {menu.studentPriceCents ? (
          <p className="flex items-center gap-1 text-xs text-violet-deep">
            <BadgeCheck className="h-3 w-3" /> Precio de estudiante
          </p>
        ) : null}
        <div className="mt-3 flex flex-col gap-2.5 border-t border-border-light pt-3">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-text-muted">{g.label}</p>
              {g.items.length ? (
                <ul className="mt-0.5 text-sm">
                  {g.items.map((i, k) => (
                    <li key={`${i}-${k}`}>{i}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-muted">Por añadir</p>
              )}
            </div>
          ))}
        </div>
        {menu.includes ? <p className="mt-3 text-xs text-text-secondary">Incluye {menu.includes.toLowerCase()}.</p> : null}
        <p className="mt-1 text-[0.7rem] text-text-muted">Alérgenos: pregunta al personal o mira la carta.</p>
        <span className="mt-3 flex h-9 items-center justify-center rounded-lg bg-text-primary text-xs font-semibold text-bg-primary">Cómo llegar</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* QR de la carta                                                      */
/* ------------------------------------------------------------------ */

function QrDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = usePro();
  const toast = useToast();
  const url = `franky.es/n/${data.space.slug}`;
  const copy = () => {
    try {
      void navigator.clipboard?.writeText(`https://${url}`);
    } catch {
      // Sin portapapeles: el enlace está a la vista.
    }
    toast.success("Enlace copiado", url);
  };
  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="QR de la carta"
      description="Para las mesas y la barra. Siempre al día: lo agotado desaparece al momento."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          <Button variant="dark" onClick={copy}>
            <Copy className="h-4 w-4" /> Copiar enlace
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-3xl border border-border bg-white p-5 shadow-card">
          <QrMark text={url} />
          <p className="mt-3 text-center font-heading text-sm font-bold text-black">{data.space.name}</p>
          <p className="text-center text-xs text-neutral-500">Carta y alérgenos</p>
        </div>
        <p className="font-mono text-sm font-semibold">{url}</p>
        <Tip title="Truco" className="w-full">
          Pon el QR también en la puerta: quien lo escanea sin estar sentado ve tu menú del día y guarda tu local en Franky.
        </Tip>
      </div>
    </Drawer>
  );
}

/** Código QR real (escaneable) del enlace. */
function QrMark({ text }: { text: string }) {
  const [src, setSrc] = React.useState("");
  React.useEffect(() => {
    QRCode.toDataURL(`https://${text}`, { margin: 1, width: 416, color: { dark: "#000000", light: "#ffffff" } })
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [text]);
  return src ? (
    <img src={src} alt={`Código QR de ${text}`} className="h-52 w-52" />
  ) : (
    <div className="h-52 w-52 rounded-xl skeleton-shimmer" aria-hidden />
  );
}
