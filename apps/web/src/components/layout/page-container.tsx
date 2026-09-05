import { cn } from "@/lib/utils"

/**
 * Contenedor único para el contenido de cada pantalla del dashboard.
 *
 * Antes cada página escribía su propio wrapper a mano: algunas topaban el
 * ancho en 1600px, otras no topaban nada (el contenido se estiraba sin
 * límite en monitores anchos); el padding lateral iba de 16px a 40px según
 * el archivo. Se creó este componente para unificarlo — y aun así cinco
 * páginas lo anulaban en la misma línea en que lo usaban, con `max-w-6xl`,
 * `max-w-[1200px]` y `max-w-[1400px]`. Con cinco anchos distintos, navegar
 * de Certificados a Prácticas desplazaba la columna 200px y el ojo tenía
 * que reencontrar la primera línea en cada cambio de pantalla.
 *
 * Ahora el ancho es una decisión declarada, no un `className` suelto:
 *
 * - `wide` — listas, cuadrículas y pantallas con panel lateral, donde el
 *   espacio horizontal se aprovecha de verdad (Prácticas, Certificados,
 *   Estudiantes, Empresas, Resumen, Firma de documentos).
 * - `reading` — formularios, flujos por pasos y configuración, donde una
 *   columna de 1600px solo produce líneas ilegibles y controles perdidos a
 *   media pantalla (Actas de culminación, Importación, Documentos,
 *   Usuarios, Configuraciones).
 *
 * La altura ya no se calcula: `<main>` es una columna flex y las pantallas
 * que necesitan llenarla usan `flex-1`. Eso sustituye a los
 * `min-h-[calc(100vh-72px)]` copiados a mano en once archivos, que además
 * restaban mal — el topbar mide 56px, no 72, y de ahí la franja del color
 * equivocado al pie de las pantallas con poco contenido.
 *
 * No pases `max-w-*` en `className`: si una pantalla necesita otro ancho,
 * la respuesta es una variante nueva aquí, no una excepción allá.
 */
const ANCHOS = {
  wide: "max-w-[1600px]",
  reading: "max-w-[1100px]",
} as const

export function PageContainer({
  variant = "wide",
  className,
  children,
}: {
  variant?: keyof typeof ANCHOS
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "w-full mx-auto px-6 sm:px-8 lg:px-12 py-8",
        ANCHOS[variant],
        className,
      )}
    >
      {children}
    </div>
  )
}
