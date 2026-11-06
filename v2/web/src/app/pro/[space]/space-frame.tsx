"use client";

import { ProProvider } from "@/lib/pro/store";
import { ProShell, ProShellSkeleton } from "@/components/pro/shell";

export default function SpaceFrame({ spaceId, children }: { spaceId: string; children: React.ReactNode }) {
  return (
    <ProProvider spaceId={spaceId} fallback={<ProShellSkeleton />}>
      <ProShell>{children}</ProShell>
    </ProProvider>
  );
}
