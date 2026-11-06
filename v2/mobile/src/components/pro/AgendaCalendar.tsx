import React, { useMemo } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Plus } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, F, R, S } from "@/theme";
import {
  bookingDaySpan,
  bookingsOn,
  hoursOn,
  openingIntervals,
  startTimes,
} from "../../../../shared/pro/agenda";
import {
  localDate,
  localMinutes,
  minutesToLabel,
  time,
} from "../../../../shared/pro/format";
import { useNativePro } from "./ProProvider";
import { BOOKING_LABEL } from "./BookingSheet";

const SLOT = 15;
const ROW = 44;

export function AgendaCalendar({
  openBooking,
  newBooking,
}: {
  openBooking(id: string): void;
  newBooking(initial: { staffId: string; minute: number }): void;
}) {
  const { snapshot, date, now, can } = useNativePro();
  const { width } = useWindowDimensions();
  const data = snapshot!.data;
  const column = Math.max(
    176,
    Math.floor(
      (Math.min(1040, width - 2 * S.lg) - 54) / Math.max(1, data.staff.length),
    ),
  );
  const bookings = bookingsOn(data, date)
    .filter((booking) => !booking.waitlisted)
    .flatMap((booking) => {
      const span = bookingDaySpan(booking, date);
      return span ? [{ booking, span }] : [];
    });
  const hours = hoursOn(data, date);
  const from =
    Math.floor(
      Math.min(
        hours?.open ?? 9 * 60,
        ...bookings.map(({ span }) => span.from),
      ) / 60,
    ) * 60;
  const until = Math.min(
    1440,
    Math.ceil(
      Math.max(
        hours?.close ?? 18 * 60,
        ...bookings.map(({ span }) => span.to),
      ) / 60,
    ) * 60,
  );
  const ticks = Array.from(
    { length: Math.max(1, (until - from) / SLOT) },
    (_, i) => from + i * SLOT,
  );
  const minimum =
    localDate(now) === date
      ? localMinutes(now) + 1
      : localDate(now) > date
        ? 1440
        : 0;
  const free = useMemo(
    () =>
      new Map(
        data.staff.map((staff) => [
          staff.id,
          new Set(startTimes(data, date, staff.id, SLOT, minimum)),
        ]),
      ),
    [data, date, minimum],
  );
  const create = can("booking.create");
  const height = ticks.length * ROW;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: R.md,
        overflow: "hidden",
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        directionalLockEnabled
      >
        <View>
          <View
            style={{
              flexDirection: "row",
              height: 62,
              backgroundColor: C.surface,
              borderBottomWidth: 1,
              borderBottomColor: C.border,
            }}
          >
            <View style={{ width: 54 }} />
            {data.staff.map((staff) => (
              <View
                key={staff.id}
                style={{
                  width: column,
                  padding: S.md,
                  borderLeftWidth: 1,
                  borderLeftColor: C.borderLight,
                  justifyContent: "center",
                }}
              >
                <Text numberOfLines={1} style={F.h3}>
                  {staff.name}
                </Text>
                <Text numberOfLines={1} style={F.tiny}>
                  {staff.title || "Profesional"}
                </Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row" }}>
            <View style={{ width: 54, height }}>
              {ticks.map((minute) => (
                <View
                  key={minute}
                  style={{ height: ROW, paddingTop: 4, alignItems: "center" }}
                >
                  {minute % 60 === 0 ? (
                    <Text style={F.tiny}>{minutesToLabel(minute)}</Text>
                  ) : null}
                </View>
              ))}
            </View>
            {data.staff.map((staff) => {
              const opening = openingIntervals(data, date, staff.id);
              const staffBookings = bookings.filter(
                ({ booking }) =>
                  booking.staffId === staff.id ||
                  booking.resourceIds?.includes(staff.id),
              );
              return (
                <View
                  key={staff.id}
                  style={{
                    width: column,
                    height,
                    borderLeftWidth: 1,
                    borderLeftColor: C.borderLight,
                  }}
                >
                  {ticks.map((minute) => {
                    const available = create && free.get(staff.id)?.has(minute);
                    const open = opening.some(
                      (interval) =>
                        interval.open <= minute &&
                        interval.close >= minute + SLOT,
                    );
                    return (
                      <Tap
                        key={minute}
                        accessibilityLabel={`Nueva cita con ${staff.name} a las ${minutesToLabel(minute)}`}
                        disabled={!available}
                        onPress={() =>
                          newBooking({ staffId: staff.id, minute })
                        }
                        style={{
                          height: ROW,
                          borderTopWidth: minute % 60 === 0 ? 1 : 0.5,
                          borderTopColor: C.borderLight,
                          backgroundColor: open ? C.surface : C.input,
                          paddingHorizontal: S.md,
                          justifyContent: "center",
                        }}
                      >
                        {available && minute % 60 === 0 ? (
                          <Plus size={16} strokeWidth={1.8} color={C.muted} />
                        ) : null}
                      </Tap>
                    );
                  })}
                  {staffBookings.map(({ booking, span }) => {
                    const top = Math.max(0, ((span.from - from) / SLOT) * ROW);
                    const bookingHeight = Math.min(
                      height - top,
                      Math.max(ROW, ((span.to - span.from) / SLOT) * ROW),
                    );
                    return (
                      <Tap
                        key={booking.id}
                        accessibilityLabel={`${booking.clientName}, ${time(booking.start)}, ${BOOKING_LABEL[booking.status]}`}
                        onPress={() => openBooking(booking.id)}
                        style={{
                          position: "absolute",
                          top,
                          left: 4,
                          right: 4,
                          height: bookingHeight - 2,
                          minHeight: 44,
                          borderRadius: R.sm,
                          backgroundColor: C.surface,
                          borderWidth: 1,
                          borderColor:
                            booking.status === "requested"
                              ? C.warning
                              : C.border,
                          borderLeftWidth: 3,
                          borderLeftColor: C.blue,
                          padding: S.sm,
                          overflow: "hidden",
                          opacity: booking.status === "no_show" ? 0.65 : 1,
                        }}
                      >
                        <Text numberOfLines={1} style={F.h3}>
                          {booking.clientName}
                        </Text>
                        {bookingHeight >= 68 ? (
                          <Text numberOfLines={1} style={F.tiny}>
                            {time(booking.start)} ·{" "}
                            {data.services.find(
                              (service) => service.id === booking.serviceId,
                            )?.name ?? "Cita"}
                          </Text>
                        ) : null}
                        {bookingHeight >= 100 ? (
                          <Text style={{ ...F.tiny, marginTop: S.sm }}>
                            {BOOKING_LABEL[booking.status]}
                          </Text>
                        ) : null}
                      </Tap>
                    );
                  })}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
