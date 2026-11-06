import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

// Área de texto (v3): mismo trazo, mismo foco y mismo estado de error
// (`aria-invalid`) que ui/input.tsx, con altura mínima de tres líneas.
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-[96px] w-full resize-none rounded-xl border border-border bg-bg-primary px-3.5 py-2.5 text-[15px] leading-relaxed text-text-primary placeholder:text-text-muted",
        "transition-[border-color,box-shadow,background-color] duration-200 ease-[var(--ease-out-quart)]",
        "hover:border-text-primary/20",
        "focus:outline-none focus:border-violet focus:ring-[3px] focus:ring-violet/15",
        "aria-[invalid=true]:border-error aria-[invalid=true]:focus:ring-error/15 aria-[invalid=true]:focus:border-error",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export { Textarea };
