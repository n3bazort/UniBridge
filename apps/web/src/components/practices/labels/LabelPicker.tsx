'use client'

import React, { useState } from 'react'
import { Check, Lock, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { LabelPill } from './LabelPill'
import { leerEstado, type PracticeLabel } from './types'

/** Paleta fija para las etiquetas nuevas: evita colores ilegibles sobre blanco. */
const PALETA = [
  '#16a34a', '#65a30d', '#ca8a04', '#f59e0b',
  '#ea580c', '#ef4444', '#e11d48', '#db2777',
  '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6',
  '#0ea5e9', '#06b6d4', '#14b8a6', '#64748b',
]

interface LabelPickerProps {
  labels: PracticeLabel[]
  /** Etiqueta actual de esta práctica */
  current?: PracticeLabel | null
  /** Estado derivado, que se muestra como información dentro del selector */
  status: string
  /** Qué le falta para poder marcarse como finalizada; vacío = ya cumple */
  missingForCompletion: string[]
  /** Cuántas filas recibirán el cambio (para avisar cuando son varias) */
  selectionCount?: number
  onAssign: (labelId: string | null) => void
  onCreate: (name: string, color: string) => Promise<void>
  onDelete: (labelId: string) => void
}

export function LabelPicker({
  labels,
  current,
  status,
  missingForCompletion,
  selectionCount = 1,
  onAssign,
  onCreate,
  onDelete,
}: LabelPickerProps) {
  const [open, setOpen] = useState(false)
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [color, setColor] = useState(PALETA[0])
  const [guardando, setGuardando] = useState(false)

  const derivado = leerEstado(status)
  const cumpleCierre = missingForCompletion.length === 0

  const cerrar = () => {
    setOpen(false)
    setCreando(false)
    setNombre('')
  }

  const elegir = (labelId: string | null) => {
    onAssign(labelId)
    cerrar()
  }

  const crear = async () => {
    const limpio = nombre.trim()
    if (!limpio || guardando) return
    setGuardando(true)
    try {
      await onCreate(limpio, color)
      setNombre('')
      setCreando(false)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={(v) => (v ? setOpen(true) : cerrar())}>
      <PopoverTrigger asChild>
        <LabelPill label={current} status={status} />
      </PopoverTrigger>

      <PopoverContent className="w-[264px] p-0" onClick={(e) => e.stopPropagation()}>
        {/* Lo que dice el sistema: informativo, no se elige desde aquí */}
        <div className="px-3 pt-2.5 pb-2 border-b border-slate-100">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            Según los documentos
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: derivado.color }} />
            <span className="text-[12.5px] font-medium" style={{ color: derivado.colorTexto }}>
              {derivado.texto}
            </span>
          </div>
          <p className="text-[10.5px] text-slate-400 mt-1 leading-snug">
            Lo calcula el sistema. La etiqueta que elijas abajo no lo cambia.
          </p>
        </div>

        {selectionCount > 1 && (
          <div className="px-3 py-1.5 bg-blue-50/60 border-b border-blue-100">
            <span className="text-[11px] font-medium text-blue-700">
              Se aplicará a {selectionCount} prácticas seleccionadas
            </span>
          </div>
        )}

        {/* Etiquetas de seguimiento */}
        <div className="p-1.5 max-h-[228px] overflow-y-auto">
          {labels.map((l) => {
            const bloqueada = l.requiresCompletion && !cumpleCierre
            const activa = current?.id === l.id
            return (
              <div key={l.id} className="group/row flex items-center gap-1">
                <button
                  type="button"
                  disabled={bloqueada}
                  onClick={() => elegir(l.id)}
                  title={
                    bloqueada
                      ? `Falta ${missingForCompletion.join(', ')} para poder marcarla`
                      : undefined
                  }
                  className={cn(
                    'flex flex-1 items-center gap-2.5 min-w-0 rounded-lg px-2.5 py-2 text-left transition-colors',
                    bloqueada ? 'opacity-45 cursor-not-allowed' : 'hover:bg-slate-100 cursor-pointer',
                  )}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                  <span className="flex-1 text-[12.5px] font-medium text-slate-700 truncate">{l.name}</span>
                  {bloqueada && <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                  {activa && !bloqueada && <Check className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                </button>
                {!l.isSystem && (
                  <button
                    type="button"
                    onClick={() => onDelete(l.id)}
                    title={`Eliminar la etiqueta «${l.name}»`}
                    className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md text-slate-300 opacity-0 group-hover/row:opacity-100 hover:bg-rose-50 hover:text-rose-500 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )
          })}

          {current && (
            <button
              type="button"
              onClick={() => elegir(null)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-slate-100 transition-colors"
            >
              <X className="w-3 h-3 text-slate-400 shrink-0 ml-[-1px]" />
              <span className="text-[12.5px] font-medium text-slate-500">Quitar etiqueta</span>
            </button>
          )}
        </div>

        {/* Crear una propia */}
        <div className="border-t border-slate-100 p-1.5">
          {!creando ? (
            <button
              type="button"
              onClick={() => setCreando(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva etiqueta
            </button>
          ) : (
            <div className="p-1.5 flex flex-col gap-2">
              <input
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') crear()
                  if (e.key === 'Escape') { setCreando(false); setNombre('') }
                }}
                maxLength={40}
                placeholder="Ej. La empresa no responde"
                className="h-8 w-full rounded-lg border border-slate-200 px-2.5 text-[12.5px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
              />
              <div className="grid grid-cols-8 gap-1.5">
                {PALETA.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    title={c}
                    style={{ backgroundColor: c }}
                    className={cn(
                      'w-6 h-6 rounded-md transition-transform hover:scale-110',
                      color === c && 'ring-2 ring-offset-1 ring-slate-400',
                    )}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={crear}
                  disabled={!nombre.trim() || guardando}
                  className="flex-1 h-8 rounded-lg bg-[#111827] text-white text-[12px] font-semibold hover:bg-[#1f2937] disabled:opacity-40 transition-colors"
                >
                  {guardando ? 'Guardando…' : 'Crear'}
                </button>
                <button
                  type="button"
                  onClick={() => { setCreando(false); setNombre('') }}
                  className="h-8 px-3 rounded-lg text-[12px] font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
