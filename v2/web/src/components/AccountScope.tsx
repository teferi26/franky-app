"use client";

import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { useSession } from "@/components/SessionProvider";
import { useSessionGuard } from "@/hooks/useSessionGuard";

const AccountOwner = createContext<string | null>(null);

/** Reset private UI on account changes, including when embedded in another page. */
function AccountScope({ children, silent = false }: { children: ReactNode; silent?: boolean }) {
  const { user, loading } = useSession();
  if (loading) return silent ? null : <p role="status" className="p-6 text-sm text-text-muted">Cargando tu sesión…</p>;
  if (!user) return silent ? null : <p className="p-6 text-sm text-text-muted"><Link href="/login" className="font-semibold text-violet">Inicia sesión</Link> para continuar.</p>;
  return <AccountOwner.Provider key={user.id} value={user.id}>{children}</AccountOwner.Provider>;
}

export function useAccountGuard() {
  const owner = useContext(AccountOwner);
  const isCurrent = useSessionGuard(owner);
  return { owner, isCurrent };
}

export function withAccountScope<P extends object>(Component: ComponentType<P>, options: { silent?: boolean } = {}) {
  function ScopedAccount(props: P) {
    return <AccountScope silent={options.silent}><Component {...props} /></AccountScope>;
  }
  ScopedAccount.displayName = `AccountScope(${Component.displayName || Component.name || "Component"})`;
  return ScopedAccount;
}
