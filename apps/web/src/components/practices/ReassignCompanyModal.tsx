'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { Search, Building2, ArrowRight, AlertTriangle, Clock, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { Practice } from './EntityList'

interface Company {
  id: string
  name: string
  contactName?: string
}

export interface ReassignImpact {
  documentCode: string
  /** Otros estudiantes (además del que se mueve) incluidos en el oficio */
  otherStudents: number
}

interface ReassignCompanyModalProps {
  practice: Practice | null
  impact: ReassignImpact | null
  isSubmitting?: boolean
  onClose: () => void
  onConfirm: (company: Company) => void
}

const RECENT_KEY = 'ppp-recent-companies'

function getRecentIds(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}

export function rememberRecentCompany(id: string) {
  const next = [id, ...getRecentIds().filter(x => x !== id)].slice(0, 5)
  localStorage.setItem(RECENT_KEY, JSON.stringify(next))
}

/**
 * Buscador tipo command-palette para reasignar empresa: los destinos vienen
 * al usuario (búsqueda + recientes) en vez de obligarlo a scrollear la lista
 * completa como exigiría un drag & drop de larga distancia.
 */
export function ReassignCompanyModal({ practice, impact, isSubmitting, onClose, onConfirm }: ReassignCompanyModalProps) {
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { data: companiesRes } = useQuery({
    queryKey: ['companies-all'],
    queryFn: async () => (await api.get('/companies', { params: { page: 1, limit: 1000 } })).data,
    enabled: !!practice,
    staleTime: 60000,
  })

  const companies: Company[] = companiesRes?.data || []
  const currentCompanyName = practice?.company?.name

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const recents = getRecentIds()
    const candidates = companies.filter(c => c.name !== currentCompanyName)
    const matches = q
      ? candidates.filter(c => c.name.toLowerCase().includes(q) || c.contactName?.toLowerCase().includes(q))
      : candidates
    // Sin búsqueda: recientes primero, luego A-Z. Con búsqueda: relevancia simple (empieza-con primero).
    return [...matches].sort((a, b) => {
      if (!q) {
        const ra = recents.indexOf(a.id); const rb = recents.indexOf(b.id)
        if (ra !== -1 || rb !== -1) return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb)
        return a.name.localeCompare(b.name)
      }
      const sa = a.name.toLowerCase().startsWith(q) ? 0 : 1
      const sb = b.name.toLowerCase().startsWith(q) ? 0 : 1
      return sa - sb || a.name.localeCompare(b.name)
    })
  }, [companies, query, currentCompanyName])

  const recentIds = useMemo(() => getRecentIds(), [practice?.id])

  useEffect(() => { setQuery(''); setHighlighted(0) }, [practice?.id])
  useEffect(() => { setHighlighted(0) }, [query])
  useEffect(() => {
    if (practice) setTimeout(() => inputRef.current?.focus(), 50)
  }, [practice])

  // Mantener visible la opción resaltada al navegar con teclado
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${highlighted}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  if (!practice) return null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && filtered[highlighted]) { e.preventDefault(); onConfirm(filtered[highlighted]) }
    else if (e.key === 'Escape') { onClose() }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/40 backdrop-blur-sm p-4 pt-[12vh]"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          className="bg-white rounded-[20px] shadow-2xl w-full max-w-[520px] border border-slate-100 overflow-hidden"
        >
          {/* Header: quién se mueve y desde dónde */}
          <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[13px] text-slate-500 min-w-0">
              <span className="font-semibold text-slate-800 truncate">
                {practice.student.firstName} {practice.student.lastName}
              </span>
              <span className="shrink-0 flex items-center gap-1.5">
                <span className="bg-slate-100 rounded-md px-2 py-0.5 font-medium max-w-[130px] truncate inline-block align-bottom">{currentCompanyName || 'Sin empresa'}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="bg-blue-50 text-blue-600 rounded-md px-2 py-0.5 font-medium">¿…?</span>
              </span>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
          </div>

          {/* Buscador */}
          <div className="px-5 py-3 flex items-center gap-2 border-b border-slate-100">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Buscar empresa destino… (↑↓ para navegar, Enter para elegir)"
              className="w-full text-[14px] outline-none placeholder:text-slate-400 bg-transparent"
            />
          </div>

          {/* Advertencia de impacto grupal */}
          {impact && (
            <div className="mx-5 mt-3 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-[12px] px-3.5 py-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[12.5px] leading-snug text-amber-800">
                Este movimiento invalidará la solicitud <span className="font-semibold font-mono">{impact.documentCode}</span>
                {impact.otherStudents > 0 && (
                  <> que incluye a <span className="font-semibold">{impact.otherStudents} estudiante{impact.otherStudents > 1 ? 's' : ''} más</span> — todo el grupo necesitará una solicitud regenerada</>
                )}.
              </p>
            </div>
          )}

          {/* Lista de empresas */}
          <div ref={listRef} className="max-h-[280px] overflow-y-auto py-2 px-2">
            {filtered.length === 0 ? (
              <div className="text-center text-[13px] text-slate-400 py-8">Sin resultados para “{query}”</div>
            ) : (
              filtered.map((c, idx) => (
                <button
                  key={c.id}
                  data-idx={idx}
                  onMouseEnter={() => setHighlighted(idx)}
                  onClick={() => onConfirm(c)}
                  disabled={isSubmitting}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-left transition-colors',
                    idx === highlighted ? 'bg-blue-50' : 'bg-transparent',
                    isSubmitting && 'opacity-50 cursor-wait',
                  )}
                >
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', idx === highlighted ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500')}>
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[13.5px] font-medium text-slate-800 truncate">{c.name}</span>
                    {c.contactName && <span className="text-[12px] text-slate-400 truncate">{c.contactName}</span>}
                  </div>
                  {!query && recentIds.includes(c.id) && (
                    <span className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0"><Clock className="w-3 h-3" /> reciente</span>
                  )}
                  {idx === highlighted && (
                    <span className="text-[11px] font-medium text-blue-500 shrink-0">
                      {impact ? 'Mover e invalidar ↵' : 'Mover ↵'}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
