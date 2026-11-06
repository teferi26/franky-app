"use client";

import * as React from "react";
import QRCode from "qrcode";
import { Copy, Plus, QrCode, Star, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { Allergen, ProMenuItem } from "@/lib/pro/types";
import { money } from "@/lib/pro/format";
import { ALLERGENS } from "@/lib/pro/tables";
import { offerWindows } from "@/lib/pro/night-ops";
import { cn } from "@/lib/utils";
import { ChoiceChips, Drawer, Empty, FormField, PageHeader, Panel, RowList, SearchInput, Segmented, Tip, inputClass } from "../../kit";
import { AllergenCodes } from "../tables/table-kit";
import { euros, eurosInput } from "./ops-ui";

/**
 * Carta de copas del pub: bebidas, cócteles, botellas para compartir y
 * picoteo con sus alérgenos. La misma carta alimenta el consumo de los
 * reservados, así que lo que se añade aquí se puede apuntar en la barra.
 */
export default function NightCarta() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [section, setSection] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState<ProMenuItem | "new" | null>(null);
  const [qr, setQr] = React.useState(false);

  const sections = [...new Set(data.menu.map((m) => m.section))];
  const list = data.menu.filter(
    (m) =>
      (section === "all" || m.section === section) &&
      (!q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const soldOut = data.menu.filter((m) => !m.available).length;
  const withAllergens = data.menu.filter((m) => m.allergens.length).length;
  const { active } = offerWindows(data, now);

  const toggle = (item: ProMenuItem, available: boolean) => {
    void update("menu.available", (d) => ({
      ...d,
      menu: d.menu.map((m) => (m.id === item.id ? { ...m, available } : m)),
    }));
    toast.success(available ? `${item.name} disponible` : `${item.name} agotado`, available ? undefined : "Deja de salir en la carta y en los reservados.");
  };

  return (
    <div className="flex flex-col gap-5">
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
            <Button variant="outline" onClick={() => setQr(true)}>
              <QrCode className="h-4 w-4" strokeWidth={1.9} /> QR de la carta
            </Button>
            <Button variant="dark" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> Nuevo producto
            </Button>
          </>
        }
      />

      {active.length ? (
        <p className="rounded-2xl border border-violet/30 bg-violet-50 px-4 py-3 text-sm text-violet-deep">
          <span className="font-semibold">Ahora: {active[0].offer.title}.</span> {active[0].offer.detail}
        </p>
      ) : null}

      {data.menu.length ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Segmented
              value={section}
              onChange={setSection}
              label="Sección"
              options={[{ value: "all", label: "Todo", count: data.menu.length }, ...sections.map((s) => ({ value: s, label: s }))]}
            />
            <SearchInput value={q} onChange={setQ} placeholder="Buscar en la carta" className="sm:w-64" />
          </div>
          {(section === "all" ? sections : [section]).map((s) => {
            const items = list.filter((m) => m.section === s);
            if (!items.length) return null;
            return (
              <Panel key={s} title={s} flush>
                <RowList>
                  {items.map((m) => (
                    <div key={m.id} className={cn("flex items-center gap-3 px-4 py-3 sm:px-5", !m.available && "opacity-60")}>
                      <button type="button" onClick={() => setEditing(m)} className="min-w-0 flex-1 text-left focus-visible:outline-none">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold">{m.name}</span>
                          {m.studentFavorite ? <Star className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Favorito de estudiantes" strokeWidth={1.9} /> : null}
                        </span>
                        {m.description ? <span className="block truncate text-xs text-text-muted">{m.description}</span> : null}
                        <AllergenCodes list={m.allergens} className="mt-1" />
                      </button>
                      <span className="shrink-0 font-heading font-bold tabular">{money(m.priceCents)}</span>
                      <Switch checked={m.available} onCheckedChange={(v) => toggle(m, v)} aria-label={`${m.name} disponible`} />
                    </div>
                  ))}
                </RowList>
              </Panel>
            );
          })}
          {!list.length ? <p className="text-sm text-text-muted">No hay nada con ese nombre.</p> : null}
        </>
      ) : (
        <Panel>
          <Empty
            icon={Wine}
            title="Tu carta está vacía"
            body="Empieza por lo que más se pide: cañas, combinados y las botellas para compartir. Marca los alérgenos de cada uno."
            action={
              <Button variant="dark" onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" /> Nuevo producto
              </Button>
            }
          />
        </Panel>
      )}

      <Tip title="Alérgenos también en las copas">
        La cerveza lleva gluten, el vino y el vermut sulfitos y algunos cócteles huevo. Márcalos una vez y salen siempre en la carta y en el QR.
      </Tip>

      <ItemDrawer item={editing} sections={sections} onClose={() => setEditing(null)} />
      <QrDrawer open={qr} onClose={() => setQr(false)} />
    </div>
  );
}

function ItemDrawer({ item, sections, onClose }: { item: ProMenuItem | "new" | null; sections: string[]; onClose: () => void }) {
  const { update } = usePro();
  const toast = useToast();
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
    setSection(it?.section ?? sections[0] ?? "Nueva");
    setNewSection("");
    setPrice(it ? eurosInput(it.priceCents) : "");
    setDescription(it?.description ?? "");
    setAllergens(it?.allergens ?? []);
    setFavorite(Boolean(it?.studentFavorite));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  if (!item) return <Drawer open={false} onOpenChange={() => onClose()} title="Producto">{null}</Drawer>;

  const finalSection = section === "__new" ? newSection.trim() : section;
  const valid = name.trim().length > 1 && euros(price) > 0 && finalSection.length > 1;

  const save = () => {
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
    void update(isNew ? "menu.create" : "menu.update", (d) => ({
      ...d,
      menu: isNew ? [...d.menu, next] : d.menu.map((m) => (m.id === next.id ? next : m)),
    }));
    toast.success(isNew ? "Añadido a la carta" : "Guardado");
    onClose();
  };

  const remove = () => {
    if (!current) return;
    void update("menu.delete", (d) => ({ ...d, menu: d.menu.filter((m) => m.id !== current.id) }));
    toast.success(`${current.name} quitado de la carta`);
    onClose();
  };

  const toggleAllergen = (a: Allergen) => setAllergens((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={isNew ? "Nuevo producto" : current?.name}
      description="Precio, sección y los 14 alérgenos."
      footer={
        <>
          {current ? (
            <Button variant="ghost" onClick={remove}>
              Quitar
            </Button>
          ) : null}
          <Button variant="dark" onClick={save} disabled={!valid}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-3">
          <FormField label="Nombre" htmlFor="ct-name">
            <input id="ct-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ginebra con tónica" className={inputClass} />
          </FormField>
          <FormField label="Precio (€)" htmlFor="ct-price">
            <input id="ct-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <FormField label="Sección">
          <ChoiceChips
            value={section}
            onChange={setSection}
            options={[...sections.map((s) => ({ value: s, label: s })), { value: "__new", label: "Otra" }]}
          />
          {section === "__new" ? (
            <input
              aria-label="Nombre de la sección"
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              placeholder="Vermut, cafés, cócteles sin alcohol…"
              className={cn(inputClass, "mt-2")}
            />
          ) : null}
        </FormField>
        <FormField label="Descripción" htmlFor="ct-desc">
          <input id="ct-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Marcas o lo que incluye" className={inputClass} />
        </FormField>
        <FormField label="Alérgenos">
          <div className="flex flex-wrap gap-2">
            {ALLERGENS.map((a) => {
              const on = allergens.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleAllergen(a.id)}
                  className={cn(
                    "min-h-10 rounded-xl border px-3 text-sm font-medium transition-colors",
                    on ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary hover:border-text-primary/25",
                  )}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </FormField>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            <span className="font-semibold">Favorito de estudiantes</span>
            <span className="block text-xs text-text-muted">Sale destacado en tu ficha de Franky.</span>
          </span>
          <Switch checked={favorite} onCheckedChange={setFavorite} aria-label="Favorito de estudiantes" />
        </label>
      </div>
    </Drawer>
  );
}

function QrDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = usePro();
  const toast = useToast();
  const url = `franky.es/n/${data.space.slug}`;
  const [src, setSrc] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    // El QR necesita colores explícitos: negro sobre blanco para que lo lea cualquier móvil.
    QRCode.toDataURL(`https://${url}`, { margin: 1, width: 416, color: { dark: "#000000", light: "#ffffff" } })
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [open, url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`https://${url}`);
      toast.success("Enlace copiado", url);
    } catch {
      toast.info("Copia el enlace", url);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="QR de la carta"
      description="Para las mesas y la barra. Lo agotado deja de salir al momento."
      footer={
        <>
          <Button variant="ghost" onClick={copy}>
            <Copy className="h-4 w-4" /> Copiar enlace
          </Button>
          {src ? (
            <Button asChild variant="dark">
              <a href={src} download={`carta-${data.space.slug}.png`}>
                Descargar QR
              </a>
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-3xl border border-border bg-white p-5 shadow-card">
          {src ? (
            <img src={src} alt={`Código QR de ${url}`} className="h-52 w-52" />
          ) : (
            <div className="h-52 w-52 rounded-xl skeleton-shimmer" aria-hidden />
          )}
          <p className="mt-3 text-center font-heading text-sm font-bold text-black">{data.space.name}</p>
          <p className="text-center text-xs text-neutral-500">Carta y alérgenos</p>
        </div>
        <p className="font-mono text-sm font-semibold">{url}</p>
        <Tip title="Truco" className="w-full">
          Ponlo también en la puerta y en los sofás: quien lo escanea ve la carta, tus noches y puede pedir reservado para su cumpleaños.
        </Tip>
      </div>
    </Drawer>
  );
}
