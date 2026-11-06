"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import { dayOccupancy, resourceBookings } from "@/lib/pro/courts";
import { dayLabel, localDate, money, plural, time } from "@/lib/pro/format";
import { Empty, Kpi, KpiRow, PageHeader, Panel, Row, RowList } from "../../kit";
import { sectionHref } from "../../shell";
import {
  CourtBookingDrawer,
  NewCourtBookingDrawer,
  type NewCourtPreset,
} from "./parts";

export function RealCourtsHoy() {
  const { data, now, spaceId, can, pending, loadDate } = usePro();
  const today = localDate(now);
  const [opened, setOpened] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewCourtPreset>(null);
  React.useEffect(() => {
    void loadDate(today);
  }, [today, loadDate]);
  const bookings = resourceBookings(data, today).filter(
    (booking) => booking.status !== "no_show",
  );
  const upcoming = bookings.filter(
    (booking) => Date.parse(booking.end) > now.getTime(),
  );
  const recorded = data.payments
    .filter((payment) => localDate(payment.at) === today)
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Hoy"
        title={data.space.name}
        description={`${dayLabel(now.toISOString())} · ${plural(bookings.length, "reserva", "reservas")}`}
        actions={
          <Button
            variant="dark"
            disabled={pending || !can("court.create")}
            onClick={() => setPreset({ date: today })}
          >
            <Plus className="h-4 w-4" /> Nueva reserva
          </Button>
        }
      />
      <KpiRow>
        <Kpi label="Reservas hoy" value={bookings.length} />
        <Kpi
          label="Ocupación prevista"
          value={`${dayOccupancy(data, today)} %`}
        />
        {can("finance.read") ? (
          <Kpi label="Cobros registrados hoy" value={money(recorded)} />
        ) : null}
      </KpiRow>
      <Panel
        title="Próximas reservas"
        flush
        action={
          <Link
            className="text-sm font-semibold text-violet"
            href={sectionHref(spaceId, "pistas")}
          >
            Ver calendario
          </Link>
        }
      >
        {upcoming.length ? (
          <RowList>
            {upcoming.map((booking) => (
              <Row key={booking.id} onClick={() => setOpened(booking.id)}>
                <span className="w-12 shrink-0 font-semibold tabular">
                  {time(booking.start)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {booking.clientName}
                  </span>
                  <span className="block text-xs text-text-muted">
                    {
                      data.resources.find(
                        (resource) => resource.id === booking.resourceId,
                      )?.name
                    }
                  </span>
                </span>
                <span className="text-sm text-text-muted">
                  {time(booking.end)}
                </span>
              </Row>
            ))}
          </RowList>
        ) : (
          <Empty
            icon={CalendarDays}
            title="No quedan reservas para hoy"
            body="Abre el calendario para ver los próximos días o añadir una reserva."
          />
        )}
      </Panel>
      <CourtBookingDrawer bookingId={opened} onClose={() => setOpened(null)} />
      <NewCourtBookingDrawer preset={preset} onClose={() => setPreset(null)} />
    </div>
  );
}
