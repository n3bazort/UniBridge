'use client'

import { cn } from '@/lib/utils'

/**
 * El recorrido de un expediente, dibujado.
 *
 * No es un adorno de archivo de imágenes: es el circuito real del sistema
 * —solicitud, designación, acta, certificado y las dos firmas— sobre el puente
 * de la marca. Sirve de ilustración y de explicación a la vez, que es lo único
 * que justifica ocupar sitio en un panel de control.
 *
 * Se dibuja en SVG con los tokens del tema, así que funciona en claro y en
 * oscuro sin dos versiones del mismo archivo.
 */
export function RecorridoExpediente({ className }: { className?: string }) {
  const hitos = [
    { x: 60, etiqueta: 'Solicitud' },
    { x: 160, etiqueta: 'Designación' },
    { x: 260, etiqueta: 'Acta' },
    { x: 360, etiqueta: 'Certificado' },
  ]

  return (
    <svg
      viewBox="0 0 420 150"
      className={cn('w-full', className)}
      role="img"
      aria-label="Recorrido del expediente: solicitud, designación, acta del docente y certificado, que se emite con dos firmas."
    >
      {/* El cable del puente pasando por encima de todo el recorrido */}
      <path
        d="M12 46 Q 210 4 408 46"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-primary/25"
      />
      {/* Las dos torres */}
      <path d="M12 46V104M408 46V104" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-primary/35" />

      {/* Los tirantes: cada uno cae sobre un hito */}
      {hitos.map(({ x }, i) => {
        const t = (x - 12) / 396
        const y = 46 - 42 * Math.sin(Math.PI * t)
        return (
          <line
            key={x}
            x1={x} y1={y} x2={x} y2={82}
            stroke="currentColor"
            strokeWidth="1"
            className="text-primary/20"
          />
        )
      })}

      {/* El tablero: el camino que recorre el expediente */}
      <line x1="12" y1="90" x2="408" y2="90" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-border" />
      {/* Tramo recorrido: hasta el acta, que es lo que habilita el certificado */}
      <line x1="12" y1="90" x2="260" y2="90" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-primary" />

      {/* Los cuatro hitos */}
      {hitos.map(({ x, etiqueta }, i) => {
        const cumplido = i < 3
        return (
          <g key={etiqueta}>
            <circle
              cx={x} cy="90" r={i === 3 ? 7 : 5.5}
              className={cumplido ? 'fill-primary' : 'fill-card'}
              stroke="currentColor"
              strokeWidth="2"
              style={{ color: 'var(--color-primary)' }}
            />
            {i === 3 && (
              <circle cx={x} cy="90" r="2.5" className="fill-primary" />
            )}
            <text
              x={x} y="112"
              textAnchor="middle"
              className="fill-current text-[9px] font-medium"
              style={{ fill: 'var(--color-muted-foreground)' }}
            >
              {etiqueta}
            </text>
          </g>
        )
      })}

      {/* Las dos firmas, al final del recorrido */}
      <g transform="translate(360, 128)">
        <text
          textAnchor="middle"
          className="text-[8px]"
          style={{ fill: 'var(--color-muted-foreground)' }}
        >
          Responsable + Decano
        </text>
      </g>
    </svg>
  )
}
