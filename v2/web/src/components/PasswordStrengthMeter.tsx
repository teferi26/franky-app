"use client";

import { useMemo } from "react";
import { passwordStrength } from "@/lib/password-strength";
import { cn } from "@/lib/utils";

/**
 * Visual password strength meter — pure UI, never gates submission.
 * The real gate is the zod `passwordSchema` validation on submit.
 */
export default function PasswordStrengthMeter({ password }: { password: string }) {
  const { level, score } = useMemo(() => passwordStrength(password), [password]);

  if (!password) return null;

  const segments = 4;
  const filled = Math.min(segments, Math.max(0, Math.round((score / 6) * segments)));

  const colors: Record<typeof level, string> = {
    weak: "bg-error",
    fair: "bg-warning",
    good: "bg-success",
    strong: "bg-success",
  };
  const labels: Record<typeof level, string> = {
    weak: "Débil",
    fair: "Media",
    good: "Buena",
    strong: "Fuerte",
  };

  return (
    <div className="mt-2 flex items-center gap-2" aria-live="polite">
      <div className="flex gap-1 flex-1">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300 ease-[var(--ease-out-quart)]",
              i < filled ? colors[level] : "bg-bg-tertiary"
            )}
          />
        ))}
      </div>
      <span className={cn("text-xs font-medium tabular", {
        "text-error": level === "weak",
        "text-warning": level === "fair",
        "text-success": level === "good" || level === "strong",
      })}>
        <span className="sr-only">Seguridad de la contraseña: </span>
        {labels[level]}
      </span>
    </div>
  );
}
