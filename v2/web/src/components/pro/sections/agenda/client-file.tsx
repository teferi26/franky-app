"use client";

import * as React from "react";
import {
  FlaskConical,
  HeartPulse,
  Palette,
  Repeat,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ProAllergy, ProConsentKind } from "@/lib/pro/agenda-types";
import {
  ALLERGY_LABEL,
  CONSENT_LABEL,
  cadenceOf,
  formulasOf,
  healthAlerts,
  patchTestState,
  recordPatchTest,
  saveHealth,
  setConsent,
} from "@/lib/pro/agenda-clients";
import { bundleRemaining, returnBundleSession } from "@/lib/pro/agenda-money";
import { clientPlans } from "@/lib/pro/agenda-day";
import { dayLabel, localDate, relative, time } from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import { Pill, inputClass } from "../../kit";
import { FormulaSummary } from "./booking-extras";
import { ClientPhotos } from "./client-photos";
import { staffFirst, useAgenda } from "./parts";

const nowIso = () => new Date().toISOString();

/**
 * Lo propio de peluquería y estética dentro de la ficha: ritmo, fórmulas de
 * color con fecha, antes y después, prueba de sensibilidad, salud, permisos
 * y bonos.
 */
export function AgendaClientFile({ clientId }: { clientId: string }) {
  const { data, now, ops, run, allowed, vertical } = useAgenda();
  const toast = useToast();
  const client = data.clients.find((c) => c.id === clientId);
  const [editingHealth, setEditingHealth] = React.useState(false);
  if (!client || !ops) return null;

  const today = localDate(now);
  const cadence = cadenceOf(data, client.id);
  const formulas = formulasOf(client);
  const patch = patchTestState(data, client, today);
  const needsTests = data.services.some((s) => s.agenda?.patchTest);
  const alerts = healthAlerts(client);
  const bundles = ops.bundles.filter((b) => b.clientId === client.id);
  const signed = client.agenda?.signed ?? [];
  const plans = clientPlans(data, client.id, now);
  const beauty = vertical.id === "beauty";

  return (
    <div className="flex flex-col gap-4">
      {cadence ? (
        <p className="text-sm text-text-secondary">
          Suele venir cada{" "}
          <span className="font-semibold text-text-primary">
            {Math.round(cadence.days / 7) <= 1
              ? "semana"
              : `${Math.round(cadence.days / 7)} semanas`}
          </span>
          {cadence.source === "service" ? " (según su último servicio)" : ""}.
        </p>
      ) : null}

      {bundles.length ? (
        <Section icon={Ticket} title="Bonos">
          <ul className="flex flex-col gap-2">
            {bundles.map((bundle) => (
              <li
                key={bundle.id}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{bundle.label}</span>
                  <span className="text-text-muted">
                    {" "}
                    · quedan {bundleRemaining(bundle)} de {bundle.sessions}
                  </span>
                </span>
                {bundle.used > 0 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-10"
                    disabled={!allowed("agenda.bundle")}
                    onClick={async () => {
                      if (
                        await run("agenda.bundle", (d) =>
                          returnBundleSession(d, bundle.id, {
                            at: nowIso(),
                            reason: "Devuelta desde la ficha",
                          }),
                        )
                      )
                        toast.success("Sesión devuelta al bono");
                    }}
                  >
                    Devolver una sesión
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {plans.length ? (
        <Section
          icon={Repeat}
          title={beauty ? "Planes en marcha" : "Citas fijas"}
        >
          <ul className="flex flex-col gap-3">
            {plans.map((plan) => (
              <li key={plan.seriesId} className="flex flex-col gap-1.5">
                <p className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-semibold">
                    {plan.service?.name ?? "Cita fija"}
                  </span>
                  <span className="shrink-0 text-xs text-text-muted tabular">
                    {plan.done} de {plan.total} hechas
                  </span>
                </p>
                {/* Una marca por sesión: hechas en negro, pendientes en gris. */}
                <span className="flex gap-1" aria-hidden>
                  {Array.from({ length: plan.total }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-1.5 flex-1 rounded-full",
                        i < plan.done ? "bg-text-primary" : "bg-border",
                      )}
                    />
                  ))}
                </span>
                {plan.next ? (
                  <p className="text-xs text-text-muted">
                    Próxima: {dayLabel(plan.next.start)} a las{" "}
                    {time(plan.next.start)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {formulas.length ? (
        <Section icon={Palette} title="Fórmulas de color">
          <ul className="flex flex-col divide-y divide-border-light">
            {formulas.slice(0, 4).map((formula) => (
              <li key={formula.id} className="py-2 first:pt-0 last:pb-0">
                <p className="text-xs text-text-muted">
                  {dayLabel(formula.at, { weekday: false })}
                  {formula.staffId
                    ? ` · ${staffFirst(data, formula.staffId)}`
                    : ""}
                </p>
                <FormulaSummary formula={formula} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <ClientPhotos clientId={client.id} />

      {needsTests ? (
        <Section icon={FlaskConical} title="Prueba de sensibilidad">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 text-text-secondary">
              {patch.status === "missing"
                ? "No consta ninguna."
                : patch.status === "valid"
                  ? `Hecha el ${dayLabel(patch.at, { weekday: false })}, vale hasta el ${dayLabel(`${patch.until}T12:00:00Z`, { weekday: false })}.`
                  : `La última, del ${dayLabel(patch.at, { weekday: false })}, ya no vale.`}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-10"
              disabled={!allowed("agenda.patchtest")}
              onClick={async () => {
                if (
                  await run("agenda.patchtest", (d) =>
                    recordPatchTest(d, client.id, nowIso()),
                  )
                )
                  toast.success("Prueba apuntada con fecha de hoy");
              }}
            >
              Hecha hoy
            </Button>
          </div>
        </Section>
      ) : null}

      <Section
        icon={HeartPulse}
        title="Salud y alergias"
        action={
          <button
            type="button"
            onClick={() => setEditingHealth((v) => !v)}
            className="inline-flex h-10 items-center text-sm font-semibold text-violet"
          >
            {editingHealth ? "Cerrar" : alerts.length ? "Cambiar" : "Apuntar"}
          </button>
        }
      >
        {editingHealth ? (
          <HealthForm
            clientId={client.id}
            onDone={() => setEditingHealth(false)}
          />
        ) : alerts.length ? (
          <div className="flex flex-wrap gap-1.5">
            {alerts.map((alert) => (
              <Pill key={alert} tone="danger">
                {alert}
              </Pill>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            {beauty
              ? "Sin alergias apuntadas. Pregúntale antes del primer tratamiento."
              : "Sin alergias apuntadas."}
          </p>
        )}
        {client.agenda?.health ? (
          <p className="mt-2 text-xs text-text-muted">
            Actualizado{" "}
            {relative(client.agenda.health.updatedAt, now.getTime())}
            {client.agenda.health.updatedBy
              ? ` por ${client.agenda.health.updatedBy}`
              : ""}
          </p>
        ) : null}
      </Section>

      <Section icon={ShieldCheck} title="Permisos">
        <ul className="flex flex-col gap-2">
          {(Object.keys(CONSENT_LABEL) as ProConsentKind[]).map((kind) => {
            const record = client.agenda?.consents?.[kind];
            const granted =
              record?.granted ??
              (kind === "marketing" ? client.marketingConsent : false);
            return (
              <li key={kind} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block">{CONSENT_LABEL[kind]}</span>
                  <span className="block text-xs text-text-muted">
                    {record
                      ? `${granted ? "Aceptado" : "Retirado"} el ${dayLabel(record.at, { weekday: false })}${record.by ? ` · apuntó ${record.by}` : ""}`
                      : granted
                        ? "Aceptado al darse de alta"
                        : "Sin permiso"}
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={granted}
                  aria-label={CONSENT_LABEL[kind]}
                  disabled={!allowed("agenda.consent")}
                  onClick={() =>
                    void run("agenda.consent", (d) =>
                      setConsent(
                        d,
                        client.id,
                        kind,
                        !granted,
                        nowIso(),
                        data.space.owner.firstName || undefined,
                      ),
                    )
                  }
                  className={cn(
                    "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50",
                    granted ? "bg-violet" : "bg-bg-tertiary",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 h-5 w-5 rounded-full bg-bg-primary shadow-card transition-[left]",
                      granted ? "left-6" : "left-1",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
        {signed.length ? (
          <div className="mt-3 border-t border-border-light pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Firmados
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {signed.map((row) => {
                const template = ops.consentTemplates.find(
                  (t) => t.id === row.consentId,
                );
                return (
                  <li key={row.id} className="flex items-center gap-3 text-sm">
                    {/* La firma se guarda como imagen PNG. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={row.signature}
                      alt={`Firma de ${client.name}`}
                      className="h-10 w-20 rounded-md border border-border bg-bg-primary object-contain"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {template?.title ?? "Consentimiento"}
                      </span>
                      <span className="block text-xs text-text-muted">
                        {dayLabel(row.at, { weekday: false })}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </Section>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: typeof Palette;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.9} /> {title}
        </p>
        {action}
      </div>
      {children}
    </section>
  );
}

function HealthForm({
  clientId,
  onDone,
}: {
  clientId: string;
  onDone: () => void;
}) {
  const { data, run, allowed } = useAgenda();
  const toast = useToast();
  const client = data.clients.find((c) => c.id === clientId);
  const current = client?.agenda?.health;
  const [allergies, setAllergies] = React.useState<ProAllergy[]>(
    current?.allergies ?? [],
  );
  const [sensitive, setSensitive] = React.useState(
    Boolean(current?.sensitiveSkin),
  );
  const [pregnancy, setPregnancy] = React.useState(Boolean(current?.pregnancy));
  const [medication, setMedication] = React.useState(current?.medication ?? "");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ALLERGY_LABEL) as ProAllergy[]).map((allergy) => {
          const on = allergies.includes(allergy);
          return (
            <button
              key={allergy}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setAllergies((prev) =>
                  on ? prev.filter((a) => a !== allergy) : [...prev, allergy],
                )
              }
              className={cn(
                "h-10 rounded-xl border px-3 text-sm font-semibold",
                on
                  ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                  : "border-border text-text-secondary",
              )}
            >
              {ALLERGY_LABEL[allergy]}
            </button>
          );
        })}
      </div>
      <label className="flex min-h-10 items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={sensitive}
          onChange={(e) => setSensitive(e.target.checked)}
          className="h-4 w-4 accent-[var(--color-violet)]"
        />
        Piel sensible
      </label>
      <label className="flex min-h-10 items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={pregnancy}
          onChange={(e) => setPregnancy(e.target.checked)}
          className="h-4 w-4 accent-[var(--color-violet)]"
        />
        Embarazo
      </label>
      <input
        aria-label="Medicación"
        value={medication}
        onChange={(e) => setMedication(e.target.value)}
        placeholder="Medicación, si toma alguna"
        className={inputClass}
      />
      <Button
        variant="dark"
        disabled={!allowed("agenda.health")}
        onClick={async () => {
          if (
            await run("agenda.health", (d) =>
              saveHealth(d, clientId, {
                allergies,
                sensitiveSkin: sensitive || undefined,
                pregnancy: pregnancy || undefined,
                medication: medication.trim() || undefined,
                updatedAt: nowIso(),
                updatedBy: data.space.owner.firstName || undefined,
              }),
            )
          ) {
            toast.success("Salud guardada en la ficha");
            onDone();
          }
        }}
      >
        Guardar
      </Button>
    </div>
  );
}
