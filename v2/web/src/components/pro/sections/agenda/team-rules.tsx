"use client";

import * as React from "react";
import { CalendarOff, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ProStaff } from "@/lib/pro/types";
import {
  removeAbsence,
  saveStaffRules,
  staffRules,
} from "@/lib/pro/agenda-ops";
import { dayLabel, localDate, money } from "@/lib/pro/format";
import {
  Avatar,
  ChoiceChips,
  Drawer,
  FormField,
  Panel,
  Pill,
  inputClass,
} from "../../kit";
import { BlockDrawer, type BlockPreset } from "./block-drawer";
import { eurosText, parseEuros, serviceStaff, useAgenda } from "./parts";

/**
 * En Equipo, para peluquerías y estética: vacaciones y bajas que cierran la
 * columna de la agenda, y las reglas de cobro de cada persona (comisión por
 * servicio y por producto, o alquiler de sillón).
 */
export function AgendaTeamRules() {
  const { data, now, ops, run, allowed, demo, can } = useAgenda();
  const toast = useToast();
  const [preset, setPreset] = React.useState<BlockPreset>(null);
  const [editing, setEditing] = React.useState<ProStaff | null>(null);
  if (!ops) return null;
  const today = localDate(now);
  const absences = ops.absences
    .filter((a) => a.to >= today)
    .sort((a, b) => a.from.localeCompare(b.from));
  const showMoney = demo || can("finance.read");

  return (
    <>
      <Panel
        title="Vacaciones y bajas"
        description="Cierran su columna de la agenda esos días, también para las reservas online."
        action={
          <Button
            size="sm"
            variant="outline"
            className="h-10"
            disabled={!allowed("agenda.absence")}
            onClick={() => setPreset({ date: today, kind: "absence" })}
          >
            <CalendarOff className="h-4 w-4" /> Añadir
          </Button>
        }
        flush
      >
        {absences.length ? (
          <ul className="divide-y divide-border-light">
            {absences.map((absence) => {
              const person = data.staff.find((s) => s.id === absence.staffId);
              return (
                <li
                  key={absence.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
                >
                  <Avatar
                    name={person?.name ?? "?"}
                    tone={person?.tone}
                    size="sm"
                  />
                  <span className="min-w-[10rem] flex-1">
                    <span className="block text-sm font-semibold">
                      {person?.name.split(" ")[0]} · {absence.reason}
                    </span>
                    <span className="block text-xs text-text-muted">
                      Del{" "}
                      {dayLabel(`${absence.from}T12:00:00Z`, {
                        weekday: false,
                      })}{" "}
                      al{" "}
                      {dayLabel(`${absence.to}T12:00:00Z`, { weekday: false })}
                    </span>
                  </span>
                  {absence.from <= today ? (
                    <Pill tone="info">Ahora</Pill>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-10"
                    disabled={!allowed("agenda.absence")}
                    onClick={async () => {
                      if (
                        await run("agenda.absence", (d) =>
                          removeAbsence(d, absence.id),
                        )
                      )
                        toast.success(
                          "Ausencia quitada",
                          "Su agenda vuelve a abrirse.",
                        );
                    }}
                  >
                    Quitar
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-5 text-sm text-text-muted">
            Nadie tiene vacaciones ni bajas apuntadas.
          </p>
        )}
      </Panel>

      {showMoney ? (
        <Panel
          title="Cómo cobra cada persona"
          description="Comisión sobre lo cobrado, sin propinas. En Caja, vista Mes, tienes el cierre de cada uno."
          flush
        >
          <ul className="divide-y divide-border-light">
            {serviceStaff(data).map((person) => {
              const rules = staffRules(person);
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(person)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary sm:px-5"
                  >
                    <Avatar name={person.name} tone={person.tone} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {person.name.split(" ")[0]}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {rules.chairRentCents
                          ? `Alquila el sillón por ${money(rules.chairRentCents)} al mes`
                          : `${rules.commissionPct} % en servicios · ${rules.productCommissionPct} % en productos`}
                      </span>
                    </span>
                    <Percent
                      className="h-4 w-4 text-text-muted"
                      strokeWidth={1.9}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      <BlockDrawer preset={preset} onClose={() => setPreset(null)} />
      <RulesDrawer person={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function RulesDrawer({
  person,
  onClose,
}: {
  person: ProStaff | null;
  onClose: () => void;
}) {
  const { run, allowed } = useAgenda();
  const toast = useToast();
  const [mode, setMode] = React.useState<"commission" | "rent">("commission");
  const [service, setService] = React.useState("0");
  const [product, setProduct] = React.useState("0");
  const [rent, setRent] = React.useState("");

  React.useEffect(() => {
    if (!person) return;
    const rules = staffRules(person);
    setMode(rules.chairRentCents ? "rent" : "commission");
    setService(String(rules.commissionPct));
    setProduct(String(rules.productCommissionPct));
    setRent(rules.chairRentCents ? eurosText(rules.chairRentCents) : "");
  }, [person]);

  const rentCents = parseEuros(rent) ?? 0;
  const valid = mode === "commission" || rentCents > 0;

  return (
    <Drawer
      open={Boolean(person)}
      onOpenChange={(v) => !v && onClose()}
      title={`Cómo cobra ${person?.name.split(" ")[0] ?? ""}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="dark"
            disabled={!person || !valid || !allowed("agenda.staff")}
            onClick={async () => {
              if (!person) return;
              if (
                await run("agenda.staff", (d) =>
                  saveStaffRules(d, person.id, {
                    commissionPct: Number(service) || 0,
                    productCommissionPct: Number(product) || 0,
                    chairRentCents: mode === "rent" ? rentCents : 0,
                  }),
                )
              ) {
                toast.success("Reglas guardadas", person.name);
                onClose();
              }
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <ChoiceChips
          value={mode}
          onChange={setMode}
          options={[
            {
              value: "commission",
              label: "A comisión",
              hint: "Un porcentaje de lo que cobra",
            },
            {
              value: "rent",
              label: "Alquila sillón",
              hint: "Cuota fija al mes, sin comisión",
            },
          ]}
        />
        {mode === "commission" ? (
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="En servicios (%)"
              htmlFor="rl-service"
              hint="Si un servicio tiene la suya, manda esa."
            >
              <input
                id="rl-service"
                inputMode="numeric"
                value={service}
                onChange={(e) => setService(e.target.value)}
                className={inputClass}
              />
            </FormField>
            <FormField label="En productos (%)" htmlFor="rl-product">
              <input
                id="rl-product"
                inputMode="numeric"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                className={inputClass}
              />
            </FormField>
          </div>
        ) : (
          <FormField
            label="Cuota al mes (€)"
            htmlFor="rl-rent"
            hint="En el cierre del mes sale lo que debe al salón."
          >
            <input
              id="rl-rent"
              inputMode="decimal"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
              className={inputClass}
            />
          </FormField>
        )}
      </div>
    </Drawer>
  );
}
