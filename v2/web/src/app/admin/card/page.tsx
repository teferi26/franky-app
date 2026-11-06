import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { decodeAal } from "@/lib/aal";
import CardAdmin from "@/components/card/card-admin";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Administración · Franky Card",
  robots: { index: false, follow: false },
};
export default async function Page() {
  const client = await createServerSupabase();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login?next=/admin/card");
  const {
    data: { session },
  } = await client.auth.getSession();
  if (
    session?.user.id !== user.id ||
    decodeAal(session.access_token) !== "aal2"
  )
    redirect("/perfil/seguridad?mfa=required&next=/admin/card");
  const { data, error } = await client
    .from("profiles")
    .select("role,is_discarded")
    .eq("id", user.id)
    .single();
  if (error || data?.role !== "admin" || data.is_discarded) redirect("/");
  return <CardAdmin />;
}
