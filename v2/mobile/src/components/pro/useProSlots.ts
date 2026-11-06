import { useCallback, useEffect, useState } from "react";
import { loadProSlots } from "../../../../shared/pro/slots";
import { publicProError } from "../../../../shared/pro/remote-actions";
import { useNativePro } from "./ProProvider";

export function useProSlots(serviceId: string, staffId: string) {
  const { client, snapshot, date } = useNativePro();
  const org = snapshot?.data.space.id;
  const [retryVersion, setRetryVersion] = useState(0);
  const retry = useCallback(() => setRetryVersion((value) => value + 1), []);
  const key = [org, serviceId, staffId, date, retryVersion].join(":");
  const [result, setResult] = useState({
    key: "",
    snapshot,
    slots: [] as string[],
    error: null as string | null,
  });
  useEffect(() => {
    if (!org || !serviceId || !staffId) return;
    let active = true;
    void loadProSlots(client, {
      organizationId: org,
      serviceId,
      date,
      resourceIds: [staffId],
    })
      .then((slots) => {
        if (active)
          setResult({
            key,
            snapshot,
            slots: slots.filter((slot) => Date.parse(slot) > Date.now()),
            error: null,
          });
      })
      .catch((error: { message?: string; code?: string }) => {
        if (active)
          setResult({ key, snapshot, slots: [], error: publicProError(error) });
      });
    return () => {
      active = false;
    };
  }, [client, org, serviceId, staffId, date, key, snapshot]);
  const enabled = Boolean(org && serviceId && staffId);
  const matches = result.key === key && result.snapshot === snapshot;
  return {
    slots: enabled && matches ? result.slots : [],
    loading: enabled && !matches,
    error: matches ? result.error : null,
    retry,
  };
}
