import { createServerSupabase } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import NotificationsClient from "./NotificationsClient";

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Notificaciones",
  description: "Tus notificaciones y alertas en Franky",
};

export default async function NotificacionesPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=%2Fnotificaciones");
  return <NotificationsClient />;
}
