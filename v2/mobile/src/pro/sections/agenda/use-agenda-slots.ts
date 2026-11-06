import { useEffect, useState } from "react";
import { createNativeProClient } from "@/lib/pro-client";
import { useSessionOwner } from "@/lib/useSessionOwner";
import { startTimes } from "../../../../../shared/pro/agenda";
import { localMinutes } from "../../../../../shared/pro/format";
import { publicProError } from "../../../../../shared/pro/remote-actions";
import { loadProSlots } from "../../../../../shared/pro/slots";
import { usePro } from "../../store";

/**
 * Horas libres para citar. Versión nativa de web/src/lib/pro/use-agenda-slots.ts:
 * en la demo se calculan en el teléfono; en un negocio real se consulta el
 * motor que reserva, incluidos recursos y pausas.
 */
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
  const owner = useSessionOwner();
  const [result, setResult] = useState<{ key: string; minutes: number[]; error: string | null }>({
    key: "",
    minutes: [],
    error: null,
  });
  const resources = [...new Set(input.resourceIds ?? (input.staffId ? [input.staffId] : []))].sort();
  const resourceKey = resources.join(",");
  const key = [data.space.id, input.date, input.serviceId, resourceKey, input.partySize ?? 1, input.ignoreBookingId].join(":");
  const enabled = input.enabled !== false && Boolean(input.serviceId && resources.length);

  useEffect(() => {
    if (demo || !enabled || !owner) return;
    let active = true;
    const controller = new AbortController();
    const client = createNativeProClient({
      owner,
      organizationId: data.space.id,
      signal: controller.signal,
      isCurrent: () => active,
    });
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
          minutes: [...new Set(slots.map((value) => localMinutes(value)))].sort((a, b) => a - b),
          error: null,
        });
      } catch (failure) {
        if (!active) return;
        const problem = failure && typeof failure === "object" ? (failure as { message?: string; code?: string }) : {};
        setResult({ key, minutes: [], error: publicProError(problem) });
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [owner, demo, enabled, key, data.space.id, input.date, input.serviceId, resourceKey, input.partySize]);

  if (demo)
    return {
      minutes:
        enabled && input.staffId
          ? startTimes(data, input.date, input.staffId, input.duration, input.fromMinute ?? 0, input.ignoreBookingId)
          : [],
      loading: false,
      error: null,
    };
  return {
    minutes: enabled && result.key === key ? result.minutes.filter((minute) => minute >= (input.fromMinute ?? 0)) : [],
    loading: enabled && result.key !== key,
    error: result.key === key ? result.error : null,
  };
}
