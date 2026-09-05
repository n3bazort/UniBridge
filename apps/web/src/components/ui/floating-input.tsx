'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Campo de texto con ETIQUETA FLOTANTE.
 *
 * El nombre del campo empieza dentro, ocupando el sitio del texto, y sube a
 * posarse sobre el borde en cuanto el campo recibe el foco o tiene contenido.
 * El hueco que abre en el borde al subir se llama «muesca» (notch).
 *
 * Por qué, y no una etiqueta fija encima: la etiqueta encima ocupa una línea
 * por campo y aleja el nombre del dato. La flotante empieza pegada al sitio
 * donde se va a escribir —que es donde está mirando el usuario— y no
 * desaparece al escribir, como sí hace un placeholder suelto: quien vuelve a
 * un formulario a medias sigue sabiendo qué pedía cada casilla.
 *
 * Está hecho SOLO con CSS, sin estado de React. La clave es `placeholder=" "`:
 * un espacio hace que `:placeholder-shown` sea cierto mientras el campo esté
 * vacío, y de ahí cuelga toda la animación. Sin estado no hay re-render por
 * cada tecla, y funciona igual si el valor lo rellena el navegador.
 *
 * El `placeholder` real (un ejemplo de formato: «1312345678») aparece solo con
 * el foco, cuando la etiqueta ya ha subido y hay sitio para él.
 */
const FloatingInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'placeholder'> & {
    /** El nombre del campo. Es la etiqueta que flota. */
    label: string
    /** Ejemplo de formato; se muestra solo mientras se escribe. */
    hint?: string
    /** Icono a la izquierda; el hueco se calcula solo. */
    icon?: React.ReactNode
    /** Mensaje de error bajo el campo. */
    error?: string
    containerClassName?: string
  }
>(({ id, label, hint, icon, error, className, containerClassName, required, ...props }, ref) => {
  const generado = React.useId()
  const campoId = id ?? generado

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      <div className="relative">
        {icon && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-muted-foreground"
          >
            {icon}
          </span>
        )}

        <input
          id={campoId}
          ref={ref}
          required={required}
          // Un espacio, no vacío: es lo que hace funcionar `:placeholder-shown`.
          placeholder={hint ?? ' '}
          aria-invalid={!!error || undefined}
          className={cn(
            // Texto centrado: la etiqueta ya no vive dentro cuando flota, se
            // posa sobre el borde, así que no hay que reservarle sitio arriba.
            'peer h-12 w-full rounded-md border bg-card text-sm text-foreground transition-colors',
            icon ? 'pl-9 pr-3' : 'px-3',
            // El ejemplo de formato solo se ve cuando el campo tiene el foco:
            // en reposo su sitio lo ocupa la etiqueta.
            'placeholder:text-transparent focus:placeholder:text-muted-foreground/60',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            error ? 'border-destructive focus-visible:ring-destructive' : 'border-input focus-visible:border-ring',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
            className,
          )}
          {...props}
        />

        <label
          htmlFor={campoId}
          className={cn(
            // Siempre centrada verticalmente sobre su propia `top`: en reposo
            // esa `top` es la mitad del campo; al flotar es 0, y entonces queda
            // partida por el borde — que es lo que abre la muesca.
            'pointer-events-none absolute top-1/2 -translate-y-1/2 origin-left truncate',
            'rounded px-1 text-sm text-muted-foreground',
            // Se anima lo que de verdad cambia: la posición y el tamaño. Tailwind v4
            // usa la propiedad `scale`, no `transform`, así que declarar `transform`
            // aquí dejaba el salto sin animar.
            'transition-[top,left,scale,color] duration-150 ease-out motion-reduce:transition-none',
            icon ? 'left-[1.9rem]' : 'left-2',
            // Al flotar sube al borde, encoge y se lleva un fondo del color del
            // campo: ese fondo es lo que TAPA la línea del borde y deja el hueco.
            // Sin él la etiqueta se leería cruzada por una raya.
            'peer-focus:top-0 peer-focus:scale-[0.8] peer-focus:bg-card',
            'peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:scale-[0.8] peer-[:not(:placeholder-shown)]:bg-card',
            // Al subir se alinea con el texto del campo, no con el icono: el
            // icono se queda abajo y la etiqueta ya no tiene que esquivarlo.
            icon && 'peer-focus:left-2 peer-[:not(:placeholder-shown)]:left-2',
            'peer-focus:text-foreground',
            error && 'text-destructive peer-focus:text-destructive',
          )}
        >
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </label>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
})
FloatingInput.displayName = 'FloatingInput'

export { FloatingInput }
