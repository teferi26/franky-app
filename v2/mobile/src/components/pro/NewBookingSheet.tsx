import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { Btn, Skeleton, Tap } from "@/components/ui";
import { C, F, S } from "@/theme";
import { atLocal, dayLabel, money, time } from "../../../../shared/pro/format";
import { useNativePro } from "./ProProvider";
import { ProChoice, ProError, ProField, ProSheet } from "./ProUi";
import { useProSlots } from "./useProSlots";

export function NewBookingSheet({
  initial,
  close,
}: {
  initial?: { staffId: string; minute: number };
  close(): void;
}) {
  const { snapshot, date, pending, error, can, update, refresh } =
    useNativePro();
  const data = snapshot!.data;
  const [staffId, setStaffId] = useState(
    initial?.staffId ?? data.staff[0]?.id ?? "",
  );
  const services = useMemo(
    () =>
      data.services.filter(
        (service) =>
          service.staffIds.includes(staffId) &&
          snapshot!.services.some(
            (raw) =>
              raw.id === service.id && raw.active && raw.mode === "appointment",
          ),
      ),
    [data.services, snapshot, staffId],
  );
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const selectedService = services.find((service) => service.id === serviceId);
  const [selectedStart, setSelectedStart] = useState(
    initial ? atLocal(date, initial.minute) : "",
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [source, setSource] = useState<"phone" | "walkin">("phone");
  const [validation, setValidation] = useState<string | null>(null);
  const ids = useRef({ booking: randomUUID(), client: randomUUID() });
  const availability = useProSlots(selectedService?.id ?? "", staffId);
  const start = availability.slots.includes(selectedStart) ? selectedStart : "";
  useEffect(() => {
    if (!services.some((service) => service.id === serviceId))
      setServiceId(services[0]?.id ?? "");
  }, [services, serviceId]);
  const matches =
    !clientId && name.trim().length >= 2
      ? data.clients
          .filter((client) =>
            client.name
              .toLocaleLowerCase("es")
              .includes(name.trim().toLocaleLowerCase("es")),
          )
          .slice(0, 5)
      : [];

  const save = async () => {
    if (!selectedService || !start || !name.trim()) {
      setValidation("Elige servicio, hora y nombre del cliente.");
      return;
    }
    if (phone && !/^[+\d\s().-]{6,30}$/.test(phone)) {
      setValidation("Revisa el teléfono del cliente.");
      return;
    }
    setValidation(null);
    const saved = await update("booking.create", (draft) => {
      const actualClientId = clientId ?? ids.current.client;
      if (!clientId) {
        draft.clients.push({
          id: actualClientId,
          name: name.trim(),
          phone: phone.trim() || undefined,
          tags: [],
          visits: 0,
          spentCents: null,
          noShows: 0,
          source,
          marketingConsent: false,
          cardMember: false,
          createdAt: new Date().toISOString(),
        });
      }
      draft.bookings.push({
        id: ids.current.booking,
        kind: "appointment",
        clientId: actualClientId,
        clientName: name.trim(),
        staffId,
        serviceId: selectedService.id,
        start,
        end: new Date(
          Date.parse(start) + selectedService.durationMin * 60_000,
        ).toISOString(),
        partySize: 1,
        status: "requested",
        priceCents: selectedService.priceCents,
        paidCents: null,
        source,
        note: note.trim(),
      });
    });
    if (saved) close();
  };

  return (
    <ProSheet title="Nueva cita" pending={pending} close={close}>
      <Text style={F.label}>{dayLabel(atLocal(date, 12 * 60))}</Text>
      <View style={{ gap: S.sm }}>
        <Text style={F.h3}>Profesional</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: S.sm }}
        >
          {data.staff.map((staff) => (
            <ProChoice
              key={staff.id}
              label={staff.name}
              selected={staffId === staff.id}
              disabled={pending}
              onPress={() => {
                setStaffId(staff.id);
                setSelectedStart("");
              }}
            />
          ))}
        </ScrollView>
      </View>
      <View style={{ gap: S.sm }}>
        <Text style={F.h3}>Servicio</Text>
        {services.map((service) => (
          <ProChoice
            key={service.id}
            label={`${service.name} · ${service.durationMin} min · ${money(service.priceCents)}`}
            selected={serviceId === service.id}
            disabled={pending}
            onPress={() => {
              setServiceId(service.id);
              setSelectedStart("");
            }}
          />
        ))}
        {!services.length ? (
          <Text style={F.small}>
            Añade un servicio para este profesional desde Gestión.
          </Text>
        ) : null}
      </View>
      <View style={{ gap: S.sm }}>
        <Text style={F.h3}>Hora</Text>
        {availability.loading ? (
          <Skeleton height={90} />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
            {availability.slots.map((slot) => (
              <ProChoice
                key={slot}
                label={time(slot)}
                selected={start === slot}
                disabled={pending}
                onPress={() => setSelectedStart(slot)}
              />
            ))}
          </View>
        )}
        {!availability.loading &&
        selectedService &&
        !availability.slots.length &&
        !availability.error ? (
          <Text style={F.small}>
            No quedan huecos para este servicio. Prueba otro profesional o día.
          </Text>
        ) : null}
        <ProError message={availability.error} retry={availability.retry} />
      </View>
      <ProField
        label="Nombre del cliente"
        value={name}
        maxLength={120}
        editable={!pending && !clientId}
        autoCapitalize="words"
        onChangeText={(value) => {
          setName(value);
          setClientId(null);
        }}
      />
      {matches.length ? (
        <View style={{ gap: S.sm }}>
          <Text style={F.label}>Clientes que ya conoces</Text>
          {matches.map((client) => (
            <Tap
              key={client.id}
              accessibilityLabel={`Seleccionar a ${client.name}`}
              disabled={pending}
              onPress={() => {
                setClientId(client.id);
                setName(client.name);
                setPhone(client.phone ?? "");
              }}
              style={{
                minHeight: 48,
                padding: S.md,
                borderWidth: 1,
                borderColor: C.border,
              }}
            >
              <Text style={F.h3}>{client.name}</Text>
              {client.phone ? (
                <Text style={F.small}>{client.phone}</Text>
              ) : null}
            </Tap>
          ))}
        </View>
      ) : null}
      {clientId ? (
        <Btn
          label="Elegir otro cliente"
          small
          variant="ghost"
          disabled={pending}
          onPress={() => {
            setClientId(null);
            setName("");
            setPhone("");
          }}
        />
      ) : null}
      <ProField
        label="Teléfono (opcional)"
        value={phone}
        maxLength={30}
        keyboardType="phone-pad"
        editable={!pending && !clientId}
        onChangeText={setPhone}
      />
      <View style={{ flexDirection: "row", gap: S.sm }}>
        <ProChoice
          label="Por teléfono"
          selected={source === "phone"}
          disabled={pending}
          onPress={() => setSource("phone")}
        />
        <ProChoice
          label="En el local"
          selected={source === "walkin"}
          disabled={pending}
          onPress={() => setSource("walkin")}
        />
      </View>
      <ProField
        label="Nota para el equipo"
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={2000}
        editable={!pending}
      />
      <ProError
        message={validation ?? error}
        retry={error ? () => void refresh() : undefined}
      />
      <Btn
        label={
          selectedService
            ? `Guardar cita · ${money(selectedService.priceCents)}`
            : "Guardar cita"
        }
        busy={pending}
        disabled={
          !can("booking.create") || !start || !selectedService || !name.trim()
        }
        onPress={() => void save()}
      />
    </ProSheet>
  );
}
