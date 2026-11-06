import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CardScreen as Screen } from "./CardUi";
import { Btn, Pill } from "@/components/ui";
import { CardSurface as Card, CardChip as Chip } from "./CardUi";
import {
  WorkspaceMembers,
  WorkspaceResources,
  WorkspaceSwitch,
} from "@/components/WorkspaceScreens";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { CardNotice } from "./CardUi";
import { CardMerchantScreen } from "./CardMerchantScreens";
import {
  PROFESSIONAL_SECTORS,
  PROFESSIONAL_BOOKING_LABELS,
  professionalMoney,
  professionalError,
  type ProfessionalWorkspace as WorkspaceData,
  type ProfessionalBooking,
  type ProfessionalCategory,
} from "../../../../shared/professional-services";
import { C, F } from "@/theme";
import { PRO_VERTICALS } from "../../../../shared/pro/verticals";
import { ProAgendaEntry } from "@/components/pro/ProAgendaEntry";

type Context = {
  data: WorkspaceData | null;
  loading: boolean;
  error: string | null;
  reload(): Promise<void>;
  act(name: string, args: Record<string, unknown>): Promise<unknown>;
  busy: boolean;
};
const ProfessionalContext = createContext<Context | null>(null);
export function ProfessionalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspace = useWorkspace();
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const readVersion = useRef(0);
  const reload = useCallback(async () => {
    const id = workspace.active?.id;
    if (!id || workspace.active?.kind !== "leisure") return;
    const version = ++readVersion.current;
    setLoading(true);
    try {
      const result = await workspace.run<WorkspaceData>(
        "professional_get_workspace",
        {
          p_from: new Date(Date.now() - 24 * 3600_000).toISOString(),
          p_until: new Date(Date.now() + 30 * 86400_000).toISOString(),
        },
      );
      if (workspace.isCurrent(id) && version === readVersion.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (workspace.isCurrent(id) && version === readVersion.current) {
        setData(null);
        setError(
          professionalError(
            err instanceof Error
              ? err.message
              : String((err as { message?: string })?.message ?? ""),
          ),
        );
      }
    } finally {
      if (workspace.isCurrent(id) && version === readVersion.current)
        setLoading(false);
    }
  }, [workspace.active?.id, workspace.run, workspace.isCurrent]);
  useFocusEffect(
    useCallback(() => {
      void reload();
      return () => {
        ++readVersion.current;
      };
    }, [reload]),
  );
  useEffect(() => {
    setData(null);
  }, [workspace.active?.id]);
  const act = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      const id = workspace.active?.id;
      if (!id || lock.current) return;
      lock.current = true;
      ++readVersion.current;
      setLoading(false);
      setBusy(true);
      setError(null);
      try {
        const result = await workspace.run(name, args);
        if (workspace.isCurrent(id)) await reload();
        return result;
      } catch (err) {
        if (workspace.isCurrent(id))
          setError(
            professionalError(
              err instanceof Error
                ? err.message
                : String((err as { message?: string })?.message ?? ""),
            ),
          );
      } finally {
        lock.current = false;
        if (workspace.isCurrent(id)) setBusy(false);
      }
    },
    [workspace.active?.id, workspace.run, workspace.isCurrent, reload],
  );
  return (
    <ProfessionalContext.Provider
      value={{ data, loading, error, reload, act, busy }}
    >
      {children}
    </ProfessionalContext.Provider>
  );
}
export function useProfessionalWorkspace() {
  return useContext(ProfessionalContext);
}
export function professionalDate(value: string, timezone?: string) {
  return new Date(value).toLocaleString("es-ES", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BookingRow({
  booking,
  context,
}: {
  booking: ProfessionalBooking;
  context: Context;
}) {
  const router = useRouter();
  const canOperate = !!context.data?.permissions.some((permission) =>
    ["content.manage", "attendees.manage"].includes(permission),
  );
  const active = ["requested", "confirmed", "waitlisted"].includes(
    booking.status,
  );
  return (
    <Card style={{ gap: 11 }}>
      <Text style={F.h3}>
        {booking.service_name ?? booking.price_snapshot.service_name}
      </Text>
      <Text style={F.body}>
        {professionalDate(booking.starts_at, context.data?.settings?.timezone)}{" "}
        · {booking.party_size}{" "}
        {booking.party_size === 1 ? "persona" : "personas"}
      </Text>
      <Text style={F.small}>
        {booking.customer_name ?? "Cliente de la reserva"}
      </Text>
      <Pill
        label={PROFESSIONAL_BOOKING_LABELS[booking.status]}
        tone={booking.status === "confirmed" ? "green" : "gray"}
      />
      <Text style={F.small}>
        {professionalMoney(booking.total_cents)}
        {booking.deposit_status === "pending"
          ? " · Señal pendiente de proveedor"
          : ""}
      </Text>
      {booking.reschedule ? (
        <CardNotice
          text={`Propuesta: ${professionalDate(booking.reschedule.starts_at, context.data?.settings?.timezone)}. La reserva original se mantiene hasta que el cliente la acepte.`}
        />
      ) : null}
      {canOperate &&
      booking.status === "requested" &&
      booking.waitlist_offer_status !== "offered" ? (
        <Btn
          label="Confirmar reserva"
          small
          busy={context.busy}
          disabled={
            booking.deposit_cents > 0 && booking.deposit_status !== "paid"
          }
          onPress={() =>
            void context.act("professional_booking_action", {
              p_booking_id: booking.id,
              p_action: "confirm",
            })
          }
        />
      ) : null}
      {canOperate && booking.status === "confirmed" ? (
        <View style={{ gap: 8 }}>
          <Btn
            label="Registrar asistencia"
            small
            busy={context.busy}
            onPress={() =>
              void context.act("professional_booking_action", {
                p_booking_id: booking.id,
                p_action: "attend",
              })
            }
          />
          <Btn
            label="Marcar que no asistió"
            small
            variant="ghost"
            busy={context.busy}
            onPress={() =>
              void context.act("professional_booking_action", {
                p_booking_id: booking.id,
                p_action: "no_show",
              })
            }
          />
        </View>
      ) : null}
      {canOperate ? (
        <Btn
          label="Ver reserva y cambios"
          small
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: "/card-reserva",
              params: { booking: booking.id, at: booking.starts_at },
            })
          }
        />
      ) : null}
      {canOperate && active ? (
        <Btn
          label="Cancelar reserva"
          small
          variant="ghost"
          busy={context.busy}
          onPress={() =>
            void context.act("professional_booking_action", {
              p_booking_id: booking.id,
              p_action: "cancel",
            })
          }
        />
      ) : null}
    </Card>
  );
}

export function ProfessionalTab({ index }: { index: number }) {
  const context = useProfessionalWorkspace();
  const workspace = useWorkspace();
  const router = useRouter();
  if (!context || !workspace.active) return null;
  const { data, loading, error } = context;
  const settings = data?.settings;
  const sector = settings ? PROFESSIONAL_SECTORS[settings.category] : null;
  const label = sector?.tabs[index] ?? (index === 4 ? "Gestión" : "Tu negocio");
  if (index === 4) return <WorkspaceMembers management />;
  if (label === "Card") return <CardMerchantScreen />;
  if (label === "Eventos" || label === "Planes" || label === "Acceso")
    return (
      <WorkspaceResources
        type="event"
        alternate={label === "Planes" ? ["post"] : undefined}
      />
    );
  const manage = data?.permissions.includes("content.manage");
  const operate = data?.permissions.some((permission) =>
    ["content.manage", "attendees.manage"].includes(permission),
  );
  const blocked = !settings || !(settings.enabled || data?.demo);
  const agendaReady =
    !!settings &&
    !blocked &&
    settings.timezone === "Europe/Madrid" &&
    PRO_VERTICALS[settings.category].engine === "agenda" &&
    data?.permissions.includes("resource.read") &&
    (operate || data?.permissions.includes("finance.read"));
  return (
    <Screen
      title={index === 0 ? workspace.active.name : label}
      subtitle={sector?.label ?? "Actividad profesional"}
      right={<WorkspaceSwitch />}
      refreshing={loading && !!data}
      onRefresh={() => void context.reload()}
    >
      <View style={{ gap: 17 }}>
        {agendaReady && (index === 0 || label === "Agenda") ? (
          <ProAgendaEntry />
        ) : null}
        {loading && !data ? <ActivityIndicator color={C.blue} /> : null}
        <CardNotice error text={error} onRetry={() => void context.reload()} />
        <Btn
          label="Avisos de las reservas"
          small
          variant="ghost"
          onPress={() =>
            router.push({
              pathname: "/card-avisos",
              params: { scope: "workspace" },
            })
          }
        />
        {data?.demo ? (
          <Pill label="Demostración aislada" tone="orange" />
        ) : null}
        {blocked ? (
          <>
            <Card style={{ gap: 12 }}>
              <Text style={F.h2}>
                {settings
                  ? "Preparado para el piloto"
                  : "Elige las herramientas de tu actividad"}
              </Text>
              <Text style={F.small}>
                {settings
                  ? "Franky habilitará la operación cuando el calendario y los servicios estén preparados. La adhesión gratuita a Card es independiente."
                  : "Configura tu actividad principal para recibir una agenda y herramientas adaptadas."}
              </Text>
              {workspace.active.permissions.includes("settings.manage") ? (
                <Btn
                  label="Configurar actividad"
                  onPress={() => router.push("/card-sector")}
                />
              ) : null}
              <Btn
                label="Recepción Card y fidelización"
                variant="secondary"
                onPress={() => router.push("/card-recepcion")}
              />
              <Btn
                label="Gestionar ficha y locales"
                variant="ghost"
                onPress={() => router.push("/card-locales")}
              />
            </Card>
            {data?.bookings.length ? (
              <>
                <Text style={F.h2}>Reservas existentes</Text>
                <Text style={F.small}>
                  Aunque estén pausadas las nuevas reservas, puedes atender y
                  resolver los compromisos ya registrados.
                </Text>
                {data.bookings.map((booking) => (
                  <BookingRow
                    key={booking.id}
                    booking={booking}
                    context={context}
                  />
                ))}
              </>
            ) : null}
            {operate || data?.permissions.includes("finance.read") ? (
              <Btn
                label="Consultar registros existentes"
                variant="secondary"
                onPress={() => router.push("/card-registros")}
              />
            ) : null}
          </>
        ) : (
          <>
            {index === 0 ? (
              <>
                <Text style={F.h1}>{sector!.headline}</Text>
                <Text style={F.small}>
                  Agenda de los próximos 30 días · {settings.timezone}
                </Text>
                <Btn
                  label={sector!.action}
                  disabled={sector!.mode === "session" ? !manage : !operate}
                  onPress={() =>
                    settings.category === "cafe"
                      ? router.push("/card-recepcion")
                      : settings.category === "nightclub"
                        ? router.push("/card-locales")
                        : router.push({
                            pathname: "/card-reserva",
                            params: {
                              create:
                                sector!.mode === "session"
                                  ? "session"
                                  : "booking",
                            },
                          })
                  }
                />
                {data?.bookings
                  .filter((booking) =>
                    ["requested", "confirmed"].includes(booking.status),
                  )
                  .slice(0, 5)
                  .map((booking) => (
                    <BookingRow
                      key={booking.id}
                      booking={booking}
                      context={context}
                    />
                  ))}
                {!data?.bookings.some((booking) =>
                  ["requested", "confirmed"].includes(booking.status),
                ) ? (
                  <CardNotice text="Todavía no hay próximas reservas. Configura servicios, recursos y horarios para recibir a tus clientes." />
                ) : null}
                <Btn
                  label="Recepción Card y sellos"
                  variant="secondary"
                  onPress={() => router.push("/card-recepcion")}
                />
              </>
            ) : null}
            {["Agenda", "Reservas", "Horarios", "Actividades"].includes(
              label,
            ) ? (
              <>
                <Btn
                  label={
                    sector!.mode === "session"
                      ? "Crear sesión"
                      : "Añadir reserva"
                  }
                  disabled={sector!.mode === "session" ? !manage : !operate}
                  onPress={() =>
                    router.push({
                      pathname: "/card-reserva",
                      params: {
                        create:
                          sector!.mode === "session" ? "session" : "booking",
                      },
                    })
                  }
                />
                {data?.sessions.map((session) => (
                  <Card key={session.id} style={{ gap: 9 }}>
                    <Text style={F.h3}>
                      {data.services.find(
                        (service) => service.id === session.service_id,
                      )?.name ?? "Sesión"}
                    </Text>
                    <Text style={F.small}>
                      {professionalDate(session.starts_at, settings.timezone)} ·{" "}
                      {session.reserved_seats ?? 0}/{session.capacity} plazas
                    </Text>
                    <Btn
                      label="Inscribir a una persona"
                      small
                      variant="secondary"
                      disabled={!operate || session.status !== "open"}
                      onPress={() =>
                        router.push({
                          pathname: "/card-reserva",
                          params: { session: session.id, create: "booking" },
                        })
                      }
                    />
                  </Card>
                ))}
                {data?.bookings.map((booking) => (
                  <BookingRow
                    key={booking.id}
                    booking={booking}
                    context={context}
                  />
                ))}
                {!data?.sessions.length && !data?.bookings.length ? (
                  <CardNotice text="Aún no hay reservas o sesiones en este periodo." />
                ) : null}
              </>
            ) : null}
            {["Servicios", "Carta"].includes(label) ? (
              <>
                <Btn
                  label="Añadir servicio o menú"
                  disabled={!manage}
                  onPress={() =>
                    router.push({
                      pathname: "/card-sector",
                      params: { editor: "service" },
                    })
                  }
                />
                {data?.services.map((service) => (
                  <Card key={service.id} style={{ gap: 10 }}>
                    <Text style={F.h3}>{service.name}</Text>
                    <Text style={F.small}>{service.description}</Text>
                    <Text style={F.body}>
                      {professionalMoney(service.price_cents)}
                      {service.price_basis === "person"
                        ? " por persona"
                        : ""} · {service.duration_minutes} minutos
                    </Text>
                    {service.menu ? (
                      <Text style={F.small}>{service.menu}</Text>
                    ) : null}
                    <Btn
                      label="Editar servicio"
                      small
                      variant="secondary"
                      disabled={!manage}
                      onPress={() =>
                        router.push({
                          pathname: "/card-sector",
                          params: { editor: "service", id: service.id },
                        })
                      }
                    />
                  </Card>
                ))}
              </>
            ) : null}
            {label === "Espacios" ? (
              <>
                <Btn
                  label="Añadir recurso"
                  disabled={!manage}
                  onPress={() =>
                    router.push({
                      pathname: "/card-sector",
                      params: { editor: "resource" },
                    })
                  }
                />
                {data?.resources.map((resource) => (
                  <Card key={resource.id} style={{ gap: 8 }}>
                    <Text style={F.h3}>{resource.name}</Text>
                    <Text style={F.small}>
                      Capacidad: {resource.capacity} ·{" "}
                      {resource.active ? "Disponible" : "Archivado"}
                    </Text>
                    <Btn
                      label="Editar recurso"
                      small
                      variant="secondary"
                      disabled={!manage}
                      onPress={() =>
                        router.push({
                          pathname: "/card-sector",
                          params: { editor: "resource", id: resource.id },
                        })
                      }
                    />
                  </Card>
                ))}
              </>
            ) : null}
            {["Clientes", "Alumnos", "Asistentes"].includes(label) ? (
              <>
                {data?.customers.map((customer) => (
                  <Card key={customer.id} style={{ gap: 7 }}>
                    <Text style={F.h3}>{customer.display_name}</Text>
                    {customer.contact ? (
                      <Text style={F.small}>{customer.contact}</Text>
                    ) : null}
                    <Text style={F.small}>
                      {customer.user_id
                        ? "Cuenta vinculada"
                        : "Reserva telefónica o de mostrador"}
                    </Text>
                  </Card>
                ))}
                {data?.bookings
                  .filter((booking) => booking.status === "confirmed")
                  .map((booking) => (
                    <BookingRow
                      key={booking.id}
                      booking={booking}
                      context={context}
                    />
                  ))}
                {!data?.customers.length ? (
                  <CardNotice text="Los clientes aparecen cuando tienen una reserva. Su contacto no implica consentimiento comercial." />
                ) : null}
              </>
            ) : null}
            {label === "Bonos" ? (
              <>
                <Btn
                  label="Registrar bono de sesiones"
                  disabled={!data?.permissions.includes("finance.manage")}
                  onPress={() =>
                    router.push({
                      pathname: "/card-sector",
                      params: { editor: "bundle" },
                    })
                  }
                />
                {data?.bundles.map((bundle) => (
                  <Card key={bundle.id} style={{ gap: 8 }}>
                    <Text style={F.h3}>{bundle.label}</Text>
                    <Text style={F.body}>
                      {bundle.remaining} de {bundle.granted} sesiones
                      disponibles
                    </Text>
                    <Text style={F.small}>
                      {data.customers.find(
                        (customer) => customer.id === bundle.customer_id,
                      )?.display_name ?? "Cliente autorizado"}
                    </Text>
                  </Card>
                ))}
                <Text style={F.small}>
                  Las sesiones se consumen por asistencia registrada y se
                  reponen mediante una reversión con motivo. Un bono no acredita
                  cobro bancario.
                </Text>
              </>
            ) : null}
            {["Ingresos", "Resultados"].includes(label) ? (
              <>
                <CardNotice text="Consulta comprobantes y ajustes de Card por sede. Los consumos declarados no son pagos bancarios ni beneficios." />
                <Btn
                  label="Ver operaciones Card"
                  onPress={() => router.push("/card-comercio-historial")}
                />
                <Btn
                  label="Gestionar actividades y entradas"
                  variant="secondary"
                  onPress={() => router.push("/card-locales")}
                />
              </>
            ) : null}
            {data?.has_more ? (
              <CardNotice text="Esta vista contiene una selección de registros. Abre el historial completo para consultar por mes y cargar todas sus páginas." />
            ) : null}
            {operate || data?.permissions.includes("finance.read") ? (
              <Btn
                label="Consultar registros completos"
                variant="ghost"
                onPress={() => router.push("/card-registros")}
              />
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}
