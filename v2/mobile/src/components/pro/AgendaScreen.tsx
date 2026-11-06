import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Btn, EmptyState, Skeleton, Tap } from "@/components/ui";
import { Stagger } from "@/components/motion";
import { WorkspaceSwitch } from "@/components/WorkspaceScreens";
import { C, F, S } from "@/theme";
import {
  addDays,
  atLocal,
  dayLabel,
  localDate,
} from "../../../../shared/pro/format";
import { bookingsOn } from "../../../../shared/pro/agenda";
import { useNativePro } from "./ProProvider";
import { AgendaCalendar } from "./AgendaCalendar";
import { BookingSheet } from "./BookingSheet";
import { NewBookingSheet } from "./NewBookingSheet";
import { ProError } from "./ProUi";

export function AgendaScreen() {
  const router = useRouter();
  const pro = useNativePro();
  const { snapshot, date, now, pending, loading, error } = pro;
  const [selected, setSelected] = useState<string | null>(null);
  const [create, setCreate] = useState<null | {
    staffId?: string;
    minute?: number;
  }>(null);
  const data = snapshot?.data;
  const validDate =
    snapshot &&
    snapshot.range.from <= atLocal(date, 0) &&
    snapshot.range.until > atLocal(date, 1440);
  const list =
    data && validDate
      ? bookingsOn(data, date).filter((booking) => !booking.waitlisted)
      : [];
  return (
    <Screen
      pad
      title="Agenda"
      subtitle={data?.space.name ?? "Franky Pro"}
      back
      right={<WorkspaceSwitch />}
      onBack={() => router.replace("/(workspace)/resumen")}
      refreshing={loading && !!data}
      onRefresh={() => void pro.refresh()}
    >
      <View
        style={{
          gap: S.xl,
          width: "100%",
          maxWidth: 1040,
          alignSelf: "center",
        }}
      >
        <Stagger style={{ gap: S.lg }}>
          <View style={{ gap: S.sm }}>
            <Text style={F.label}>Tu día, de un vistazo</Text>
            <Text style={F.h1}>
              {loading && !data
                ? "Preparando tu agenda"
                : !data || !validDate || !snapshot?.complete
                  ? "Tu agenda"
                  : `${list.length} ${list.length === 1 ? "cita" : "citas"}`}
            </Text>
            <Text style={F.small}>
              Cada profesional tiene su columna. Toca un hueco para añadir una
              cita.
            </Text>
          </View>
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}
          >
            <Tap
              accessibilityLabel="Día anterior"
              disabled={pending}
              onPress={() => pro.changeDate(addDays(date, -1))}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ChevronLeft size={22} color={C.text} strokeWidth={1.8} />
            </Tap>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={F.h3}>{dayLabel(atLocal(date, 720))}</Text>
            </View>
            <Tap
              accessibilityLabel="Día siguiente"
              disabled={pending}
              onPress={() => pro.changeDate(addDays(date, 1))}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ChevronRight size={22} color={C.text} strokeWidth={1.8} />
            </Tap>
          </View>
          <View
            style={{
              flexDirection: "row",
              gap: S.sm,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Btn
              label="Hoy"
              variant="ghost"
              small
              disabled={pending || date === localDate(now)}
              onPress={() => pro.changeDate(localDate(now))}
            />
            <Btn
              label="Nueva cita"
              icon={Plus}
              small
              disabled={!pro.can("booking.create")}
              onPress={() => setCreate({})}
            />
          </View>
        </Stagger>
        <ProError message={error} retry={() => void pro.refresh()} />
        {loading && (!data || !validDate) ? (
          <View style={{ gap: S.md }}>
            <Skeleton height={62} />
            <Skeleton height={420} />
          </View>
        ) : !data ? (
          <EmptyState
            icon={CalendarDays}
            title="Tu agenda aún no está conectada"
            subtitle="Puedes seguir trabajando desde las herramientas del negocio."
            cta="Volver al negocio"
            onCta={() => router.replace("/(workspace)/resumen")}
          />
        ) : !data.staff.length ? (
          <EmptyState
            icon={CalendarDays}
            title="Añade a tu equipo"
            subtitle="Configura los profesionales y sus horarios para empezar a recibir citas."
            cta="Configurar actividad"
            onCta={() => router.push("/card-sector")}
          />
        ) : (
          <AgendaCalendar
            openBooking={setSelected}
            newBooking={(initial) => setCreate(initial)}
          />
        )}
        <Btn
          label="Más herramientas del negocio"
          variant="ghost"
          disabled={pending}
          onPress={() => router.replace("/(workspace)/resumen")}
        />
      </View>
      {data && selected ? (
        <BookingSheet bookingId={selected} close={() => setSelected(null)} />
      ) : null}
      {data && create ? (
        <NewBookingSheet
          close={() => setCreate(null)}
          initial={
            create.staffId && create.minute !== undefined
              ? { staffId: create.staffId, minute: create.minute }
              : undefined
          }
        />
      ) : null}
    </Screen>
  );
}
