"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CardCampaignConditions } from "./card-campaign";
import {
  CardSession,
  CardField,
  cardButton,
  cardInput,
  cardPanel,
  cardError,
  useCardClient,
} from "./card-client";
import {
  cardCents,
  type CardVenue,
  type CardOffer,
  type CardPage,
  type CardReadiness,
} from "../../../../shared/franky-card";
type Overview = {
  settings: CardReadiness;
  venues: CardPage<CardVenue>;
  offers: CardPage<CardOffer>;
  inconsistencies: {
    order_id: string;
    status: string;
    amount_cents: number;
    created_at: string;
  }[];
};
export default function CardAdmin() {
  return <CardSession>{(id) => <Admin userId={id} />}</CardSession>;
}
function Admin({ userId }: { userId: string }) {
  const { rpc, api } = useCardClient(userId);
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  const load = useCallback(
    async (target?: "venues" | "offers") => {
      try {
        const value = await rpc<Overview>("admin_franky_card", {
          p_action: "overview",
          p_target_id: null,
          p_data: {
            limit: 30,
            cursor: target ? data?.[target].next_cursor : null,
          },
        });
        setData((previous) =>
          target && previous
            ? {
                ...previous,
                [target]: {
                  items: [...previous[target].items, ...value[target].items],
                  next_cursor: value[target].next_cursor,
                },
              }
            : value,
        );
        setError("");
      } catch (e) {
        setData(null);
        setError(cardError((e as Error).message));
      }
    },
    [rpc, data?.venues.next_cursor, data?.offers.next_cursor],
  );
  useEffect(() => {
    void load();
  }, [rpc]);
  async function mutate(
    action: string,
    target: string | null = null,
    fields: Record<string, unknown> = {},
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await rpc("admin_franky_card", {
        p_action: action,
        p_target_id: target,
        p_data: fields,
      });
      setNotice("Cambio registrado en la auditoría.");
      await load();
    } catch (e) {
      setError(cardError((e as Error).message));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <Link href="/admin" className="text-sm text-violet">
        ← Administración
      </Link>
      <h1 className="text-3xl font-bold">Administrar Franky Card</h1>
      <p className="text-text-secondary">
        Adhesiones, ventajas, apertura por ciudad y revisión de cobros.
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
          {error}{" "}
          <Link
            className="underline"
            href={'/perfil/seguridad?mfa=required&next=/admin/card'}
          >
            Verificación en dos pasos
          </Link>
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-violet/10 p-4">
          {notice}
        </p>
      )}
      {data && (
        <>
          <section className={cardPanel}>
            <h2 className="text-xl font-bold">Apertura controlada</h2>
            <p className="my-3 text-sm">
              Módulo: {data.settings.enabled ? "visible" : "oculto"} · Nuevas
              compras:{" "}
              {data.settings.purchases_enabled ? "activadas" : "desactivadas"} ·
              Proveedor:{" "}
              {data.settings.provider_ready ? "configurado" : "pendiente"} ·
              Entorno:{" "}
              {data.settings.environment === "live" ? "real" : "pruebas"}
            </p>
            <p className="mb-4 text-sm">
              Desactivar nuevas compras mantiene la conciliación de pedidos y
              devoluciones existentes. Abrir una ciudad exige red suficiente
              para el público elegible; la configuración del proveedor se
              verifica por separado.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                disabled={busy}
                className={cardButton}
                onClick={() => {
                  if (
                    confirm(
                      data.settings.enabled
                        ? "¿Ocultar el módulo Card?"
                        : "¿Hacer visible el módulo Card? Esto no activa sus ventas.",
                    )
                  )
                    void mutate("settings", null, {
                      enabled: !data.settings.enabled,
                    });
                }}
              >
                {data.settings.enabled ? "Ocultar módulo" : "Mostrar módulo"}
              </button>
              <button
                disabled={
                  busy ||
                  (!data.settings.purchases_enabled &&
                    (!data.settings.provider_ready ||
                      data.settings.environment !== "live"))
                }
                className="rounded-xl border border-border px-4 py-3"
                onClick={() => {
                  if (
                    confirm(
                      data.settings.purchases_enabled
                        ? "¿Cerrar nuevas compras?"
                        : "¿Activar nuevas compras en ciudades aprobadas? Verifica antes pagos, condiciones y dispositivos.",
                    )
                  )
                    void mutate("settings", null, {
                      purchases_enabled: !data.settings.purchases_enabled,
                    });
                }}
              >
                {data.settings.purchases_enabled
                  ? "Cerrar nuevas compras"
                  : "Abrir nuevas compras"}
              </button>
            </div>
            <form
              className="mt-5 flex max-w-xl items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const action =
                  f.get("action") === "suspend_city"
                    ? "suspend_city"
                    : "approve_city";
                if (
                  action === "approve_city" ||
                  confirm(
                    "¿Cerrar nuevas ventas de Card en esta ciudad? Se mantienen los compromisos existentes.",
                  )
                )
                  void mutate(action, null, { city: f.get("city") });
              }}
            >
              <CardField label="Ciudad">
                <input
                  name="city"
                  className={cardInput}
                  required
                  maxLength={100}
                />
              </CardField>
              <select
                name="action"
                aria-label="Acción para la ciudad"
                className={cardInput}
              >
                <option value="approve_city">Comprobar y aprobar</option>
                <option value="suspend_city">Cerrar nuevas ventas</option>
              </select>
              <button disabled={busy} className={cardButton}>
                Aplicar
              </button>
            </form>
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-3">
              <h2 className="text-xl font-bold">Ventajas pendientes</h2>
              <p className="text-sm text-text-secondary">
                Aprueba primero la ventaja base del local. Revisa que el
                servicio incluido sea habitual, el precio real y las condiciones
                claras.
              </p>
              {data.offers.items.map((o) => (
                <article key={o.id} className={cardPanel}>
                  <h3 className="font-bold">
                    {o.title} · {o.percent}%
                  </h3>
                  <p className="mt-1 break-all text-xs">
                    Local {o.venue_id} ·{" "}
                    {o.kind === "base" ? "Base" : "Campaña"}
                  </p>
                  <p className="my-3 text-sm">{o.terms}</p>
                  <CardCampaignConditions offer={o} />
                  {o.budget_cents != null && (
                    <p className="my-3 text-sm">
                      Presupuesto: {cardCents(o.budget_cents)}
                    </p>
                  )}
                  <p className="mb-3 text-xs">
                    Servicios: {o.service_keys.join(", ")} · Mínimo{" "}
                    {cardCents(o.minimum_cents)}
                    {o.student_only ? " · Estudiantes verificados" : ""}
                    {o.minimum_age ? " · Edad " + o.minimum_age + "+" : ""}
                  </p>
                  <div className="flex gap-3">
                    <button
                      disabled={busy}
                      className={cardButton}
                      onClick={() => {
                        if (
                          o.percent !== 100 ||
                          confirm(
                            "Esta ventaja es gratuita al 100%. ¿Has verificado sus condiciones y la autorización del comercio?",
                          )
                        )
                          void mutate("approve_offer", o.id, {
                            extraordinary_confirmed: o.percent === 100,
                          });
                      }}
                    >
                      Aprobar
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void mutate("retire_offer", o.id)}
                    >
                      Retirar
                    </button>
                  </div>
                </article>
              ))}
              {!data.offers.items.length && (
                <p className={cardPanel}>No hay ventajas pendientes.</p>
              )}
              {data.offers.next_cursor && (
                <button
                  className={cardButton}
                  onClick={() => void load("offers")}
                >
                  Más ventajas
                </button>
              )}
            </section>
            <section className="space-y-3">
              <h2 className="text-xl font-bold">Establecimientos</h2>
              {data.venues.items.map((v) => (
                <article key={v.id} className={cardPanel}>
                  <h3 className="font-bold">{v.name}</h3>
                  <p className="my-2 text-sm">
                    {v.city} · {v.address} ·{" "}
                    {v.status === "active"
                      ? "Activo"
                      : v.status === "suspended"
                        ? "Suspendido"
                        : "Pendiente"}
                  </p>
                  <p className="mb-3 text-xs">
                    Adhesión: {v.agreement_version}
                  </p>
                  <div className="flex gap-3">
                    <button
                      className={cardButton}
                      disabled={busy || v.status === "active"}
                      onClick={() => void mutate("approve_venue", v.id)}
                    >
                      Aprobar local
                    </button>
                    <button
                      disabled={busy || v.status === "suspended"}
                      onClick={() => {
                        if (
                          confirm(
                            "¿Suspender nuevas validaciones de este local? Los registros anteriores se conservan.",
                          )
                        )
                          void mutate("suspend_venue", v.id);
                      }}
                    >
                      Suspender
                    </button>
                  </div>
                </article>
              ))}
              {!data.venues.items.length && (
                <p className={cardPanel}>Todavía no hay adhesiones reales.</p>
              )}
              {data.venues.next_cursor && (
                <button
                  className={cardButton}
                  onClick={() => void load("venues")}
                >
                  Más locales
                </button>
              )}
            </section>
          </div>
          <section className={cardPanel}>
            <h2 className="text-xl font-bold">
              Pedidos que requieren revisión
            </h2>
            {data.inconsistencies.length ? (
              data.inconsistencies.map((o) => (
                <p key={o.order_id} className="mt-3 break-all text-sm">
                  {o.order_id} · {cardCents(o.amount_cents)} ·{" "}
                  {new Date(o.created_at).toLocaleString("es-ES")}
                </p>
              ))
            ) : (
              <p className="mt-3 text-sm text-text-secondary">
                No hay incidencias en esta consulta.
              </p>
            )}
            <form
              className="mt-5 grid max-w-2xl gap-3 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (lock.current) return;
                const f = new FormData(e.currentTarget);
                if (
                  !confirm(
                    "¿Solicitar la devolución total de este pedido por el medio original?",
                  )
                )
                  return;
                lock.current = true;
                setBusy(true);
                try {
                  await api("refund", {
                    orderId: f.get("order"),
                    reason: f.get("reason"),
                  });
                  setNotice(
                    "Devolución solicitada. El estado definitivo se confirmará con el proveedor.",
                  );
                  await load();
                } catch {
                  setError(
                    "No se ha confirmado la devolución. Revisa el pedido antes de reintentar.",
                  );
                } finally {
                  lock.current = false;
                  setBusy(false);
                }
              }}
            >
              <CardField label="Identificador del pedido">
                <input
                  name="order"
                  className={cardInput}
                  required
                  pattern="[0-9a-fA-F-]{36}"
                />
              </CardField>
              <CardField label="Motivo">
                <select className={cardInput} name="reason">
                  <option value="customer_request">
                    Solicitud del titular
                  </option>
                  <option value="duplicate">Cobro duplicado</option>
                  <option value="service_issue">Incidencia del servicio</option>
                </select>
              </CardField>
              <button disabled={busy} className={cardButton}>
                Solicitar devolución total
              </button>
            </form>
          </section>
          <section className={cardPanel}>
            <h2 className="text-xl font-bold">Verificación independiente</h2>
            <p className="mt-2 text-sm text-text-secondary">
              La compra de una Card no acredita matrícula ni edad. Registra sólo
              verificaciones basadas en evidencia comprobada; no pegues
              documentos ni datos personales en el motivo.
            </p>
            <form
              className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void mutate(String(f.get("type")), String(f.get("user")), {
                  source: f.get("source"),
                  reason_code: "evidence_checked",
                  until: new Date(
                    String(f.get("until")) + "T23:59:59",
                  ).toISOString(),
                  ...(f.get("age") ? { age: Number(f.get("age")) } : {}),
                });
              }}
            >
              <CardField label="Identificador de cuenta">
                <input
                  name="user"
                  required
                  pattern="[0-9a-fA-F-]{36}"
                  className={cardInput}
                />
              </CardField>
              <CardField label="Qué has verificado">
                <select name="type" className={cardInput}>
                  <option value="verify_student">
                    Afiliación universitaria
                  </option>
                  <option value="verify_age">Edad</option>
                </select>
              </CardField>
              <CardField label="Fuente de verificación">
                <select name="source" className={cardInput}>
                  <option value="institutional_email">
                    Correo institucional comprobado
                  </option>
                  <option value="document_review">Revisión documental</option>
                  <option value="trusted_integration">
                    Integración autorizada
                  </option>
                </select>
              </CardField>
              <CardField label="Válida hasta">
                <input
                  type="date"
                  name="until"
                  required
                  className={cardInput}
                />
              </CardField>
              <CardField label="Edad acreditada (si procede)">
                <input
                  type="number"
                  min={16}
                  max={120}
                  name="age"
                  className={cardInput}
                />
              </CardField>
              <button disabled={busy} className={cardButton}>
                Registrar verificación
              </button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
