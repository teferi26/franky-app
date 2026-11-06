"use client";

import * as React from "react";
import {
  BellRing,
  CalendarPlus,
  CheckCheck,
  FlaskConical,
  HeartPulse,
  Palette,
  PenLine,
  Ticket,
  Wallet,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId } from "@/lib/pro/store";
import type { ProBooking, ProClient, ProPayment } from "@/lib/pro/types";
import type {
  ProColorFormula,
  ProConsentTemplate,
} from "@/lib/pro/agenda-types";
import {
  bookFromWaitlist,
  bookingMessage,
  depositRule,
  freedGap,
  markConfirmed,
  markReminded,
  receiveDeposit,
  requestDeposit,
  returnDeposit,
  setWaitlistStatus,
  waitlistMatches,
  waitlistMessage,
} from "@/lib/pro/agenda-ops";
import {
  healthAlerts,
  isTechnicalService,
  lastFormula,
  needsPatchTest,
  pendingSignature,
  patchTestState,
  recordPatchTest,
  signConsent,
  signedFor,
  addFormula,
} from "@/lib/pro/agenda-clients";
import { activeBundle, bundleRemaining } from "@/lib/pro/agenda-money";
import type { Gap } from "@/lib/pro/agenda";
import {
  dayLabel,
  localDate,
  minutesToLabel,
  money,
  relative,
} from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import { FormField, Pill, inputClass, textareaClass } from "../../kit";
import { Callout, OptionButton, WhatsAppButton, useAgenda } from "./parts";

const nowIso = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* Lo que hay que saber antes de empezar                               */
/* ------------------------------------------------------------------ */

/**
 * Avisos de la ficha al abrir la cita: preferencias, alergias, prueba de
 * sensibilidad, consentimiento, bono y la última fórmula.
 */
export function BookingSignals({
  booking,
  onSign,
  onFormula,
  onPatchBooking,
  canPatchBooking = true,
}: {
  booking: ProBooking;
  onSign: (template: ProConsentTemplate) => void;
  onFormula: (base?: ProColorFormula) => void;
  onPatchBooking: () => void;
  canPatchBooking?: boolean;
}) {
  const { data, ops, run, allowed } = useAgenda();
  const toast = useToast();
  const client = data.clients.find((c) => c.id === booking.clientId);
  const service = data.services.find((s) => s.id === booking.serviceId);
  const date = localDate(booking.start);
  const open = !["done", "cancelled", "no_show"].includes(booking.status);
  const alerts = healthAlerts(client);
  const patch = needsPatchTest(data, client, service, date);
  const patchState = patchTestState(data, client, date);
  const consent = pendingSignature(data, client, service);
  const consentId = service?.agenda?.consentId;
  const signed = consentId ? signedFor(client, consentId) : undefined;
  const bundle = activeBundle(data, booking.clientId, booking.serviceId, date);
  const formula = lastFormula(client);
  const technical = isTechnicalService(service);

  if (!client) return null;

  return (
    <div className="flex flex-col gap-3">
      {client.tags.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Preferencias">
          {client.tags.map((tag) => (
            <Pill key={tag}>{tag}</Pill>
          ))}
        </div>
      ) : null}

      {alerts.length ? (
        <Callout tone="danger" icon={HeartPulse} title="Antes de empezar">
          {alerts.join(" · ")}
        </Callout>
      ) : null}

      {patch && open ? (
        <Callout
          tone="warning"
          icon={FlaskConical}
          title="Falta la prueba de sensibilidad"
          action={
            ops ? (
              <>
                <Button
                  size="sm"
                  variant="dark"
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
                  Prueba hecha hoy
                </Button>
                {canPatchBooking ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!allowed("booking.create")}
                    onClick={onPatchBooking}
                  >
                    <CalendarPlus className="h-3.5 w-3.5" /> Citar la prueba
                  </Button>
                ) : null}
              </>
            ) : null
          }
        >
          {patchState.status === "expired"
            ? `La última fue el ${dayLabel(patchState.at, { weekday: false })} y ya no vale.`
            : "No consta ninguna. Hazla al menos 48 horas antes del color."}
        </Callout>
      ) : null}

      {consent && open ? (
        <Callout
          tone="warning"
          icon={PenLine}
          title={`Falta firmar: ${consent.title}`}
          action={
            <Button
              size="sm"
              variant="dark"
              disabled={!allowed("agenda.consent")}
              onClick={() => onSign(consent)}
            >
              Firmar ahora
            </Button>
          }
        >
          Se firma con el dedo en esta pantalla y queda en su ficha con fecha.
        </Callout>
      ) : signed ? (
        <p className="flex items-center gap-1.5 text-sm text-text-secondary">
          <CheckCheck className="h-4 w-4 text-emerald-600" strokeWidth={1.9} />
          Consentimiento firmado el {dayLabel(signed.at, { weekday: false })}
        </p>
      ) : null}

      {bundle ? (
        <Callout tone="violet" icon={Ticket} title={bundle.label}>
          Le quedan {bundleRemaining(bundle)} de {bundle.sessions} sesiones. Al
          cobrar se descuenta sola.
        </Callout>
      ) : null}

      {technical && ops ? (
        <section className="rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
              <Palette className="h-3.5 w-3.5" strokeWidth={1.9} /> Última
              fórmula
            </p>
            {formula ? (
              <span className="text-xs text-text-muted">
                {/* Se guarda con la hora de la cita: la de hoy es "hoy", no "en 1 h". */}
                {localDate(formula.at) === localDate(new Date())
                  ? "hoy"
                  : relative(formula.at)}
              </span>
            ) : null}
          </div>
          {formula ? (
            <FormulaSummary formula={formula} />
          ) : (
            <p className="mt-2 text-sm text-text-muted">
              Aún no hay fórmula apuntada. Apúntala al terminar y la próxima vez
              la tendrás aquí.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {formula ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={!allowed("agenda.formula")}
                onClick={() => onFormula(formula)}
              >
                Repetir fórmula
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={!allowed("agenda.formula")}
              onClick={() => onFormula()}
            >
              Nueva fórmula
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function FormulaSummary({ formula }: { formula: ProColorFormula }) {
  return (
    <div className="mt-2">
      <p className="font-heading text-lg font-bold tabular">{formula.mix}</p>
      <p className="text-sm text-text-secondary">
        {formula.brand} · {formula.oxidant} · {formula.processMin} min ·{" "}
        {formula.zone}
      </p>
      {formula.result ? (
        <p className="mt-1 text-sm text-text-muted">{formula.result}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recordatorio y confirmación                                         */
/* ------------------------------------------------------------------ */

export function ReminderStrip({ booking }: { booking: ProBooking }) {
  const { data, now, run, allowed } = useAgenda();
  const toast = useToast();
  const future = Date.parse(booking.start) > now.getTime();
  if (
    !future ||
    booking.kind !== "appointment" ||
    !["confirmed", "requested"].includes(booking.status)
  )
    return null;
  const client = data.clients.find((c) => c.id === booking.clientId);
  const reminded = booking.agenda?.remindedAt;
  const confirmed = booking.agenda?.confirmedAt;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border px-3.5 py-3">
      <span className="min-w-0 flex-1 text-sm">
        {confirmed ? (
          <span className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCheck className="h-4 w-4" strokeWidth={1.9} /> Ha confirmado
            que viene
          </span>
        ) : reminded ? (
          <span className="text-text-secondary">
            Recordada {relative(reminded, now.getTime())}, sin confirmar
          </span>
        ) : (
          <span className="text-text-secondary">Sin recordar todavía</span>
        )}
      </span>
      {!confirmed ? (
        <>
          <WhatsAppButton
            phone={client?.phone}
            message={bookingMessage(data, "reminder", booking)}
            label="Recordar"
            onOpen={() => {
              if (allowed("agenda.remind"))
                void run("agenda.remind", (d) =>
                  markReminded(d, booking.id, nowIso()),
                );
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            className="h-10"
            disabled={!allowed("agenda.confirm")}
            onClick={async () => {
              if (
                await run("agenda.confirm", (d) =>
                  markConfirmed(d, booking.id, nowIso()),
                )
              )
                toast.success("Apuntado: viene seguro");
            }}
          >
            Ha confirmado
          </Button>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Señal                                                               */
/* ------------------------------------------------------------------ */

const DEPOSIT_METHODS: { value: ProPayment["method"]; label: string }[] = [
  { value: "bizum", label: "Bizum" },
  { value: "card", label: "Tarjeta" },
  { value: "cash", label: "Efectivo" },
];

export function DepositBox({ booking }: { booking: ProBooking }) {
  const { data, run, allowed, ops } = useAgenda();
  const toast = useToast();
  if (!ops) return null;
  const client = data.clients.find((c) => c.id === booking.clientId);
  const deposit = booking.agenda?.deposit;
  const open = ["requested", "confirmed"].includes(booking.status);

  if (deposit) {
    if (deposit.status === "pending")
      return (
        <Callout
          tone="warning"
          icon={Wallet}
          title={`Señal de ${money(deposit.cents)} pendiente`}
          action={
            <>
              <WhatsAppButton
                phone={client?.phone}
                message={bookingMessage(data, "deposit", booking)}
                label="Pedir por Bizum"
              />
              {DEPOSIT_METHODS.map((m) => (
                <Button
                  key={m.value}
                  size="sm"
                  variant="secondary"
                  className="h-10"
                  disabled={!allowed("agenda.deposit")}
                  onClick={async () => {
                    if (
                      await run("agenda.deposit", (d) =>
                        receiveDeposit(d, booking.id, {
                          method: m.value,
                          at: nowIso(),
                          paymentId: localId("p"),
                        }),
                      )
                    )
                      toast.success(
                        "Señal recibida",
                        "Se descuenta al cobrar la cita.",
                      );
                  }}
                >
                  Recibida por {m.label.toLowerCase()}
                </Button>
              ))}
            </>
          }
        >
          Se descuenta del precio cuando venga. Si no viene, se queda en caja.
        </Callout>
      );
    const text = {
      paid: `Señal de ${money(deposit.cents)} recibida`,
      kept: `Señal de ${money(deposit.cents)} retenida: no se presentó`,
      returned: `Señal de ${money(deposit.cents)} devuelta`,
    }[deposit.status];
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border px-3.5 py-3 text-sm">
        <Wallet className="h-4 w-4 text-text-muted" strokeWidth={1.9} />
        <span className="min-w-0 flex-1 font-medium">{text}</span>
        {deposit.status === "paid" && open ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={!allowed("agenda.deposit")}
            onClick={async () => {
              if (
                await run("agenda.deposit", (d) => returnDeposit(d, booking.id))
              )
                toast.success("Señal devuelta", "Ya no cuenta en la caja.");
            }}
          >
            Devolver
          </Button>
        ) : null}
      </div>
    );
  }

  const rule = open
    ? depositRule(data, booking.clientId, booking.serviceId)
    : null;
  if (!rule) return null;
  return (
    <Callout
      tone="warning"
      icon={Wallet}
      title={
        rule.reason === "noshows"
          ? `Ha faltado ${client?.noShows ?? 0} veces: pide señal`
          : "Este servicio lleva señal"
      }
      action={
        <Button
          size="sm"
          variant="dark"
          disabled={!allowed("agenda.deposit")}
          onClick={async () => {
            if (
              await run("agenda.deposit", (d) =>
                requestDeposit(d, booking.id, rule.cents),
              )
            )
              toast.success(
                "Señal pedida",
                "Ahora mándale el mensaje con el Bizum.",
              );
          }}
        >
          Pedir señal de {money(rule.cents)}
        </Button>
      }
    >
      Tú decides la regla en Ajustes. Si no viene, la señal se queda en caja.
    </Callout>
  );
}

/* ------------------------------------------------------------------ */
/* Hueco que se acaba de liberar                                       */
/* ------------------------------------------------------------------ */

/**
 * Después de cancelar o marcar "no vino": quién de la lista de espera quería
 * justo ese hueco, con el mensaje escrito y la opción de dárselo.
 */
export function FreedGapPanel({
  booking,
  onOffer,
  onDone,
}: {
  booking: ProBooking;
  onOffer: (gap: Gap) => void;
  onDone: () => void;
}) {
  const { data, now, run, allowed, ops, can, pending } = useAgenda();
  const toast = useToast();
  const gap = freedGap(data, booking, now);
  const matches = gap && ops ? waitlistMatches(data, gap) : [];
  const staff = data.staff.find((s) => s.id === gap?.staffId);

  if (!gap)
    return (
      <p className="text-sm text-text-muted">
        La hora ya ha pasado: no queda hueco que ofrecer.
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-bg-secondary p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Hueco libre
        </p>
        <p className="mt-1 font-heading text-2xl font-extrabold tabular">
          {minutesToLabel(gap.from)} a {minutesToLabel(gap.to)}
        </p>
        <p className="text-sm text-text-secondary">
          {dayLabel(booking.start)} con {staff?.name.split(" ")[0]}
        </p>
      </div>
      {matches.length ? (
        <div>
          <p className="mb-2 text-sm font-semibold">
            {matches.length === 1
              ? "Una persona quería este hueco"
              : `${matches.length} personas querían este hueco`}
          </p>
          <ul className="divide-y divide-border-light rounded-2xl border border-border">
            {matches.map((match) => {
              const service = data.services.find(
                (s) => s.id === match.entry.serviceId,
              );
              return (
                <li key={match.entry.id} className="flex flex-col gap-2 p-3.5">
                  <span className="text-sm">
                    <span className="font-semibold">{match.entry.name}</span>
                    <span className="text-text-muted">
                      {" "}
                      · {service?.name} a las {minutesToLabel(match.start)}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <WhatsAppButton
                      phone={match.entry.phone}
                      message={waitlistMessage(data, match)}
                      label="Avisar"
                      onOpen={() => {
                        if (allowed("agenda.waitlist"))
                          void run("agenda.waitlist", (d) =>
                            setWaitlistStatus(
                              d,
                              match.entry.id,
                              "offered",
                              nowIso(),
                            ),
                          );
                      }}
                    />
                    <Button
                      size="sm"
                      variant="dark"
                      className="h-10"
                      disabled={!allowed("agenda.waitlist")}
                      onClick={async () => {
                        if (
                          await run("agenda.waitlist", (d) =>
                            bookFromWaitlist(d, match.entry.id, {
                              bookingId: localId("b"),
                              staffId: gap.staffId,
                              date: gap.date,
                              minute: match.start,
                            }),
                          )
                        ) {
                          toast.success(
                            "Hueco recuperado",
                            `${match.entry.name} a las ${minutesToLabel(match.start)}`,
                          );
                          onDone();
                        }
                      }}
                    >
                      Darle el hueco
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          Nadie de la lista de espera encaja en este hueco. Puedes ofrecerlo a
          estudiantes cerca de tu negocio.
        </p>
      )}
      <Button
        variant={matches.length ? "outline" : "dark"}
        onClick={() => onOffer(gap)}
        disabled={pending || !can("offer.launch")}
      >
        <Zap className="h-4 w-4" /> Ofrecer a estudiantes
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fórmula de color                                                    */
/* ------------------------------------------------------------------ */

export function FormulaForm({
  client,
  booking,
  base,
  onDone,
}: {
  client: ProClient;
  booking: ProBooking;
  base?: ProColorFormula;
  onDone: () => void;
}) {
  const { run, allowed } = useAgenda();
  const toast = useToast();
  const [brand, setBrand] = React.useState(base?.brand ?? "");
  const [mix, setMix] = React.useState(base?.mix ?? "");
  const [oxidant, setOxidant] = React.useState(base?.oxidant ?? "20 vol");
  const [processMin, setProcessMin] = React.useState(base?.processMin ?? 35);
  const [zone, setZone] = React.useState(base?.zone ?? "Raíz");
  const [result, setResult] = React.useState("");
  const valid = brand.trim().length > 1 && mix.trim().length > 1;

  const save = async () => {
    const formula: ProColorFormula = {
      id: localId("f"),
      at: booking.start,
      staffId: booking.staffId,
      brand: brand.trim(),
      mix: mix.trim(),
      oxidant: oxidant.trim(),
      processMin,
      zone: zone.trim(),
      result: result.trim() || undefined,
    };
    if (await run("agenda.formula", (d) => addFormula(d, client.id, formula))) {
      toast.success("Fórmula guardada", `${formula.mix} en la ficha`);
      onDone();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        {base
          ? "Parte de la última. Cambia lo que hayas ajustado hoy."
          : "Queda en la ficha con fecha, aunque cambie tu equipo."}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Marca" htmlFor="f-brand">
          <input
            id="f-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Majirel"
            className={inputClass}
          />
        </FormField>
        <FormField label="Oxidante" htmlFor="f-ox">
          <input
            id="f-ox"
            value={oxidant}
            onChange={(e) => setOxidant(e.target.value)}
            className={inputClass}
          />
        </FormField>
      </div>
      <FormField
        label="Tonos y proporción"
        htmlFor="f-mix"
        hint="Como lo escribes en el salón: 7.1 + 8.1 (1:1)"
      >
        <input
          id="f-mix"
          value={mix}
          onChange={(e) => setMix(e.target.value)}
          className={cn(inputClass, "tabular")}
        />
      </FormField>
      <FormField label="Tiempo de pose">
        <div className="flex flex-wrap gap-2">
          {[20, 25, 30, 35, 40, 45].map((m) => (
            <OptionButton
              key={m}
              active={processMin === m}
              onClick={() => setProcessMin(m)}
            >
              {m} min
            </OptionButton>
          ))}
        </div>
      </FormField>
      <FormField label="Zona">
        <div className="flex flex-wrap gap-2">
          {["Raíz", "Medios y puntas", "Todo", "Mechas"].map((z) => (
            <OptionButton
              key={z}
              active={zone === z}
              onClick={() => setZone(z)}
            >
              {z}
            </OptionButton>
          ))}
        </div>
      </FormField>
      <FormField label="Resultado" htmlFor="f-result">
        <textarea
          id="f-result"
          value={result}
          onChange={(e) => setResult(e.target.value)}
          placeholder="Cubre bien las canas. La próxima, 5 min menos en puntas."
          className={textareaClass}
        />
      </FormField>
      <Button
        variant="dark"
        disabled={!valid || !allowed("agenda.formula")}
        onClick={save}
      >
        Guardar fórmula
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Consentimiento firmado con el dedo                                  */
/* ------------------------------------------------------------------ */

export function ConsentSign({
  client,
  template,
  onDone,
}: {
  client: ProClient;
  template: ProConsentTemplate;
  onDone: () => void;
}) {
  const { run, allowed, data } = useAgenda();
  const toast = useToast();
  const [signature, setSignature] = React.useState<string | null>(null);
  const staffName = data.space.owner.firstName || data.space.owner.name;

  return (
    <div className="flex flex-col gap-4">
      <div className="max-h-56 overflow-y-auto rounded-2xl bg-bg-secondary p-4 text-sm leading-relaxed text-text-secondary pro-scroll">
        <p className="mb-2 font-semibold text-text-primary">{template.title}</p>
        <p className="whitespace-pre-wrap">{template.body}</p>
      </div>
      <SignaturePad onChange={setSignature} />
      <p className="text-xs text-text-muted">
        Firma {client.name}. Queda guardado en su ficha con la fecha de hoy.
      </p>
      <Button
        variant="dark"
        disabled={!signature || !allowed("agenda.consent")}
        onClick={async () => {
          if (!signature) return;
          if (
            await run("agenda.consent", (d) =>
              signConsent(d, client.id, {
                id: localId("sg"),
                consentId: template.id,
                at: nowIso(),
                signature,
                by: staffName,
              }),
            )
          ) {
            toast.success("Consentimiento firmado", template.title);
            onDone();
          }
        }}
      >
        Guardar firma
      </Button>
    </div>
  );
}

/** Lienzo para firmar con el dedo o el ratón. Devuelve un PNG en data URL. */
export function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string | null) => void;
}) {
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const inked = React.useRef(false);
  const [empty, setEmpty] = React.useState(true);

  // El lienzo se dimensiona a su tamaño real para que el trazo no salga borroso.
  React.useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ratio = window.devicePixelRatio || 1;
    el.width = el.clientWidth * ratio;
    el.height = el.clientHeight * ratio;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = getComputedStyle(el).color;
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const clear = () => {
    const el = canvas.current;
    el?.getContext("2d")?.clearRect(0, 0, el.width, el.height);
    inked.current = false;
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvas}
        aria-label="Espacio para firmar"
        className="h-40 w-full touch-none rounded-2xl border border-dashed border-border bg-bg-primary text-text-primary"
        onPointerDown={(e) => {
          const ctx = canvas.current?.getContext("2d");
          if (!ctx) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const { x, y } = point(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvas.current?.getContext("2d");
          if (!ctx) return;
          const { x, y } = point(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          inked.current = true;
          setEmpty(false);
        }}
        onPointerUp={() => {
          drawing.current = false;
          if (inked.current && canvas.current)
            onChange(canvas.current.toDataURL("image/png"));
        }}
      />
      <div className="mt-1.5 flex items-center justify-between text-xs text-text-muted">
        <span>{empty ? "Firma aquí con el dedo" : "Firma lista"}</span>
        <button
          type="button"
          onClick={clear}
          className="inline-flex h-10 items-center font-semibold text-violet"
        >
          Borrar
        </button>
      </div>
    </div>
  );
}

/** Contador pequeño para cabeceras: citas de mañana sin confirmar. */
export function UnconfirmedBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
      <BellRing className="h-3.5 w-3.5" strokeWidth={1.9} /> {count} sin
      confirmar
    </span>
  );
}
