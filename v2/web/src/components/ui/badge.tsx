import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Insignia (v3): tintes muy suaves con texto oscuro del mismo tono. La
// variante `outline` es la neutra por defecto en listados densos.
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium leading-5 transition-colors",
  {
    variants: {
      variant: {
        default: "bg-violet-50 text-violet-deep",
        secondary: "bg-bg-secondary text-text-secondary",
        success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
        warning: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
        destructive: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
        outline: "border border-border text-text-secondary",
        fuchsia: "bg-fuchsia/10 text-fuchsia",
        orange: "bg-orange/10 text-orange-dark",
        dark: "bg-text-primary text-bg-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
