"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase-client";

/** Cookie-authenticated billing stays on the web; every response remains tied to its account. */
export function useOrganizationBillingClient(
  owner: string,
  organization: string,
) {
  const client = useMemo(() => createClient(), []);
  const generation = useRef(0),
    controller = useRef(new AbortController());
  useEffect(() => {
    controller.current = new AbortController();
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== owner) {
        generation.current++;
        controller.current.abort();
      }
    });
    return () => {
      generation.current++;
      controller.current.abort();
      subscription.unsubscribe();
    };
  }, [client, owner, organization]);
  const check = useCallback(
    async (revision: number) => {
      const {
        data: { session },
      } = await client.auth.getSession();
      if (
        controller.current.signal.aborted ||
        revision !== generation.current ||
        session?.user.id !== owner
      )
        throw Error("auth_required");
    },
    [client, owner],
  );
  const api = useCallback(
    async <T>(path: string, body?: unknown): Promise<T> => {
      const revision = generation.current;
      await check(revision);
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organization)}/billing/${path}`,
        {
          method: body === undefined ? "GET" : "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers:
            body === undefined
              ? undefined
              : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.current.signal,
        },
      );
      const result = await response.json();
      await check(revision);
      if (!response.ok)
        throw Object.assign(
          Error(result.error ?? "organization_billing_unavailable"),
          { status: response.status },
        );
      return result as T;
    },
    [check, organization],
  );
  const quote = useCallback(
    async <T>(args: Record<string, unknown>): Promise<T> => {
      const revision = generation.current;
      await check(revision);
      const { data, error } = await client
        .rpc("quote_organization_plan", {
          ...args,
          p_organization_id: organization,
        })
        .abortSignal(controller.current.signal);
      await check(revision);
      if (error) throw Error(error.message);
      return data as T;
    },
    [check, client, organization],
  );
  return { api, quote };
}
