import React, { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Btn } from "@/components/ui";
import { useWorkspace } from "@/components/WorkspaceProvider";

/** El panel anterior conserva la entrada hasta que las operaciones Pro responden. */
export function ProAgendaEntry() {
  const {
    active: selectedWorkspace,
    revision,
    run,
    isCurrent,
  } = useWorkspace();
  const router = useRouter();
  const [retryVersion, setRetryVersion] = useState(0);
  const scope = [selectedWorkspace?.id, revision, retryVersion].join(":");
  const [result, setResult] = useState({
    scope: "",
    connected: false,
    failed: false,
  });
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const id = selectedWorkspace?.id;
      setResult({ scope, connected: false, failed: false });
      if (!id) return;
      void run("pro_get_agenda_operations", {
        p_from: new Date().toISOString(),
        p_until: new Date(Date.now() + 86400000).toISOString(),
        p_limit: 1,
      })
        .then(() => {
          if (active && isCurrent(id))
            setResult({ scope, connected: true, failed: false });
        })
        .catch(() => {
          if (active && isCurrent(id))
            setResult({ scope, connected: false, failed: true });
        });
      return () => {
        active = false;
      };
    }, [selectedWorkspace?.id, scope, run, isCurrent]),
  );
  if (result.scope !== scope) return null;
  if (result.failed)
    return (
      <Btn
        label="Comprobar agenda Pro"
        variant="ghost"
        onPress={() => setRetryVersion((value) => value + 1)}
      />
    );
  if (!result.connected) return null;
  return <Btn label="Abrir Franky Pro" onPress={() => selectedWorkspace && router.push(`/pro/${selectedWorkspace.id}` as never)} />;
}
