'use client'

import { usePathname } from 'next/navigation'
import { pageTitle } from '@/lib/page-titles'
import { cn } from '@/lib/utils'

/**
 * Encabezado de pantalla. Único.
 *
 * Antes no había ninguna regla: unas páginas repetían literalmente el título
 * del topbar a 40px de distancia («Gestión de Usuarios» dos veces), otras lo
 * contradecían, y Prácticas e Importación no tenían `h1` en absoluto. Además
 * el mismo nivel jerárquico se escribía con cinco tamaños distintos —19px,
 * 20px, 24px, `text-2xl`— según el archivo que lo hubiera creado.
 *
 * Aquí hay un solo tamaño de título y un solo tamaño de descripción. El
 * nombre viene de `PAGE_TITLES` salvo que se pase uno explícito, de modo que
 * la pantalla y el topbar no pueden discrepar.
 *
 * `description` se topa a 65ch: un párrafo explicativo a 1600px de ancho no
 * se lee, se salta.
 */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
}: {
  /** Solo si la pantalla no está en PAGE_TITLES; normalmente se omite. */
  title?: string
  description?: React.ReactNode
  /** Botones alineados a la derecha del título. */
  actions?: React.ReactNode
  /** Línea menor bajo la descripción: período, conteos, contexto. */
  meta?: React.ReactNode
  className?: string
}) {
  const pathname = usePathname()
  const texto = title ?? pageTitle(pathname)

  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{texto}</h1>
        {description && (
          <p className="mt-1.5 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
        {meta && <div className="mt-2 text-xs text-muted-foreground">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
