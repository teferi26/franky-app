"use client";
import { useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase-client";
import { clientEnv } from "@/lib/env";
export function useProfessionalRpc(owner: string) {
  const supabase = useRef(createClient()).current,
    controller = useRef(new AbortController());
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current.abort();
  }, [owner]);
  return useCallback(
    async <T>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
      if (
        !/^professional_[a-z_]+$/.test(name) &&
        ![
          "list_my_workspaces",
          "list_franky_card_offers",
          "card_quote_professional_booking",
        ].includes(name)
      )
        throw Error("professional_forbidden");
      const signal = controller.current.signal;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (signal.aborted || session?.user.id !== owner)
        throw Error("auth_required");
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${name}`,
        {
          method: "POST",
          headers: {
            apikey: clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(args),
          signal,
          cache: "no-store",
        },
      );
      const data = await response.json();
      const current = await supabase.auth.getSession();
      if (signal.aborted || current.data.session?.user.id !== owner)
        throw Error("auth_required");
      if (!response.ok) throw Error(data.message ?? "professional_unavailable");
      return data as T;
    },
    [owner, supabase],
  );
}
