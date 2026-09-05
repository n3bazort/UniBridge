import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Contenedor "tarjeta" único del sistema. Antes cada página repetía a mano
 * `bg-white rounded-[Npx] border ... shadow-sm` con un radio/sombra
 * ligeramente distinto cada vez.
 *
 * La elevación se declara UNA sola vez, nunca border + shadow a la vez:
 * - `variant="flat"` (por defecto): borde de 1px, sin sombra. Para tarjetas
 *   que conviven una junto a otra en una lista o grilla.
 * - `variant="elevated"`: sombra suave, sin borde. Para lo que "flota" sobre
 *   el contenido (paneles de detalle, tarjetas destacadas).
 */
function Card({
  className,
  variant = "flat",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "flat" | "elevated" }) {
  return (
    <div
      className={cn(
        "rounded-md bg-card text-card-foreground",
        variant === "flat" && "border border-border",
        variant === "elevated" && "shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />
  )
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-sm font-semibold leading-none tracking-tight text-foreground", className)} {...props} />
  )
}

function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />
}

function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center p-5 pt-3", className)} {...props} />
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
