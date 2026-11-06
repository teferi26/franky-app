import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Botón del sistema (v3). ÚNICA fuente de estilos de botón.
//
//   default     -> primario: violeta SÓLIDO (sin degradado), brillo superior
//                  sutil, sombra que crece al pasar el ratón y subida de 1 px.
//   dark        -> primario neutro: casi negro. Es el "botón de producto" de
//                  las páginas editoriales (hero, CTA final).
//   secondary   -> tintado violeta suave.
//   outline     -> borde hairline, para la acción de apoyo.
//   ghost       -> sin fondo hasta el hover.
//   destructive -> peligro.
//   glass       -> sobre superficies oscuras o fotos.
//   onBrand     -> acción principal DENTRO de un bloque violeta.
//   gradient/pill/orange -> alias conservados por compatibilidad; pintan
//                  igual que `default` (pill con radio completo).
//
// Foco siempre visible, activo encoge un 2 %, y `loading` bloquea y muestra
// spinner.
const buttonVariants = cva(
  [
    "group/btn relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold",
    "transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-200 ease-[var(--ease-out-quart)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
    "disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
    "active:scale-[0.98] motion-reduce:active:scale-100 motion-reduce:hover:translate-y-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "gradient-bg text-white shadow-[0_1px_2px_rgba(18,16,25,0.12),inset_0_1px_0_rgba(255,255,255,0.18)] hover:shadow-glow hover:-translate-y-px",
        dark:
          "bg-text-primary text-bg-primary shadow-[0_1px_2px_rgba(18,16,25,0.16)] hover:shadow-card-hover hover:-translate-y-px",
        secondary: "bg-violet-50 text-violet-deep hover:bg-violet-100",
        outline:
          "border border-border bg-bg-primary text-text-primary hover:border-text-primary/30 hover:bg-bg-secondary",
        ghost: "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
        destructive: "bg-error text-white hover:bg-red-700 focus-visible:ring-error",
        gradient:
          "gradient-bg text-white shadow-[0_1px_2px_rgba(18,16,25,0.12),inset_0_1px_0_rgba(255,255,255,0.18)] hover:shadow-glow hover:-translate-y-px",
        pill:
          "rounded-full gradient-bg text-white shadow-[0_1px_2px_rgba(18,16,25,0.12)] hover:shadow-glow hover:-translate-y-px",
        orange: "bg-orange text-[#0d0c14] hover:bg-orange-dark",
        glass:
          "bg-white/10 text-white border border-white/20 backdrop-blur-md hover:bg-white/20 hover:border-white/30",
        onBrand: "bg-bg-primary text-violet-deep shadow-card hover:shadow-card-hover hover:-translate-y-px",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3 text-xs rounded-lg",
        lg: "h-12 px-7 text-[15px] rounded-xl",
        xl: "h-14 px-9 text-base rounded-2xl",
        icon: "h-10 w-10 rounded-xl",
        "icon-sm": "h-8 w-8 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Mientras es true el botón se deshabilita y enseña un spinner delante del
   *  texto. Evita el doble envío y el "¿ha hecho algo?" de los formularios. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
