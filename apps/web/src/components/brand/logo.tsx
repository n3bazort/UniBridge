import { cn } from '@/lib/utils'

/**
 * La marca de UniBridge: un puente colgante.
 *
 * Vivía escrita a mano dentro de `sidebar.tsx` y en ningún sitio más, así que
 * la pantalla de acceso —la primera que ve cualquiera— no tenía logo. Aquí es
 * un componente para que la marca sea una sola en toda la app: si cambia el
 * dibujo, cambia en todas partes.
 *
 * No es un archivo `.svg` a propósito: al ser un componente hereda `currentColor`
 * y se adapta al fondo donde se ponga, sin necesitar una versión clara y otra
 * oscura del mismo dibujo.
 */
export function LogoMarca({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Las dos torres */}
      <path d="M3 20V6m18 14V6" />
      {/* El cable principal, colgando entre ellas */}
      <path d="M2 13Q3.5 8 4 6Q12 16 20 6Q20.5 8 22 13" strokeWidth="1.6" />
      {/* El tablero */}
      <path d="M2 17h20" />
      {/* Los tirantes verticales */}
      <path d="M8 11.5v5.5m8-5.5v5.5m-4 0v-3.5" strokeWidth="1.2" />
    </svg>
  )
}

/**
 * El logo en su recuadro de marca, tal como aparece en la barra lateral.
 * `size` gobierna el cuadrado; el dibujo va dentro con su proporción.
 */
export function LogoUniBridge({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const medidas = {
    sm: { caja: 'h-8 w-8 rounded-[10px]', marca: 'h-[18px] w-[18px]' },
    md: { caja: 'h-11 w-11 rounded-xl', marca: 'h-6 w-6' },
    lg: { caja: 'h-14 w-14 rounded-2xl', marca: 'h-8 w-8' },
  }[size]

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center bg-primary text-primary-foreground shadow-sm',
        medidas.caja,
        className,
      )}
    >
      <LogoMarca className={medidas.marca} />
    </div>
  )
}
