"use client";

import Link from "next/link";
import { Flame, Heart } from "lucide-react";

export type CampusMode = "fomo" | "crush";

/** The same two destinations on the home, campus board and Crush. */
export default function CampusSwitch({ mode, fomoHref = "/fomo", onChange }: {
  mode: CampusMode;
  fomoHref?: string;
  onChange?: (mode: CampusMode) => void;
}) {
  return (
    <nav aria-label="FOMO y Crush" className="inline-flex gap-1 rounded-full bg-bg-secondary p-1">
      {([
        { id: "fomo", label: "FOMO", detail: "La vida del campus", href: fomoHref, Icon: Flame },
        { id: "crush", label: "Crush", detail: "Conecta con alguien", href: "/crush", Icon: Heart },
      ] as const).map(({ id, label, detail, href, Icon }) => {
        const active = mode === id;
        const className = `flex min-h-10 items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet ${active ? "bg-bg-primary text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary"}`;
        const content = <><Icon className={`h-4 w-4 shrink-0 text-violet`} aria-hidden="true" /><span title={detail}>{label}</span></>;
        return onChange ? <button key={id} type="button" aria-pressed={active} onClick={() => onChange(id)} className={className}>{content}</button> : <Link key={id} href={href} aria-current={active ? "page" : undefined} className={className}>{content}</Link>;
      })}
    </nav>
  );
}
