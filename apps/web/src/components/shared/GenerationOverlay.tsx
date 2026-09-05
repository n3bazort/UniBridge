'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Pasos reales del backend al emitir un oficio, en el orden en que ocurren.
 *
 * No son frases de relleno: cada una corresponde a algo que el servidor está
 * haciendo de verdad (ver `generateOficioGrouped` y `DocumentEngineService`).
 * Mostrar el paso real en vez de un porcentaje inventado es lo honesto —
 * y de paso el usuario entiende por qué tarda: convertir a PDF abre
 * LibreOffice, que es el tramo lento (~7 s medidos).
 */
const PASOS_PDF = [
  { texto: 'Buscando la plantilla oficial…', ms: 900 },
  { texto: 'Rellenando los datos de los estudiantes…', ms: 1100 },
  { texto: 'Asignando el número de oficio…', ms: 800 },
  { texto: 'Convirtiendo a PDF…', ms: 5200 },
  { texto: 'Guardando en el repositorio…', ms: 1200 },
] as const

const PASOS_DOCX = [
  { texto: 'Buscando la plantilla oficial…', ms: 700 },
  { texto: 'Rellenando los datos de los estudiantes…', ms: 900 },
  { texto: 'Asignando el número de oficio…', ms: 700 },
  { texto: 'Guardando en el repositorio…', ms: 900 },
] as const

interface GenerationOverlayProps {
  isOpen: boolean
  /** Título de la operación, ej. "Generando solicitud" */
  title: string
  /** Convertir a PDF es el tramo lento: cambia los pasos y los tiempos. */
  asPdf?: boolean
  /** Texto secundario, ej. "ALTURA S.A. · 5 estudiantes" */
  subtitle?: string
}

/**
 * Aviso de progreso en la esquina inferior derecha — NO bloquea la pantalla.
 *
 * Empezó siendo un modal a pantalla completa con fondo difuminado, y era
 * demasiado intrusivo para una espera de ~8 s: tapaba la lista que el usuario
 * estaba mirando. Ahora usa el mismo sitio y forma que el aviso de generación
 * de certificados (`fixed bottom-6 right-6`), así los dos avisos de progreso
 * de la app se comportan igual.
 */
export function GenerationOverlay({ isOpen, title, asPdf, subtitle }: GenerationOverlayProps) {
  const pasos = asPdf ? PASOS_PDF : PASOS_DOCX
  const [indice, setIndice] = useState(0)

  // Avanza por los pasos con el tiempo que dura cada uno. Se queda en el
  // último si el servidor tarda más de lo previsto: nunca "termina" solo,
  // porque quien decide que terminó es la respuesta del servidor.
  useEffect(() => {
    if (!isOpen) { setIndice(0); return }
    if (indice >= pasos.length - 1) return
    const t = setTimeout(() => setIndice((i) => i + 1), pasos[indice].ms)
    return () => clearTimeout(t)
  }, [isOpen, indice, pasos])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          className="fixed bottom-6 right-6 z-[200] bg-white rounded-xl shadow-xl border border-slate-100 p-3.5"
        >
          <div className="flex items-start gap-3 w-[260px]">
            {/* Documento con halo latiendo: señal de "trabajando" sin spinner genérico */}
            <div className="relative flex items-center justify-center w-9 h-9 shrink-0">
              <motion.span
                className="absolute inset-0 rounded-full bg-primary/10"
                animate={{ scale: [1, 1.15, 1], opacity: [0.7, 0.3, 0.7] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
              <FileText className="w-4 h-4 text-primary relative" strokeWidth={2} />
            </div>

            <div className="flex flex-col min-w-0 gap-1 flex-1">
              <span className="text-[12px] font-bold text-foreground leading-tight truncate">{title}</span>
              {subtitle && (
                <span className="text-[10.5px] text-muted-foreground leading-tight truncate">{subtitle}</span>
              )}

              {/* Barra por pasos: no es un porcentaje inventado, es "vas en el paso N de M" */}
              <div className="flex gap-1 mt-0.5" aria-hidden>
                {pasos.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors duration-300',
                      i < indice ? 'bg-primary' : i === indice ? 'bg-primary/40' : 'bg-muted',
                    )}
                  />
                ))}
              </div>

              {/* Solo el paso actual: en 260px no cabe la lista completa */}
              <AnimatePresence mode="wait">
                <motion.span
                  key={pasos[indice].texto}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: 0.18 }}
                  className="text-[10.5px] text-muted-foreground leading-snug mt-0.5"
                >
                  {pasos[indice].texto}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
