import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Píldora de estado única para todo el sistema. Antes existían 4
 * implementaciones independientes (certificates, EntityList, users) cada
 * una con su propio mapeo string→clase. Esta es la única fuente.
 *
 * Regla de uso: `success/warning/danger/info` se reservan para lo que exige
 * atención del usuario (vigente, pendiente, rechazado, informativo). Todo lo
 * que es simplemente una categoría sin urgencia (un rol, un tipo de
 * documento) usa `neutral`.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        success: "border-transparent bg-success/10 text-success",
        warning: "border-transparent bg-warning/10 text-warning",
        danger: "border-transparent bg-destructive/10 text-destructive",
        info: "border-transparent bg-info/10 text-info",
        neutral: "border-transparent bg-muted text-muted-foreground",
        outline: "border-border text-foreground bg-transparent",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Punto de color sólido antes del texto (opcional), para reforzar el estado sin depender solo del fondo. */
  dot?: boolean
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            variant === "success" && "bg-success",
            variant === "warning" && "bg-warning",
            variant === "danger" && "bg-destructive",
            variant === "info" && "bg-info",
            (variant === "neutral" || variant === "outline" || !variant) && "bg-muted-foreground"
          )}
        />
      )}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
