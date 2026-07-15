'use client'

import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FloatingActionBarProps {
  /** Cantidad de elementos seleccionados. 0 = barra oculta */
  count: number
  /** Texto principal, p.ej. "3 estudiantes seleccionados" */
  label: string
  /** Motivo por el que la acción principal está bloqueada (null = habilitada) */
  blockedReason?: string | null
  onClear: () => void
  children: React.ReactNode
}

/**
 * Barra de acciones que acompaña a la selección: queda fija sobre el contenido
 * sin importar cuánto se baje, y se esconde al hacer scroll hacia arriba para
 * no tapar la vista. Evita el ida y vuelta de "seleccionar abajo → subir al botón".
 */
export function FloatingActionBar({ count, label, blockedReason, onClear, children }: FloatingActionBarProps) {
  const [hidden, setHidden] = useState(false)
  const lastScrollY = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      const goingUp = y < lastScrollY.current
      // Se esconde al subir (el usuario quiere ver lo de arriba) y reaparece al
      // bajar o al detenerse cerca del tope.
      setHidden(goingUp && y > 200)
      lastScrollY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: hidden ? -90 : 0, opacity: hidden ? 0 : 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          className="sticky top-[84px] z-[60] mx-auto w-fit max-w-full"
        >
          <div className={cn(
            'flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-[14px] shadow-xl border backdrop-blur-md',
            blockedReason
              ? 'bg-amber-50/95 border-amber-200'
              : 'bg-[#111827]/95 border-white/10'
          )}>
            {/* Contador */}
            <div className="flex items-center gap-2.5 shrink-0">
              <span className={cn(
                'flex items-center justify-center min-w-[26px] h-[26px] px-2 rounded-full text-[13px] font-bold',
                blockedReason ? 'bg-amber-500 text-white' : 'bg-white text-[#111827]'
              )}>
                {count}
              </span>
              <span className={cn('text-[13px] font-semibold whitespace-nowrap', blockedReason ? 'text-amber-900' : 'text-white')}>
                {label}
              </span>
            </div>

            {/* Motivo de bloqueo, si aplica */}
            {blockedReason && (
              <div className="flex items-center gap-1.5 pl-3 border-l border-amber-300 max-w-[420px]">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="text-[12px] font-medium text-amber-800 leading-tight">{blockedReason}</span>
              </div>
            )}

            <div className={cn('w-[1px] h-6', blockedReason ? 'bg-amber-300' : 'bg-white/15')} />

            {/* Acciones */}
            <div className="flex items-center gap-2">{children}</div>

            <button
              onClick={onClear}
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded-lg transition-colors shrink-0',
                blockedReason ? 'text-amber-600 hover:bg-amber-100' : 'text-white/50 hover:text-white hover:bg-white/10'
              )}
              title="Limpiar selección (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
