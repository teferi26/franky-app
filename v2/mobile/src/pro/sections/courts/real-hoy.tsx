import React from "react";
import { View } from "react-native";
import { CalendarDays, Plus } from "lucide-react-native";
import { C } from "@/theme";
import { usePro } from "../../store";
import { ProPage, useGoSection } from "../../shell";
import { dayOccupancy, resourceBookings } from "../../../../../shared/pro/courts";
import { dayLabel, localDate, money, plural, time } from "../../../../../shared/pro/format";
import { Empty, Kpi, KpiRow, ListRow, PButton, PageHeader, Panel, PText } from "../../kit";
import { CourtBookingDrawer, NewCourtBookingDrawer, type NewCourtPreset } from "./parts";
import { MoreButton, PanelLink, useMore } from "./ui";

export function RealCourtsHoy() {
  const { data, now, can, pending, loadDate } = usePro();
  const go = useGoSection();
  const today = localDate(now);
  const [opened, setOpened] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewCourtPreset>(null);
  React.useEffect(() => {
    void loadDate(today);
  }, [today, loadDate]);
  const bookings = resourceBookings(data, today).filter((booking) => booking.status !== "no_show");
  const upcoming = bookings.filter((booking) => Date.parse(booking.end) > now.getTime());
  const { visible, more } = useMore(upcoming);
  const recorded = data.payments.filter((payment) => localDate(payment.at) === today).reduce((sum, payment) => sum + payment.amountCents, 0);

  return (
    <ProPage>
      <PageHeader
        eyebrow="Hoy"
        title={data.space.name}
        description={`${dayLabel(now.toISOString())} · ${plural(bookings.length, "reserva", "reservas")}`}
        actions={<PButton label="Nueva reserva" icon={Plus} disabled={pending || !can("court.create")} onPress={() => setPreset({ date: today })} />}
      />
      <KpiRow>
        <Kpi label="Reservas hoy" value={bookings.length} />
        <Kpi label="Ocupación prevista" value={`${dayOccupancy(data, today)} %`} />
        {can("finance.read") ? <Kpi label="Cobros registrados hoy" value={money(recorded)} /> : null}
      </KpiRow>
      <Panel title="Próximas reservas" flush action={<PanelLink label="Ver calendario" onPress={() => go("pistas")} />}>
        {upcoming.length ? (
          <>
            {visible.map((booking, index) => (
              <ListRow
                key={booking.id}
                onPress={() => setOpened(booking.id)}
                accessibilityLabel={`${booking.clientName}, ${time(booking.start)} a ${time(booking.end)}`}
                last={index === visible.length - 1 && !more}
              >
                <PText v="h3" style={{ width: 52, fontVariant: ["tabular-nums"] }}>{time(booking.start)}</PText>
                <View style={{ flex: 1 }}>
                  <PText v="h3" numberOfLines={1}>{booking.clientName}</PText>
                  <PText v="tiny" numberOfLines={1}>{data.resources.find((resource) => resource.id === booking.resourceId)?.name ?? ""}</PText>
                </View>
                <PText v="small" color={C.muted}>{time(booking.end)}</PText>
              </ListRow>
            ))}
            <MoreButton onPress={more} />
          </>
        ) : (
          <Empty icon={CalendarDays} title="No quedan reservas para hoy" body="Abre el calendario para ver los próximos días o añadir una reserva." />
        )}
      </Panel>
      <CourtBookingDrawer bookingId={opened} onClose={() => setOpened(null)} />
      <NewCourtBookingDrawer preset={preset} onClose={() => setPreset(null)} />
    </ProPage>
  );
}
