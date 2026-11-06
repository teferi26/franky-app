"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Globe, Plus, Repeat, Scissors, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProService } from "@/lib/pro/types";
import type {
  ProServiceAgenda,
  ProServiceMaterial,
} from "@/lib/pro/agenda-types";
import { valleyLabel } from "@/lib/pro/agenda-ops";
import { serviceMargin } from "@/lib/pro/agenda-money";
import { durationLabel, minutesToLabel, money, plural } from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  PageHeader,
  Panel,
  Pill,
  Segmented,
  Tip,
  inputClass,
  textareaClass,
} from "../../kit";
import { sectionLabel } from "../../sections";
import {
  OptionButton,
  eurosText,
  parseEuros,
  qtyLabel,
  useAgenda,
} from "./parts";
import { CabinsPanel, ProductsPanel } from "./stock";

type Tab = "servicios" | "productos" | "cabinas";

export default function ServiciosSection() {
  const { data, vertical, update } = usePro();
  const ops = data.agendaOps;
  const toast = useToast();
  const params = useSearchParams();
  const wanted = params?.get("tab");
  const [tab, setTab] = React.useState<Tab>(
    wanted === "productos" || wanted === "cabinas" ? wanted : "servicios",
  );
  const [editing, setEditing] = React.useState<ProService | "new" | null>(null);
  const [adding, setAdding] = React.useState<"product" | "cabin" | null>(null);
  const label = sectionLabel(vertical.id, "servicios");
  const showCabins =
    Boolean(ops) && (vertical.id === "beauty" || Boolean(ops?.cabins.length));

  const counts = new Map<string, number>();
  for (const b of data.bookings)
    if (b.serviceId && b.status !== "cancelled")
      counts.set(b.serviceId, (counts.get(b.serviceId) ?? 0) + 1);
  const categories = Array.from(new Set(data.services.map((s) => s.category)));
  const top = [...data.services].sort(
    (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0),
  )[0];
  // Sin los servicios gratis (la prueba de sensibilidad), que bajan la media.
  const paid = data.services.filter((s) => s.priceCents > 0);
  const avgPrice = paid.length
    ? Math.round(paid.reduce((a, s) => a + s.priceCents, 0) / paid.length)
    : 0;
  const withRhythm = data.services.filter((s) => s.agenda?.returnWeeks).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={label}
        title={
          tab === "productos"
            ? `${ops?.products.length ?? 0} productos`
            : tab === "cabinas"
              ? `${ops?.cabins.length ?? 0} cabinas y máquinas`
              : `${data.services.length} ${label.toLowerCase()}`
        }
        description={
          tab === "productos"
            ? "Lo que vendes y lo que gastas. El stock baja solo al cobrar."
            : tab === "cabinas"
              ? "Dos citas nunca coinciden en la misma cabina o máquina."
              : `${data.services.filter((s) => s.online).length} se pueden reservar online y ${data.services.filter((s) => s.studentPriceCents).length} tienen precio estudiante.`
        }
        actions={
          tab === "servicios" ? (
            <Button variant="dark" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> Añadir
            </Button>
          ) : (
            <Button
              variant="dark"
              onClick={() =>
                setAdding(tab === "productos" ? "product" : "cabin")
              }
            >
              <Plus className="h-4 w-4" />{" "}
              {tab === "productos" ? "Añadir producto" : "Añadir cabina"}
            </Button>
          )
        }
      >
        {ops ? (
          <Segmented<Tab>
            label="Apartados"
            value={tab}
            onChange={setTab}
            options={[
              { value: "servicios", label: label },
              { value: "productos", label: "Productos" },
              ...(showCabins
                ? [{ value: "cabinas" as const, label: "Cabinas" }]
                : []),
            ]}
          />
        ) : null}
      </PageHeader>

      {tab === "productos" ? (
        <ProductsPanel
          adding={adding === "product"}
          onAdded={() => setAdding(null)}
        />
      ) : tab === "cabinas" ? (
        <CabinsPanel
          adding={adding === "cabin"}
          onAdded={() => setAdding(null)}
        />
      ) : (
        <>
          <KpiRow>
            <Kpi
              label="El más pedido"
              value={<span className="text-lg">{top?.name ?? "Ninguno"}</span>}
              hint={
                top
                  ? `${plural(counts.get(top.id) ?? 0, "cita", "citas")} en 10 días`
                  : undefined
              }
            />
            <Kpi label="Precio medio" value={money(avgPrice)} />
            {ops ? (
              <Kpi
                icon={Repeat}
                label="Con ritmo de vuelta"
                value={`${withRhythm}/${data.services.length}`}
                hint="para saber a quién le toca"
              />
            ) : (
              <Kpi
                label="Reservables online"
                value={`${data.services.filter((s) => s.online).length}/${data.services.length}`}
              />
            )}
            <Kpi
              icon={TrendingUp}
              label="Con precio estudiante"
              value={data.services.filter((s) => s.studentPriceCents).length}
              emphasis
            />
          </KpiRow>

          {data.services.length ? (
            categories.map((cat) => (
              <Panel key={cat} title={cat} flush>
                <ul className="divide-y divide-border-light">
                  {data.services
                    .filter((s) => s.category === cat)
                    .map((s) => (
                      <li key={s.id}>
                        <ServiceRow
                          service={s}
                          count={counts.get(s.id) ?? 0}
                          onOpen={() => setEditing(s)}
                        />
                      </li>
                    ))}
                </ul>
              </Panel>
            ))
          ) : (
            <Panel>
              <Empty
                icon={Scissors}
                title="Añade tu primer servicio"
                body="Nombre, duración y precio. Con eso ya te pueden reservar."
                action={
                  <Button variant="dark" onClick={() => setEditing("new")}>
                    Añadir servicio
                  </Button>
                }
              />
            </Panel>
          )}

          <Tip title="Precio estudiante">
            No bajes el precio a todo el mundo: ponlo solo para estudiantes
            verificados y en tus horas flojas. Llenas los huecos sin tocar tus
            horas buenas.
          </Tip>
        </>
      )}

      <ServiceDrawer
        value={editing}
        onClose={() => setEditing(null)}
        onSave={async (s, isNew) => {
          if (
            !(await update(
              isNew ? "service.create" : "service.update",
              (d) => ({
                ...d,
                services: isNew
                  ? [...d.services, s]
                  : d.services.map((x) => (x.id === s.id ? s : x)),
              }),
            ))
          )
            return;
          toast.success(
            isNew ? "Servicio añadido" : "Servicio guardado",
            s.name,
          );
          setEditing(null);
        }}
        onDelete={async (s) => {
          if (
            !(await update("service.delete", (d) => ({
              ...d,
              services: d.services.filter((x) => x.id !== s.id),
            })))
          )
            return;
          toast.success("Servicio eliminado", s.name);
          setEditing(null);
        }}
      />
    </div>
  );
}

function ServiceRow({
  service: s,
  count,
  onOpen,
}: {
  service: ProService;
  count: number;
  onOpen: () => void;
}) {
  const { data } = usePro();
  const cabin = data.agendaOps?.cabins.find((c) => c.id === s.agenda?.cabinId);
  const margin = serviceMargin(data, s);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3.5 text-left transition-colors hover:bg-bg-secondary sm:px-5"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold">{s.name}</span>
          {s.popular ? <Pill tone="violet">Popular</Pill> : null}
          {s.agenda?.phases ? <Pill>Con pose</Pill> : null}
          {s.agenda?.patchTest ? <Pill tone="warning">Prueba</Pill> : null}
          {s.agenda?.depositCents ? (
            <Pill>Señal {money(s.agenda.depositCents)}</Pill>
          ) : null}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-text-muted">
          <span>
            {durationLabel(s.durationMin)}
            {Object.entries(s.agenda?.staffMin ?? {})
              .map(
                ([id, min]) =>
                  `, ${data.staff.find((x) => x.id === id)?.name.split(" ")[0] ?? "Equipo"} ${durationLabel(min)}`,
              )
              .join("")}
          </span>
          {s.agenda?.bufferMin ? (
            <span>+{s.agenda.bufferMin} min preparación</span>
          ) : null}
          {cabin ? <span>{cabin.name}</span> : null}
          {s.agenda?.returnWeeks ? (
            <span>
              {s.agenda.returnWeeks === 1
                ? "Vuelve cada semana"
                : `Vuelve cada ${s.agenda.returnWeeks} semanas`}
            </span>
          ) : null}
          {margin ? (
            <span>
              Material {money(margin.costCents)} · margen {margin.marginPct} %
            </span>
          ) : null}
          <span className="flex items-center gap-1">
            {s.online ? <Globe className="h-3 w-3" /> : null}
            {s.online ? "Online" : "Solo en el local"}
          </span>
          <span>{plural(count, "cita", "citas")} en 10 días</span>
        </span>
      </span>
      <span className="flex -space-x-1.5">
        {s.staffIds.map((id) => {
          const st = data.staff.find((x) => x.id === id);
          return st ? (
            <Avatar
              key={id}
              name={st.name}
              tone={st.tone}
              size="xs"
              className="ring-2 ring-bg-primary"
            />
          ) : null;
        })}
      </span>
      <span className="w-28 text-right">
        <span className="block font-semibold tabular">
          {money(s.priceCents)}
        </span>
        {s.studentPriceCents ? (
          <span className="block text-xs text-violet-deep tabular">
            {money(s.studentPriceCents)} estudiante
          </span>
        ) : null}
        {valleyLabel(s) ? (
          <span className="block text-[0.68rem] text-text-muted">
            {valleyLabel(s)}
          </span>
        ) : null}
      </span>
    </button>
  );
}

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
const HOURS = Array.from({ length: 29 }, (_, i) => 7 * 60 + i * 30);

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
  const { data, pending, can, ops } = useAgenda();
  const isNew = value === "new";
  const base: ProService | null = value === "new" ? null : value;
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [duration, setDuration] = React.useState(30);
  const [price, setPrice] = React.useState("");
  const [student, setStudent] = React.useState("");
  const [staffIds, setStaffIds] = React.useState<string[]>([]);
  const [online, setOnline] = React.useState(true);
  const [agenda, setAgenda] = React.useState<ProServiceAgenda>({});
  const [deposit, setDeposit] = React.useState("");
  const [more, setMore] = React.useState(false);

  React.useEffect(() => {
    if (!value) return;
    setName(base?.name ?? "");
    setCategory(base?.category ?? data.services[0]?.category ?? "General");
    setDuration(base?.durationMin ?? 30);
    setPrice(base ? String(base.priceCents / 100).replace(".", ",") : "");
    setStudent(
      base?.studentPriceCents
        ? String(base.studentPriceCents / 100).replace(".", ",")
        : "",
    );
    setStaffIds(
      base?.staffIds ??
        data.staff.filter((s) => s.role !== "reception").map((s) => s.id),
    );
    setOnline(base?.online ?? true);
    setAgenda(base?.agenda ?? {});
    setDeposit(
      base?.agenda?.depositCents ? eurosText(base.agenda.depositCents) : "",
    );
    setMore(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const cents = (v: string) =>
    Math.round(Number(v.replace(",", ".")) * 100) || 0;
  const phases = agenda.phases;
  const phasesOk =
    !phases ||
    phases.applyMin + phases.processMin + phases.finishMin === duration;
  const valid =
    name.trim().length > 1 &&
    cents(price) > 0 &&
    staffIds.length > 0 &&
    phasesOk;
  const set = (patch: Partial<ProServiceAgenda>) =>
    setAgenda((prev) => ({ ...prev, ...patch }));

  const build = (): ProService => {
    const depositCents = parseEuros(deposit) ?? 0;
    // Solo quedan las duraciones propias que difieren de la general.
    const staffMin = Object.fromEntries(
      Object.entries(agenda.staffMin ?? {}).filter(
        ([id, min]) => staffIds.includes(id) && min > 0 && min !== duration,
      ),
    );
    const cleaned: ProServiceAgenda = {
      ...agenda,
      depositCents: depositCents || undefined,
      staffMin: Object.keys(staffMin).length ? staffMin : undefined,
    };
    const hasAgenda = Object.values(cleaned).some((v) => v !== undefined);
    return {
      id: base?.id ?? localId("sv"),
      name: name.trim(),
      category: category.trim() || "General",
      durationMin: duration,
      priceCents: cents(price),
      studentPriceCents: cents(student) || undefined,
      staffIds,
      online,
      popular: base?.popular,
      // Conserva lo propio de la agenda (pose, cabina, ritmo...) al editar.
      ...(hasAgenda ? { agenda: cleaned } : {}),
    };
  };

  return (
    <Drawer
      open={Boolean(value)}
      onOpenChange={(v) => !v && onClose()}
      title={isNew ? "Nuevo servicio" : "Editar servicio"}
      footer={
        <>
          {!isNew && base ? (
            <Button
              variant="ghost"
              className="mr-auto text-rose-600"
              disabled={pending || !can("service.delete")}
              onClick={() => onDelete(base)}
            >
              Eliminar
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="dark"
            disabled={
              pending ||
              !can(isNew ? "service.create" : "service.update") ||
              !valid
            }
            onClick={() => onSave(build(), isNew)}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Nombre" htmlFor="sv-name">
          <input
            id="sv-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Corte y barba"
          />
        </FormField>
        <FormField label="Categoría" htmlFor="sv-cat">
          <input
            id="sv-cat"
            list="sv-cats"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
          />
          <datalist id="sv-cats">
            {Array.from(new Set(data.services.map((s) => s.category))).map(
              (c) => (
                <option key={c} value={c} />
              ),
            )}
          </datalist>
        </FormField>
        <FormField label="Duración">
          <div className="flex flex-wrap gap-2">
            {[15, 20, 30, 45, 60, 75, 90, 120, 150].map((m) => (
              <OptionButton
                key={m}
                active={duration === m}
                onClick={() => setDuration(m)}
              >
                {durationLabel(m)}
              </OptionButton>
            ))}
          </div>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Precio (€)" htmlFor="sv-price">
            <input
              id="sv-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField
            label="Precio estudiante (€)"
            htmlFor="sv-student"
            hint="Opcional, en horas valle."
          >
            <input
              id="sv-student"
              inputMode="decimal"
              value={student}
              onChange={(e) => setStudent(e.target.value)}
              className={inputClass}
            />
          </FormField>
        </div>
        <FormField label="Quién lo hace">
          <div className="flex flex-wrap gap-2">
            {data.staff.map((s) => {
              const on = staffIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setStaffIds((prev) =>
                      on ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                    )
                  }
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-xl border pl-1.5 pr-3 text-sm font-semibold",
                    on
                      ? "border-violet bg-violet-50 text-violet-deep"
                      : "border-border text-text-secondary",
                  )}
                >
                  <Avatar name={s.name} tone={s.tone} size="xs" />{" "}
                  {s.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
        </FormField>
        {ops && staffIds.length > 1 ? (
          <FormField
            label="Lo que tarda cada persona"
            hint="Si alguien necesita más o menos tiempo, su agenda lo tiene en cuenta al citar."
          >
            <ul className="flex flex-col divide-y divide-border-light rounded-xl border border-border">
              {data.staff
                .filter((s) => staffIds.includes(s.id))
                .map((s) => {
                  const own = agenda.staffMin?.[s.id];
                  return (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 py-1 pl-3 pr-1"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                        <Avatar name={s.name} tone={s.tone} size="xs" />
                        <span className="truncate">{s.name.split(" ")[0]}</span>
                      </span>
                      <select
                        aria-label={`Duración para ${s.name.split(" ")[0]}`}
                        value={own && own !== duration ? own : 0}
                        onChange={(e) => {
                          const min = Number(e.target.value);
                          const next = { ...agenda.staffMin };
                          if (min) next[s.id] = min;
                          else delete next[s.id];
                          set({ staffMin: next });
                        }}
                        className={cn(inputClass, "w-auto shrink-0")}
                      >
                        <option value={0}>
                          Como siempre ({durationLabel(duration)})
                        </option>
                        {[15, 20, 30, 40, 45, 50, 60, 75, 90, 120, 150]
                          .filter((m) => m !== duration)
                          .map((m) => (
                            <option key={m} value={m}>
                              {durationLabel(m)}
                            </option>
                          ))}
                      </select>
                    </li>
                  );
                })}
            </ul>
          </FormField>
        ) : null}
        <label className="flex min-h-10 items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={online}
            onChange={(e) => setOnline(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-violet)]"
          />
          Se puede reservar online desde Franky
        </label>

        {ops ? (
          <section className="rounded-2xl border border-border">
            <button
              type="button"
              aria-expanded={more}
              onClick={() => setMore((v) => !v)}
              className="flex min-h-12 w-full items-center justify-between px-4 text-left text-sm font-semibold"
            >
              Vuelta, pose, cabina, señal y material
              <span className="text-xs font-medium text-text-muted">
                {more ? "Ocultar" : "Mostrar"}
              </span>
            </button>
            {more ? (
              <div className="flex flex-col gap-5 border-t border-border-light p-4">
                <FormField
                  label="Suele volver cada"
                  hint="Con esto sabes a quién le toca volver cada semana."
                >
                  <div className="flex flex-wrap gap-2">
                    {[0, 2, 3, 4, 6, 8, 12].map((w) => (
                      <OptionButton
                        key={w}
                        active={(agenda.returnWeeks ?? 0) === w}
                        onClick={() => set({ returnWeeks: w || undefined })}
                      >
                        {w ? `${w} sem` : "Sin ritmo"}
                      </OptionButton>
                    ))}
                  </div>
                </FormField>

                <FormField
                  label="Tiempo de pose"
                  hint={
                    phases && !phasesOk
                      ? `Los tres tramos deben sumar ${durationLabel(duration)}.`
                      : "Mientras posa, el profesional queda libre para otra cita."
                  }
                >
                  <label className="flex min-h-10 items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(phases)}
                      onChange={(e) =>
                        set({
                          phases: e.target.checked
                            ? {
                                applyMin: Math.min(
                                  30,
                                  Math.round(duration / 3),
                                ),
                                processMin: Math.min(
                                  35,
                                  Math.round(duration / 3),
                                ),
                                finishMin:
                                  duration -
                                  Math.min(30, Math.round(duration / 3)) -
                                  Math.min(35, Math.round(duration / 3)),
                              }
                            : undefined,
                        })
                      }
                      className="h-4 w-4 accent-[var(--color-violet)]"
                    />
                    Tiene aplicación, pose y aclarado
                  </label>
                  {phases ? (
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ["applyMin", "Aplicación"],
                          ["processMin", "Pose"],
                          ["finishMin", "Aclarado"],
                        ] as const
                      ).map(([key, text]) => (
                        <label key={key} className="text-xs text-text-muted">
                          {text}
                          <input
                            inputMode="numeric"
                            aria-label={`${text} en minutos`}
                            value={phases[key]}
                            onChange={(e) =>
                              set({
                                phases: {
                                  ...phases,
                                  [key]: Math.max(
                                    0,
                                    Number(e.target.value) || 0,
                                  ),
                                },
                              })
                            }
                            className={cn(inputClass, "mt-1 tabular")}
                          />
                        </label>
                      ))}
                    </div>
                  ) : null}
                </FormField>

                <label className="flex min-h-10 items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(agenda.patchTest)}
                    onChange={(e) =>
                      set({ patchTest: e.target.checked || undefined })
                    }
                    className="h-4 w-4 accent-[var(--color-violet)]"
                  />
                  Pide prueba de sensibilidad antes
                </label>

                {ops.cabins.length ? (
                  <FormField label="Cabina o máquina">
                    <div className="flex flex-wrap gap-2">
                      <OptionButton
                        active={!agenda.cabinId}
                        onClick={() => set({ cabinId: undefined })}
                      >
                        Ninguna
                      </OptionButton>
                      {ops.cabins.map((cabin) => (
                        <OptionButton
                          key={cabin.id}
                          active={agenda.cabinId === cabin.id}
                          onClick={() => set({ cabinId: cabin.id })}
                        >
                          {cabin.name}
                        </OptionButton>
                      ))}
                    </div>
                  </FormField>
                ) : null}

                <FormField label="Preparación después">
                  <div className="flex flex-wrap gap-2">
                    {[0, 5, 10, 15].map((m) => (
                      <OptionButton
                        key={m}
                        active={(agenda.bufferMin ?? 0) === m}
                        onClick={() => set({ bufferMin: m || undefined })}
                      >
                        {m ? `${m} min` : "Nada"}
                      </OptionButton>
                    ))}
                  </div>
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    label="Señal (€)"
                    htmlFor="sv-deposit"
                    hint="Se pide al reservar."
                  >
                    <input
                      id="sv-deposit"
                      inputMode="decimal"
                      value={deposit}
                      onChange={(e) => setDeposit(e.target.value)}
                      className={inputClass}
                    />
                  </FormField>
                  <FormField
                    label="Comisión propia (%)"
                    htmlFor="sv-commission"
                    hint="Si no, la de cada persona."
                  >
                    <input
                      id="sv-commission"
                      inputMode="numeric"
                      value={agenda.commissionPct ?? ""}
                      onChange={(e) =>
                        set({
                          commissionPct: e.target.value
                            ? Math.min(
                                100,
                                Math.max(0, Number(e.target.value) || 0),
                              )
                            : undefined,
                        })
                      }
                      className={inputClass}
                    />
                  </FormField>
                </div>

                {cents(student) ? (
                  <FormField
                    label="Precio estudiante solo en"
                    hint={
                      agenda.valley
                        ? `Ahora: ${valleyLabel({ agenda })}`
                        : "Sin franja: vale a cualquier hora."
                    }
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAYS.map((day, i) => {
                        const on = agenda.valley?.days.includes(i) ?? false;
                        return (
                          <OptionButton
                            key={day}
                            active={on}
                            className="w-10 px-0"
                            onClick={() => {
                              const valley = agenda.valley ?? {
                                days: [],
                                from: 10 * 60,
                                to: 13 * 60,
                              };
                              const days = on
                                ? valley.days.filter((d) => d !== i)
                                : [...valley.days, i].sort();
                              set({
                                valley: days.length
                                  ? { ...valley, days }
                                  : undefined,
                              });
                            }}
                          >
                            {day}
                          </OptionButton>
                        );
                      })}
                    </div>
                    {agenda.valley ? (
                      <div className="grid grid-cols-2 gap-2">
                        {(["from", "to"] as const).map((key) => (
                          <select
                            key={key}
                            aria-label={key === "from" ? "Desde" : "Hasta"}
                            value={agenda.valley![key]}
                            onChange={(e) =>
                              set({
                                valley: {
                                  ...agenda.valley!,
                                  [key]: Number(e.target.value),
                                },
                              })
                            }
                            className={inputClass}
                          >
                            {HOURS.map((m) => (
                              <option key={m} value={m}>
                                {key === "from" ? "Desde las " : "Hasta las "}
                                {minutesToLabel(m)}
                              </option>
                            ))}
                          </select>
                        ))}
                      </div>
                    ) : null}
                  </FormField>
                ) : null}

                {ops.consentTemplates.length ? (
                  <FormField label="Consentimiento que se firma">
                    <div className="flex flex-wrap gap-2">
                      <OptionButton
                        active={!agenda.consentId}
                        onClick={() => set({ consentId: undefined })}
                      >
                        Ninguno
                      </OptionButton>
                      {ops.consentTemplates.map((template) => (
                        <OptionButton
                          key={template.id}
                          active={agenda.consentId === template.id}
                          onClick={() => set({ consentId: template.id })}
                        >
                          {template.title}
                        </OptionButton>
                      ))}
                    </div>
                  </FormField>
                ) : null}

                <MaterialsField
                  priceCents={cents(price)}
                  studentCents={cents(student)}
                  materials={agenda.materials ?? []}
                  onChange={(materials) =>
                    set({ materials: materials.length ? materials : undefined })
                  }
                />

                <FormField
                  label="Cuidados después"
                  htmlFor="sv-aftercare"
                  hint="Se mandan por WhatsApp al cobrar, con un toque."
                >
                  <textarea
                    id="sv-aftercare"
                    value={agenda.aftercare ?? ""}
                    onChange={(e) =>
                      set({ aftercare: e.target.value || undefined })
                    }
                    placeholder="no mojes la zona en 24 horas y usa protector solar."
                    className={textareaClass}
                  />
                </FormField>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}

/** Cuánto se gasta en una sesión, como se mide en el salón. */
const MATERIAL_QTY = [0.25, 0.5, 1, 2];

/**
 * Material técnico que gasta cada sesión (tinte, oxidante, cera, cápsulas).
 * Sirve para dos cosas: el stock baja solo al cobrar la cita y el servicio
 * enseña cuánto te deja de verdad después del material.
 */
function MaterialsField({
  priceCents,
  studentCents,
  materials,
  onChange,
}: {
  priceCents: number;
  studentCents: number;
  materials: ProServiceMaterial[];
  onChange: (materials: ProServiceMaterial[]) => void;
}) {
  const { data, ops } = useAgenda();
  const products = ops?.products ?? [];
  const unused = products
    .filter((p) => !materials.some((m) => m.productId === p.id))
    // Primero el material técnico: es lo que suele gastar un servicio.
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "tech" ? -1 : 1));
  const margin = serviceMargin(
    { ...data, agendaOps: ops ?? undefined },
    {
      priceCents,
      studentPriceCents: studentCents || undefined,
      agenda: { materials },
    },
  );
  const setQty = (productId: string, qty: number) =>
    onChange(
      materials.map((m) => (m.productId === productId ? { ...m, qty } : m)),
    );

  if (!products.length)
    return (
      <FormField label="Material que gasta">
        <p className="rounded-xl bg-bg-secondary px-3 py-2.5 text-sm text-text-muted">
          Da de alta tu material técnico en Productos y aquí verás cuánto te
          cuesta cada sesión y cuánto te deja.
        </p>
      </FormField>
    );

  return (
    <FormField
      label="Material que gasta"
      hint="Se descuenta del stock al cobrar la cita."
    >
      {materials.length ? (
        <ul className="flex flex-col gap-2">
          {materials.map((line) => {
            const product = products.find((p) => p.id === line.productId);
            if (!product) return null;
            return (
              <li
                key={line.productId}
                className="flex flex-col gap-2 rounded-xl border border-border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {product.name}
                    </span>
                    <span className="text-xs text-text-muted tabular">
                      {money(Math.round(product.costCents * line.qty))} por
                      sesión · quedan {qtyLabel(product.stock)} ud
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Quitar ${product.name}`}
                    onClick={() =>
                      onChange(
                        materials.filter((m) => m.productId !== line.productId),
                      )
                    }
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-muted hover:bg-bg-secondary"
                  >
                    <X className="h-4 w-4" strokeWidth={1.9} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {MATERIAL_QTY.map((qty) => (
                    <OptionButton
                      key={qty}
                      active={line.qty === qty}
                      onClick={() => setQty(line.productId, qty)}
                    >
                      {qtyLabel(qty)} ud
                    </OptionButton>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {unused.length ? (
        <select
          aria-label="Añadir material"
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            onChange([...materials, { productId: e.target.value, qty: 0.5 }]);
          }}
          className={inputClass}
        >
          <option value="">Añadir material</option>
          {unused.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.kind === "tech" ? "" : " (venta)"}
            </option>
          ))}
        </select>
      ) : null}

      {margin && priceCents ? (
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-bg-secondary p-3 text-sm">
          <span>
            <span className="block text-xs text-text-muted">
              Material por sesión
            </span>
            <span className="font-semibold tabular">
              {money(margin.costCents)}
            </span>
          </span>
          <span>
            <span className="block text-xs text-text-muted">Te deja</span>
            <span className="font-semibold tabular">
              {money(margin.marginCents)} ({margin.marginPct} %)
            </span>
            {margin.studentMarginCents !== undefined ? (
              <span className="block text-xs text-text-muted tabular">
                {money(margin.studentMarginCents)} con precio estudiante
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </FormField>
  );
}
