"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useId,
  isValidElement,
  cloneElement,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-client";
export const cardInput =
  "mt-1 w-full rounded-xl border border-border bg-bg-primary p-3 text-sm";
export const cardButton =
  "rounded-xl bg-violet px-4 py-3 font-semibold text-white disabled:opacity-40";
export const cardPanel = "rounded-2xl border border-border bg-bg-primary p-5";
export function cardError(message: string): string {
  if (message === "card_price_changed" || message === "card_quote_changed")
    return "El precio de la tarjeta ha cambiado. Revisa el importe actualizado antes de confirmar de nuevo.";
  return (
    (
      {
        card_disabled:
          "La tarjeta se está preparando. Vuelve a consultar más adelante.",
        card_forbidden:
          "Tu acceso ha cambiado o esta operación pertenece a otro espacio.",
        card_invalid_input: "Revisa los datos introducidos.",
        card_offer_unavailable:
          "La oferta no está disponible para esta operación.",
        card_campaign_schedule:
          "Esta campaña no se aplica en la fecha y hora elegidas. Revisa sus horarios.",
        card_campaign_exhausted:
          "Se ha alcanzado el límite de usos o de presupuesto de esta campaña. Elige otra ventaja.",
        card_credential_invalid:
          "Este QR ha caducado o se ha revocado. Pide a la persona que abra uno nuevo.",
        card_membership_inactive:
          "La tarjeta de descuentos no está activa. La fidelización sigue disponible.",
        card_request_expired:
          "La solicitud ha caducado. Escanea de nuevo la tarjeta.",
        card_idempotency_conflict:
          "Este intento corresponde a otra operación. Revisa el historial antes de repetir.",
        card_profile_required:
          "Completa primero el nombre y la foto de tu tarjeta.",
        mfa_required:
          "Activa la verificación en dos pasos para realizar esta operación.",
        auth_required: "La cuenta ha cambiado. Vuelve a iniciar sesión.",
      } as Record<string, string>
    )[message] ??
    "No se pudo completar la operación. Revisa los datos y vuelve a intentarlo."
  );
}
export function CardSession({
  children,
}: {
  children: (userId: string) => ReactNode;
}) {
  const client = useMemo(() => createClient(), []);
  const [user, setUser] = useState<string | null>(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true,
      version = 0;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      version++;
      if (live) {
        setUser(session?.user.id ?? null);
        setReady(true);
      }
    });
    const initial = version;
    void client.auth.getUser().then(({ data }) => {
      if (live && version === initial) {
        setUser(data.user?.id ?? null);
        setReady(true);
      }
    });
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, [client]);
  if (!ready)
    return (
      <p className="p-8" role="status">
        Abriendo tu espacio…
      </p>
    );
  if (!user)
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-3xl font-bold">Tu Franky Card</h1>
        <p className="my-5">
          Inicia sesión para ver tus descuentos, sellos y recompensas.
        </p>
        <Link className={cardButton} href="/login?next=/franky-card">
          Iniciar sesión
        </Link>
      </main>
    );
  return <div key={user}>{children(user)}</div>;
}
export function useCardClient(userId: string) {
  const client = useMemo(() => createClient(), []),
    live = useRef(true),
    generation = useRef(0);
  useEffect(() => {
    live.current = true;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_e, s) => {
      if (s?.user.id !== userId) generation.current++;
    });
    return () => {
      live.current = false;
      generation.current++;
      subscription.unsubscribe();
    };
  }, [client, userId]);
  const check = useCallback(async () => {
    const g = generation.current;
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!live.current || session?.user.id !== userId)
      throw Error("auth_required");
    return { g, session };
  }, [client, userId]);
  const rpc = useCallback(
    async <T,>(
      name: string,
      args: Record<string, unknown> = {},
    ): Promise<T> => {
      const { g } = await check();
      const { data, error } = await client.rpc(name, args);
      if (!live.current || g !== generation.current)
        throw Error("auth_required");
      if (error) throw Error(error.message);
      return data as T;
    },
    [client, check],
  );
  const api = useCallback(
    async <T,>(route: string, body?: unknown): Promise<T> => {
      const { g, session } = await check();
      const response = await fetch("/api/card/" + route, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: "Bearer " + session.access_token,
          ...(body instanceof FormData
            ? {}
            : body !== undefined
              ? { "Content-Type": "application/json" }
              : {}),
        },
        body:
          body === undefined
            ? undefined
            : body instanceof FormData
              ? body
              : JSON.stringify(body),
        cache: "no-store",
      });
      const data = await response.json();
      if (!live.current || g !== generation.current)
        throw Error("auth_required");
      if (!response.ok) throw Error(data.error ?? "card_unavailable");
      return data as T;
    },
    [check],
  );
  return { rpc, api };
}
export function CardField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="block text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string }>, { id })
        : children}
    </div>
  );
}
