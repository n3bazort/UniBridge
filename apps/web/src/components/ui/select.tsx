import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Desplegable del sistema.
 *
 * Envuelve al `<select>` nativo en vez de reimplementarlo: el nativo ya trae
 * gratis el foco, el recorrido con Tab, las flechas del teclado, la búsqueda
 * por letra y el selector a pantalla completa en móvil. Lo único que le falta
 * es aspecto — un `<select>` sin estilar hereda el chrome del sistema
 * operativo, que es de donde viene ese aire cuadrado y anticuado.
 *
 * Lo que hace esto: `appearance-none` para quitar la flecha del sistema, los
 * mismos tokens que el resto de controles (alto 40px, `rounded-md`,
 * `border-input`, anillo de foco `ring`), y una flecha propia dibujada encima.
 *
 * Se usa igual que un `<select>`, con `<option>` dentro.
 */
const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    /** Clases para el contenedor, cuando hace falta gobernar el ancho. */
    containerClassName?: string
    /**
     * Icono a la izquierda. Lo gestiona el componente para que el hueco y el
     * icono no puedan descuadrarse: quien lo colocaba por su cuenta tenía que
     * acordarse de subir el padding a mano, y en cuanto alguien tocaba las
     * clases el icono se montaba encima del texto.
     */
    icon?: React.ReactNode
  }
>(({ className, containerClassName, icon, children, ...props }, ref) => (
  <div className={cn('relative', containerClassName)}>
    {icon && (
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-muted-foreground"
      >
        {icon}
      </span>
    )}
    <select
      ref={ref}
      className={cn(
        'h-10 w-full appearance-none truncate rounded-md border border-input bg-card',
        'pr-9 text-sm text-foreground transition-colors',
        icon ? 'pl-9' : 'pl-3',
        'hover:border-border',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
    />
  </div>
))
Select.displayName = 'Select'

export { Select }
