"use client";

import type { ReactNode } from "react";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { ToastProvider } from "@/components/ui/toast";
import { SessionProvider } from "@/components/SessionProvider";
import { SocialDemoProvider } from "@/components/SocialDemoNotice";

// Sin MotionConfig aquí: era el último import de framer-motion en el árbol
// raíz y mantenía el paquete entero dentro del chunk que hidrata TODAS las
// páginas. Cada pantalla que usa motion.* lleva ahora su propio
// <MotionConfig reducedMotion="user"> local.
export default function AppProviders({
  children,
  initialUser = null,
  initialRole = null,
  seeded = false,
}: {
  children: ReactNode;
  initialUser?: Record<string, unknown> | null;
  initialRole?: string | null;
  seeded?: boolean;
}) {
  return (
    /* SessionProvider va por fuera: Navbar, AuthGatePopup y LazyChrome
       resolvían la sesión cada uno por su cuenta (3 getUser por carga, más
       una consulta extra a profiles para el rol). Ahora se resuelve una vez. */
    <SessionProvider
      initialUser={initialUser as never}
      initialRole={initialRole}
      seeded={seeded}
    >
      <ToastProvider>
        <ConfirmProvider><SocialDemoProvider>{children}</SocialDemoProvider></ConfirmProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
