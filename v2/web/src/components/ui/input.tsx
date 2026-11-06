import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

// Campo de texto (v3): fondo de superficie, borde hairline y, al enfocar, el
// borde pasa a violeta con un anillo suave de 3 px. Estado de error por
// `aria-invalid`. Ver ui/field.tsx para etiqueta, ayuda y error inline.
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-xl border border-border bg-bg-primary px-3.5 py-2 text-[15px] text-text-primary placeholder:text-text-muted",
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
Input.displayName = "Input";

export { Input };
