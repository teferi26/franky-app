import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import SignClient, { type ContractView, type SignerView } from "./sign-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contrato de alquiler",
  description: "Revisa y firma tu contrato de alquiler.",
  robots: { index: false, follow: false },
};

export default async function ContratoSignerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/contratos/${id}`);

  // RLS deja leer al propietario y a los firmantes; cualquier otro recibe null.
  const { data: contract } = await supabase
    .from("contracts")
    .select(
      "id, owner_id, accommodation_id, title, status, rent_cents, deposit_cents, content_sha256, locked_at, created_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (!contract) notFound();

  const { data: acc } = await supabase
    .from("accommodations")
    .select("title, city")
    .eq("id", contract.accommodation_id)
    .maybeSingle();

  const { data: signerRows } = await supabase
    .from("contract_signers")
    .select("id, user_id, role, sign_order, status, signed_at")
    .eq("contract_id", id)
    .order("sign_order", { ascending: true });

  const userIds = [...new Set((signerRows ?? []).map((s) => s.user_id as string))];
  const names = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const p of profiles ?? [])
      names.set(p.id as string, (p.full_name as string) ?? null);
  }

  const signers: SignerView[] = (signerRows ?? []).map((s) => ({
    id: s.id as string,
    role: s.role as "owner" | "tenant",
    status: s.status as "pending" | "signed",
    signed_at: s.signed_at as string | null,
    full_name: names.get(s.user_id as string) ?? null,
    is_me: s.user_id === user.id,
  }));

  const view: ContractView = {
    id: contract.id,
    title: contract.title,
    status: contract.status,
    rent_cents: contract.rent_cents,
    deposit_cents: contract.deposit_cents,
    content_sha256: contract.content_sha256,
    accommodation_title: acc?.title ?? "",
    accommodation_city: acc?.city ?? null,
    is_owner: contract.owner_id === user.id,
  };

  return <SignClient contract={view} signers={signers} />;
}
