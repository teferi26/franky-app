import Link from "next/link";
import { Home, Search, ArrowRight, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyIllustration } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

// No client boundary: server 404 pages can pass a Lucide component safely.
// v3: misma composición editorial que RouteError (eyebrow, titular grande,
// una frase, CTA oscuro y apoyo en contorno) sobre la retícula fina.
export function RouteNotFound({
  icon: Icon = Search,
  title = "No encontramos esta página",
  description = "Puede que el enlace esté mal o que ya no exista.",
  primary = { href: "/", label: "Volver al inicio" },
  secondary,
  className,
}: {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden px-6 py-16 text-center",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" aria-hidden="true" />
      <EmptyIllustration className="relative h-24 w-24 text-violet animate-scale-in">
        <Icon className="h-8 w-8" aria-hidden="true" />
      </EmptyIllustration>
      <p className="eyebrow relative mt-6 animate-slide-up [animation-delay:60ms]">Error 404</p>
      <h1 className="relative mt-3 text-fluid-h2 font-extrabold text-text-primary animate-slide-up [animation-delay:120ms]">{title}</h1>
      <p className="relative mt-3 max-w-md text-text-muted animate-slide-up [animation-delay:180ms]">{description}</p>
      <div className="relative mt-8 flex flex-col gap-3 sm:flex-row animate-slide-up [animation-delay:240ms]">
        <Link href={primary.href} className={cn(buttonVariants({ variant: "dark", size: "lg" }), "btn-shine group")}>
          <Home className="h-4 w-4" aria-hidden="true" />
          {primary.label}
          <ArrowRight className="h-4 w-4 arrow-nudge" aria-hidden="true" />
        </Link>
        {secondary && (
          <Link href={secondary.href} className={buttonVariants({ variant: "outline", size: "lg" })}>
            {secondary.label}
          </Link>
        )}
      </div>
    </div>
  );
}
