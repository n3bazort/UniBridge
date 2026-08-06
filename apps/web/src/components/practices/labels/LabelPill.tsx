'use client'

import React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { leerEstado, type PracticeLabel } from './types'

interface LabelPillProps {
  /** Etiqueta de seguimiento asignada; si no hay, se muestra el estado derivado */
  label?: PracticeLabel | null
  /** Estado que el sistema deriva de los documentos */
  status: string
  onClick?: (e: React.MouseEvent) => void
}

/**
 * Lo que se ve en la fila: la etiqueta que puso el coordinador, y si aún no
 * puso ninguna, el estado que el sistema deduce de los documentos.
 *
 * Conserva la forma que ya tenía la lista —punto de color y texto, sin recuadro—
 * porque el objetivo era poder cambiarla con un clic, no llenar la fila de
 * bloques de color. El galón solo aparece al pasar por encima, para no añadir
 * un elemento permanente más a una fila que ya tiene varios.
 */
export const LabelPill = React.forwardRef<HTMLButtonElement, LabelPillProps>(
  function LabelPill({ label, status, onClick, ...props }, ref) {
    const derivado = leerEstado(status)
    const color = label?.color ?? derivado.color
    const colorTexto = label?.color ?? derivado.colorTexto
    const texto = label?.name ?? derivado.texto

    return (
      <button
        ref={ref}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClick?.(e)
        }}
        title={
          label
            ? `Etiqueta: ${label.name} · el estado del sistema sigue siendo «${derivado.texto}»`
            : `Estado según los documentos: ${derivado.texto}`
        }
        className={cn(
          // `max-w-full` y `min-w-0` mantienen la píldora dentro de su columna:
          // sin ellos el botón crece con el texto y se desborda sobre la fila.
          'group/pill flex items-center gap-2 h-7 max-w-full min-w-0 pl-1.5 pr-1 -ml-1.5 rounded-lg',
          'transition-colors hover:bg-slate-100 cursor-pointer text-left',
        )}
        {...props}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        {/* `min-w-0` es lo que permite que `truncate` recorte dentro de un flex;
            el nombre completo queda en el `title` del botón. */}
        <span className="flex-1 min-w-0 text-[12px] font-medium truncate" style={{ color: colorTexto }}>
          {texto}
        </span>
        <ChevronDown className="w-3 h-3 shrink-0 text-slate-400 opacity-0 group-hover/pill:opacity-100 transition-opacity" />
      </button>
    )
  },
)
