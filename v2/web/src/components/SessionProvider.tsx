"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase-client";
import type { User } from "@supabase/supabase-js";

/**
 * Sesión y perfil compartidos para toda la app.
 *
 * Antes cada pieza resolvía la sesión por su cuenta: Navbar, LazyChrome y
 * AuthGatePopup llamaban los tres a `getUser()` en cada carga, y el Navbar
 * además hacía su propia consulta a `profiles` para el rol. Cuatro viajes a
 * Supabase para responder a la misma pregunta.
 *
 * Aquí se resuelve UNA vez y se reparte por contexto. El rol se pide solo
 * cuando hay usuario y se cachea en memoria mientras dure la sesión.
 */
type SessionValue = {
  user: User | null;
  role: string | null;
  /**
   * true mientras no se sepa todavía si hay sesión NI de qué tipo de cuenta.
   *
   * Cubre las dos consultas a propósito (sesión + rol): quien solo esperaba a
   * la sesión pintaba el menú de estudiante a un propietario durante el hueco
   * entre una y otra, y luego se lo cambiaba de golpe. Con esto, quien pinta
   * navegación puede enseñar un estado neutro hasta saber la respuesta buena.
   */
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
};

const SessionContext = createContext<SessionValue>({
  user: null,
  role: null,
  loading: true,
  signOut: async () => {},
  refreshRole: async () => {},
});

/**
 * `initialUser` / `initialRole` los siembra el layout desde el SERVIDOR.
 *
 * Sin semilla, `loading` nacía en true y la navegación se pintaba como
 * esqueleto en el HTML inicial: el menú y el mapa del sitio del pie
 * desaparecían del HTML que ve Googlebot sin ejecutar JavaScript, que para un
 * producto que vive del tráfico orgánico es un disparo en el pie. Con la
 * semilla, el servidor ya manda la navegación buena y no hay ni parpadeo ni
 * pérdida de enlaces.
 */
export function SessionProvider({
  children,
  initialUser = null,
  initialRole = null,
  seeded = false,
}: {
  children: ReactNode;
  initialUser?: User | null;
  initialRole?: string | null;
  seeded?: boolean;
}) {
  const identity = useRef(initialUser?.id ?? null);
  const [user, setUser] = useState<User | null>(initialUser);
  const [role, setRole] = useState<string | null>(initialRole);
  // `seeded` distingue "el servidor dice que NO hay sesión" de "todavía no se
  // sabe". Sin ese matiz, un visitante anónimo se quedaba en el esqueleto para
  // siempre, que es justo el caso que más importa para el SEO.
  const [authLoading, setAuthLoading] = useState(!seeded);
  // De QUÉ usuario es el `role` que hay guardado. Un simple booleano
  // "ya cargó" no vale: entre que `getUser()` devuelve el usuario y que el
  // efecto del rol se ejecuta (los efectos corren DESPUÉS de pintar) habría
  // un fotograma con sesión y rol null, es decir, el parpadeo que se quiere
  // quitar. Comparando contra el id, el estado se deriva en el render mismo.
  const [roleUserId, setRoleUserId] = useState<string | null>(initialUser?.id ?? null);

  useEffect(() => {
    // createClient dentro del efecto: así no se instancia durante el prerender.
    const supabase = createClient();
    let mounted = true;
    let revision = 0;

    // Si a la cuenta le falta la fila de profiles, todo falla EN SILENCIO: no
    // hay nombre ni foto, y guardar el perfil hace UPDATE sobre cero filas, que
    // supabase-js no considera un error. Le pasó a 44 cuentas reales. La RPC no
    // escribe nada si el perfil ya existe, así que sale barata en cada carga.
    const asegurarPerfil = () => {
      supabase.rpc("ensure_my_profile").then(
        () => {},
        () => {} // best-effort: si falla, la app se comporta como antes
      );
    };

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted || revision !== 0) return;
      identity.current = data.user?.id ?? null;
      setUser(data.user ?? null);
      setAuthLoading(false);
      if (data.user) asegurarPerfil();
    }).catch(() => { if (mounted && revision === 0) setAuthLoading(false); });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      revision += 1;
      identity.current = session?.user.id ?? null;
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        asegurarPerfil();
      }
    });

    return () => {
      mounted = false;
      identity.current = null;
      subscription.unsubscribe();
    };
  }, []);

  // El rol solo se consulta cuando hay usuario, y una sola vez por sesión.
  useEffect(() => {
    if (!user) {
      setRole(null);
      setRoleUserId(null);
      return;
    }
    const uid = user.id;
    let mounted = true;
    createClient()
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
      .then(
        ({ data }) => {
          if (!mounted || identity.current !== uid) return;
          setRole(data?.role ?? null);
          setRoleUserId(uid);
        },
        () => {
          // Si la consulta falla (red caída), NO dejamos la navegación
          // colgada en su estado neutro para siempre: se sigue como
          // "sin rol", que es el caso mayoritario.
          if (!mounted || identity.current !== uid) return;
          setRole(null);
          setRoleUserId(uid);
        }
      );
    return () => {
      mounted = false;
    };
  }, [user]);

  const refreshRole = useCallback(async () => {
    if (!user) return;
    const { data } = await createClient()
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (identity.current !== user.id) return;
    setRole(data?.role ?? null);
    setRoleUserId(user.id);
  }, [user]);

  const signOut = useCallback(async () => {
    await createClient().auth.signOut();
    window.location.href = "/";
  }, []);

  // `loading` = todavía no sabemos QUÉ menú toca pintar. Mientras haya usuario
  // sin rol resuelto seguimos cargando, aunque la sesión ya esté decidida.
  const loading = authLoading || (!!user && roleUserId !== user.id);

  const value = useMemo(
    () => ({ user, role, loading, signOut, refreshRole }),
    [user, role, loading, signOut, refreshRole]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Sesión compartida. Devuelve `loading: true` hasta que se resuelve. */
export function useSession(): SessionValue {
  return useContext(SessionContext);
}
