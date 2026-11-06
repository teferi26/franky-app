"use client";

import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function EmptyDataState({
  title = "Sin datos",
  hint,
  onRetry,
}: {
  title?: string;
  hint?: string;
  onRetry?: () => void;
}) {
  return (
    <div role={onRetry ? 'alert' : undefined} className="rounded-xl border border-border bg-bg-secondary/40 px-6 py-10 text-center">
      <Inbox className="mx-auto mb-3 h-5 w-5 text-text-muted" strokeWidth={1.75} />
      <p className="text-sm font-medium text-text-primary">{title}</p>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
      {onRetry && <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>Reintentar</Button>}
    </div>
  );
}
