"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-client";
import { startTimes } from "./agenda";
import { localMinutes } from "./format";
import { publicProError } from "./remote-actions";
import { usePro } from "./store";
import { loadProSlots } from "../../../../shared/pro/slots";

/** La creación real consulta el motor que reserva, incluidos recursos y pausas. */
export function useAgendaSlots(input: {
  date: string;
  serviceId?: string;
  staffId?: string;
  resourceIds?: string[];
  partySize?: number;
  duration: number;
  fromMinute?: number;
  enabled?: boolean;
  ignoreBookingId?: string;
}) {
  const { data, demo } = usePro();
  const client = useMemo(() => createClient(), []);
  const [result, setResult] = useState<{
    key: string;
    minutes: number[];
    error: string | null;
  }>({ key: "", minutes: [], error: null });
  const resources = [
    ...new Set(input.resourceIds ?? (input.staffId ? [input.staffId] : [])),
  ].sort();
  const resourceKey = resources.join(",");
  const key = [
    data.space.id,
    input.date,
    input.serviceId,
    resourceKey,
    input.partySize ?? 1,
    input.ignoreBookingId,
  ].join(":");
  const enabled =
    input.enabled !== false && Boolean(input.serviceId && resources.length);
  useEffect(() => {
    if (demo || !enabled) return;
    let active = true;
    void (async () => {
      try {
        const slots = await loadProSlots(client, {
          organizationId: data.space.id,
          serviceId: input.serviceId!,
          date: input.date,
          resourceIds: resourceKey.split(","),
          partySize: input.partySize ?? 1,
        });
        if (!active) return;
        setResult({
          key,
          minutes: [
            ...new Set(slots.map((value: string) => localMinutes(value))),
          ].sort((a, b) => a - b),
          error: null,
        });
      } catch (failure) {
        if (!active) return;
        const problem = failure && typeof failure === "object" ? failure : {};
        setResult({ key, minutes: [], error: publicProError(problem) });
      }
    })();
    return () => {
      active = false;
    };
  }, [
    client,
    demo,
    enabled,
    key,
    data.space.id,
    input.date,
    input.serviceId,
    resourceKey,
    input.partySize,
  ]);

  if (demo)
    return {
      minutes:
        enabled && input.staffId
          ? startTimes(
              data,
              input.date,
              input.staffId,
              input.duration,
              input.fromMinute ?? 0,
              input.ignoreBookingId,
              // Con el servicio se respetan pose, preparación y cabina.
              input.serviceId,
            )
          : [],
      loading: false,
      error: null,
    };
  return {
    minutes:
      enabled && result.key === key
        ? result.minutes.filter((minute) => minute >= (input.fromMinute ?? 0))
        : [],
    loading: enabled && result.key !== key,
    error: result.key === key ? result.error : null,
  };
}
