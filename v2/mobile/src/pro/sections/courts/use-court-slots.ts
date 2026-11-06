import { useEffect, useState } from "react";
import { useSessionOwner } from "@/lib/useSessionOwner";
import { isCurrentSessionIdentity } from "@/lib/session";
import { createNativeProClient } from "@/lib/pro-client";
import { localMinutes } from "../../../../../shared/pro/format";
import { loadProSlots } from "../../../../../shared/pro/slots";
import { publicProError } from "../../../../../shared/pro/remote-actions";
import { usePro } from "../../store";

/**
 * Versión nativa de web/src/lib/pro/use-agenda-slots.ts para pistas y
 * espacios de un negocio real: la creación consulta el mismo motor que
 * reserva (professional_get_slots), incluidos recursos y pausas.
 */
export function useCourtSlots(input: {
  date: string;
  serviceId?: string;
  resourceIds?: string[];
  partySize?: number;
  fromMinute?: number;
  enabled?: boolean;
}) {
  const { data, demo } = usePro();
  const owner = useSessionOwner();
  const organizationId = data.space.id;
  const [result, setResult] = useState<{ key: string; minutes: number[]; error: string | null }>({ key: "", minutes: [], error: null });
  const resourceKey = [...new Set(input.resourceIds ?? [])].sort().join(",");
  const key = [organizationId, input.date, input.serviceId, resourceKey, input.partySize ?? 1].join(":");
  const enabled = !demo && input.enabled !== false && Boolean(owner && input.serviceId && resourceKey);

  useEffect(() => {
    if (!enabled || !owner || !input.serviceId) return;
    const controller = new AbortController();
    let active = true;
    const client = createNativeProClient({
      owner,
      organizationId,
      signal: controller.signal,
      isCurrent: () => active && isCurrentSessionIdentity(owner),
    });
    void (async () => {
      try {
        const slots = await loadProSlots(client, {
          organizationId,
          serviceId: input.serviceId!,
          date: input.date,
          resourceIds: resourceKey.split(","),
          partySize: input.partySize ?? 1,
        });
        if (!active) return;
        setResult({ key, minutes: [...new Set(slots.map((value) => localMinutes(value)))].sort((a, b) => a - b), error: null });
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
  }, [enabled, owner, organizationId, key, input.date, input.serviceId, resourceKey, input.partySize]);

  return {
    minutes: enabled && result.key === key ? result.minutes.filter((minute) => minute >= (input.fromMinute ?? 0)) : [],
    loading: enabled && result.key !== key,
    error: result.key === key ? result.error : null,
  };
}
