"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-client";
export default function CardEntry({ userId }: { userId: string }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let live = true;
    setEnabled(false);
    const client = createClient();
    void client.auth.getUser().then(async ({ data }) => {
      if (data.user?.id !== userId) return;
      const result = await client.rpc("get_franky_card_readiness");
      if (live && !result.error) setEnabled(result.data?.enabled === true);
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_e, s) => {
      if (s?.user.id !== userId) setEnabled(false);
    });
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, [userId]);
  if (!enabled) return null;
  return (
    <Link
      href="/franky-card"
      className="my-4 block rounded-2xl bg-[#21143e] p-6 text-white"
    >
      <strong className="text-xl">franky card →</strong>
      <p className="mt-2 text-sm text-white/75">
        Tus descuentos, sellos y premios en un solo sitio.
      </p>
    </Link>
  );
}
