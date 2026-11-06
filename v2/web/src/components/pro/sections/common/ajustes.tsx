"use client";

import * as React from "react";
import QRCode from "qrcode";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Check,
  Copy,
  Download,
  ImagePlus,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import { PRO_CONTACT } from "@/lib/pro/contact";
import { minutesToLabel, money } from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import {
  FormField,
  PageHeader,
  Panel,
  Pill,
  Segmented,
  Tip,
  inputClass,
  textareaClass,
} from "../../kit";
import { AgendaSettings } from "../agenda/agenda-settings";

type Tab = "negocio" | "horario" | "enlace" | "plan" | "datos" | "agenda";
const DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

export default function AjustesSection() {
  const params = useSearchParams();
  const [tab, setTab] = React.useState<Tab>(
    params.get("tab") === "plan" ? "plan" : "negocio",
  );
  // Peluquerías y estética: señal, cancelación, mensajes y consentimientos.
  const agendaEngine = usePro().vertical.engine === "agenda";
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Ajustes"
        title="Tu negocio en Franky"
        description="Lo que ven los estudiantes, tu horario, tu enlace de reservas y tu plan."
      >
        <Segmented<Tab>
          label="Apartados"
          value={tab}
          onChange={setTab}
          options={[
            { value: "negocio", label: "Negocio" },
            { value: "horario", label: "Horario" },
            ...(agendaEngine
              ? [{ value: "agenda" as const, label: "Mensajes y reglas" }]
              : []),
            { value: "enlace", label: "Enlace y QR" },
            { value: "plan", label: "Plan" },
            { value: "datos", label: "Tus datos" },
          ]}
        />
      </PageHeader>
      {tab === "agenda" && agendaEngine ? <AgendaSettings /> : null}
      {tab === "negocio" ? <Business /> : null}
      {tab === "horario" ? <Hours /> : null}
      {tab === "enlace" ? <LinkAndQr /> : null}
      {tab === "plan" ? <Plan /> : null}
      {tab === "datos" ? <Data /> : null}
    </div>
  );
}

function Business() {
  const { data, update, pending, can } = usePro();
  const toast = useToast();
  const [name, setName] = React.useState(data.space.name);
  const [address, setAddress] = React.useState(data.space.address);
  const [city, setCity] = React.useState(data.space.city);
  const [description, setDescription] = React.useState(
    data.space.publicProfile.description,
  );
  const dirty =
    name !== data.space.name ||
    address !== data.space.address ||
    city !== data.space.city ||
    description !== data.space.publicProfile.description;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel
        title="Datos públicos"
        description="Aparecen en tu ficha de Franky."
      >
        <div className="flex flex-col gap-4">
          <FormField label="Nombre del negocio" htmlFor="aj-name">
            <input
              id="aj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Dirección" htmlFor="aj-address">
              <input
                id="aj-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={inputClass}
              />
            </FormField>
            <FormField label="Ciudad" htmlFor="aj-city">
              <input
                id="aj-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={inputClass}
              />
            </FormField>
          </div>
          <FormField
            label="Descripción"
            htmlFor="aj-desc"
            hint="Dos frases: qué haces y por qué venir. Piensa en alguien que no te conoce."
          >
            <textarea
              id="aj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={textareaClass}
              maxLength={280}
            />
          </FormField>
          <div className="flex justify-end">
            <Button
              variant="dark"
              disabled={pending || !can("space.update") || !dirty}
              onClick={async () => {
                if (
                  !(await update("space.update", (d) => ({
                    ...d,
                    space: {
                      ...d.space,
                      name,
                      address,
                      city,
                      publicProfile: { ...d.space.publicProfile, description },
                    },
                  })))
                )
                  return;
                toast.success("Guardado", "Tu ficha ya muestra los cambios.");
              }}
            >
              Guardar cambios
            </Button>
          </div>
        </div>
      </Panel>
      <Panel
        title="Fotos"
        description={`${data.space.publicProfile.photos} fotos publicadas`}
      >
        <div className="grid grid-cols-3 gap-2">
          {Array.from(
            { length: Math.min(6, data.space.publicProfile.photos) },
            (_, i) => (
              <div
                key={i}
                className="aspect-square rounded-xl bg-bg-secondary"
              />
            ),
          )}
        </div>
        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={() =>
            toast.info(
              "Sube tus fotos",
              "Desde el móvil puedes subirlas directamente desde la galería.",
            )
          }
        >
          <ImagePlus className="h-4 w-4" /> Añadir fotos
        </Button>
        <p className="mt-3 text-xs text-text-muted">
          Luz natural, el local con gente y tu trabajo de cerca. Las fotos del
          iPhone se convierten solas.
        </p>
      </Panel>
    </div>
  );
}

function Hours() {
  const { data, update, pending, can } = usePro();
  const toast = useToast();
  const [hours, setHours] = React.useState(data.space.hours);
  const toMin = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  return (
    <Panel
      title="Horario de apertura"
      description="Se usa para tu agenda, tus reservas online y para enseñarte abierto a los estudiantes."
    >
      <ul className="flex flex-col divide-y divide-border-light">
        {DAYS.map((day, i) => {
          const h = hours[i];
          return (
            <li key={day} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="w-24 text-sm font-semibold">{day}</span>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(h)}
                aria-label={`Abierto el ${day.toLowerCase()}`}
                onClick={() =>
                  setHours((prev) =>
                    prev.map((x, j) =>
                      j === i
                        ? x
                          ? null
                          : { open: 10 * 60, close: 20 * 60 }
                        : x,
                    ),
                  )
                }
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                  h ? "bg-violet" : "bg-bg-tertiary",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                    h ? "translate-x-[1.35rem]" : "translate-x-0.5",
                  )}
                />
              </button>
              {h ? (
                <span className="flex items-center gap-2">
                  <input
                    type="time"
                    step={900}
                    aria-label={`Abre el ${day.toLowerCase()}`}
                    value={minutesToLabel(h.open)}
                    onChange={(e) =>
                      setHours((prev) =>
                        prev.map((x, j) =>
                          j === i && x
                            ? { ...x, open: toMin(e.target.value) }
                            : x,
                        ),
                      )
                    }
                    className={cn(inputClass, "w-28")}
                  />
                  <span className="text-text-muted">a</span>
                  <input
                    type="time"
                    step={900}
                    aria-label={`Cierra el ${day.toLowerCase()}`}
                    value={minutesToLabel(h.close)}
                    onChange={(e) =>
                      setHours((prev) =>
                        prev.map((x, j) =>
                          j === i && x
                            ? { ...x, close: toMin(e.target.value) }
                            : x,
                        ),
                      )
                    }
                    className={cn(inputClass, "w-28")}
                  />
                </span>
              ) : (
                <span className="text-sm text-text-muted">Cerrado</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex justify-end">
        <Button
          variant="dark"
          disabled={pending || !can("space.hours")}
          onClick={async () => {
            if (
              !(await update("space.hours", (d) => ({
                ...d,
                space: { ...d.space, hours },
              })))
            )
              return;
            toast.success("Horario guardado");
          }}
        >
          Guardar horario
        </Button>
      </div>
    </Panel>
  );
}

function LinkAndQr() {
  const { data } = usePro();
  const toast = useToast();
  const url = `https://franky.es/n/${data.space.slug}`;
  const [qr, setQr] = React.useState<string>("");
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    QRCode.toDataURL(url, {
      margin: 1,
      width: 480,
      color: { dark: "#121019", light: "#ffffff" },
    })
      .then(setQr)
      .catch(() => setQr(""));
  }, [url]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel
        title="Tu enlace de reservas"
        description="Ponlo en la bio de Instagram, en Google y en WhatsApp. Abre tu ficha con el botón Reservar."
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            readOnly
            value={url}
            className={cn(inputClass, "font-medium")}
            aria-label="Enlace de reservas"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            variant="dark"
            onClick={() => {
              navigator.clipboard
                ?.writeText(url)
                .then(() => {
                  setCopied(true);
                  toast.success("Enlace copiado");
                  window.setTimeout(() => setCopied(false), 1800);
                })
                .catch(() => toast.info("Selecciona el enlace y cópialo"));
            }}
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}{" "}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { t: "Instagram", d: "Edita tu perfil y pégalo en Sitio web." },
            { t: "Google", d: "En tu ficha de Google, en Reservas." },
            { t: "WhatsApp", d: "Como respuesta rápida para quien pide cita." },
          ].map((x) => (
            <li key={x.t} className="rounded-xl bg-bg-secondary p-3 text-sm">
              <p className="font-semibold">{x.t}</p>
              <p className="mt-0.5 text-text-muted">{x.d}</p>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel
        title="QR para tu local"
        description="Para el mostrador, el espejo o las mesas."
      >
        <div className="mx-auto w-full max-w-[220px] rounded-2xl border border-border bg-white p-3">
          {qr ? (
            <img
              src={qr}
              alt={`Código QR de ${url}`}
              className="h-auto w-full"
            />
          ) : (
            <div className="aspect-square rounded-xl skeleton-shimmer" />
          )}
          <p className="mt-2 text-center text-[0.7rem] font-semibold text-[#121019]">
            Reserva con Franky
          </p>
        </div>
        {qr ? (
          <a
            href={qr}
            download={`qr-${data.space.slug}.png`}
            className="mt-4 flex h-10 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold"
          >
            <Download className="h-4 w-4" /> Descargar QR
          </a>
        ) : null}
      </Panel>
    </div>
  );
}

function Plan() {
  const { data, vertical } = usePro();
  const p = vertical.price;
  const isUni = vertical.id === "university";
  const founder = data.space.plan === "founder";
  const includes = [
    "Toda la operación de tu sector sin límites",
    "Ficha en Franky con reservas directas",
    "Ofertas relámpago y calendario académico",
    "Clientes, recordatorios y reseñas",
    "Equipo, permisos y fichaje",
    "Resultados de lo que te trae Franky",
    "Soporte por WhatsApp con una persona",
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Panel
        title="Tu plan"
        description={
          isUni
            ? "Piloto anual por servicio o facultad, con alcance acordado."
            : "Cuota fija. Cero comisión por cada cliente que te trae Franky."
        }
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-heading text-4xl font-extrabold tabular">
            {isUni
              ? `Desde ${money(p.founder * 100, { round: true })}`
              : p.monthly
                ? `${money(p.monthly * 100, { round: true })}`
                : "Gratis"}
          </span>
          <span className="text-text-muted">
            {isUni ? "al año" : p.monthly ? "al mes" : ""}
          </span>
          {founder && !isUni && p.founder && p.founder < p.annual ? (
            <Pill tone="violet">Fundador</Pill>
          ) : null}
        </div>
        {!isUni && p.annual ? (
          <p className="mt-2 text-sm text-text-secondary">
            O {money(p.annual * 100, { round: true })} al año (dos meses
            gratis).
            {founder && p.founder && p.founder < p.annual
              ? ` Como fundador, el primer año te sale por ${money(p.founder * 100, { round: true })}.`
              : ""}
          </p>
        ) : null}
        {p.note ? (
          <p className="mt-1 text-sm text-text-muted">{p.note}</p>
        ) : null}
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {includes.map((i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Check
                className="mt-0.5 h-4 w-4 shrink-0 text-violet"
                strokeWidth={2.4}
              />{" "}
              {i}
            </li>
          ))}
        </ul>
        <Tip className="mt-5" title="Sin permanencia">
          Cancelas cuando quieras y te llevas tus datos. Si dejas de pagar, tu
          ficha sigue en Franky y la Franky Card sigue funcionando gratis.
        </Tip>
      </Panel>
      <div className="flex flex-col gap-5">
        <SubscriptionPortal />
        <Panel
          title="¿Necesitas ayuda?"
          description="Si tienes una duda, puedes escribirnos cuando quieras."
        >
          <a
            href={PRO_CONTACT.whatsappHref(
              `Hola, soy de ${data.space.name} y quiero hablar de mi plan de Franky Pro`,
            )}
            className={buttonVariants({
              variant: "outline",
              className: "w-full",
            })}
          >
            <MessageCircle className="h-4 w-4" /> Escribir por WhatsApp
          </a>
          <p className="mt-3 text-center text-sm text-text-muted">
            o llama al {PRO_CONTACT.phoneLabel}
          </p>
        </Panel>
      </div>
    </div>
  );
}

function SubscriptionPortal() {
  const { spaceId, demo, can } = usePro();
  const [opening, setOpening] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function openPortal() {
    setOpening(true);
    setError(null);
    try {
      const response = await fetch("/api/pro/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: spaceId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          result.error ??
            "No hemos podido abrir tu suscripción. Vuelve a intentarlo.",
        );
      const target = new URL(result.url);
      if (
        target.protocol !== "https:" ||
        target.hostname !== "billing.stripe.com"
      )
        throw new Error(
          "No hemos podido abrir tu suscripción. Vuelve a intentarlo.",
        );
      window.location.assign(target.href);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No hemos podido abrir tu suscripción.",
      );
      setOpening(false);
    }
  }
  return (
    <Panel
      title="Tu suscripción"
      description="Cambia tu tarjeta, consulta tus facturas o cancela la renovación."
    >
      {demo ? (
        <Link
          href="/pro/empezar"
          className={buttonVariants({ variant: "dark", className: "w-full" })}
        >
          Empieza gratis 7 días
        </Link>
      ) : (
        <Button
          variant="dark"
          className="w-full"
          loading={opening}
          disabled={opening || !can("finance.read")}
          onClick={() => void openPortal()}
        >
          Gestionar suscripción
        </Button>
      )}
      {!demo && !can("finance.read") ? (
        <p className="mt-3 text-sm text-text-muted">
          La persona responsable del plan puede gestionarlo desde aquí.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-error">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
function Data() {
  const { data } = usePro();
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Tus datos son tuyos">
        <ul className="flex flex-col gap-3 text-sm text-text-secondary">
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet" />{" "}
            Exportas tus clientes, reservas y fichajes cuando quieras, en CSV.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet" />{" "}
            Franky trata los datos de tus clientes solo para darte el servicio,
            con contrato de encargado del tratamiento.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet" />{" "}
            Nunca usamos a tus clientes para campañas de otros negocios.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet" /> Las
            notas técnicas solo las ve tu equipo.
          </li>
        </ul>
      </Panel>
      <Panel title="Resumen de lo que guardas">
        <ul className="grid grid-cols-2 gap-3 text-sm">
          {[
            [
              "Clientes",
              data.clients.length ||
                data.communityMembers.length ||
                data.leads.length,
            ],
            ["Reservas y citas", data.bookings.length],
            ["Personas del equipo", data.staff.length],
            ["Fichajes", data.shifts.length],
          ].map(([k, v]) => (
            <li
              key={String(k)}
              className="rounded-xl bg-bg-secondary px-3 py-2.5"
            >
              <p className="text-text-muted">{k}</p>
              <p className="font-heading text-xl font-bold tabular">
                {Number(v).toLocaleString("es-ES")}
              </p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
