import type { Metadata } from "next";
import { createServerSupabase } from "@/lib/supabase-server";
import FomoThreadClient from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FOMO",
  robots: { index: false, follow: false },
};

export default async function FomoThreadPage({
  params,
}: {
  params: Promise<{ slug: string; threadId: string }>;
}) {
  const { slug, threadId } = await params;
  const supabase = await createServerSupabase();
  const { data: uni } = await supabase
    .from("universities")
    .select("name")
    .eq("slug", slug)
    .single();
  return (
    <FomoThreadClient
      slug={slug}
      threadId={threadId}
      universityName={uni?.name ?? "tu universidad"}
    />
  );
}
