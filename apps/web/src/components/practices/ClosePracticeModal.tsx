'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UserMinus, X, AlertTriangle, Info } from 'lucide-react'
import { api } from '@/lib/axios'
import { Button } from '@/components/ui/button'
import { ReasonPicker } from './ReasonPicker'
import type { Practice } from './EntityList'

export interface CloseResult {
  motivo: string
  documentosFirmados: number
  documentosSinFirmar: number
  regenerarConviene: boolean
  consejo: string
}

/**
 * Dar de baja a un estudiante de su práctica (RF-21).
 *
 * Lo importante que comunica este diálogo es lo que NO hace: cuando el oficio
 * ya salió a firma no se reemite nada, porque el papel firmado que está en la
 * empresa conserva su validez y emitir otro no lo cambiaría. El sistema
 * registra la baja; el papel se queda como está.
 */
export function ClosePracticeModal({
  practice,
  onClose,
  onDone,
}: {
  practice: Practice | null
  onClose: () => void
  onDone: (r: CloseResult) => void
}) {
  const [reasonId, setReasonId] = useState('')
  const [note, setNote] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    setReasonId('')
    setNote('')
  }, [practice?.id])

  if (!practice) return null

  const nombre = `${practice.student.firstName} ${practice.student.lastName}`

  // Qué documentos vigentes tiene, para anticipar el consejo sin ir al servidor.
  const docs = (practice.student.generatedDocs ?? []).filter((d) => (d.status ?? 'VALID') === 'VALID')
  const firmados = docs.filter((d) => d.signatureStatus && d.signatureStatus !== 'NONE')
  const sinFirmar = docs.filter((d) => !d.signatureStatus || d.signatureStatus === 'NONE')

  const confirmar = async () => {
    setEnviando(true)
    try {
      const { data } = await api.patch(`/practices/${practice.id}/close`, {
        reasonId,
        note: note.trim() || undefined,
      })
      onDone(data)
    } catch (e: any) {
      const { toast } = await import('sonner')
      toast.error(e?.response?.data?.message || 'No se pudo dar de baja')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          className="bg-white rounded-[20px] shadow-2xl w-full max-w-[460px] border border-slate-100 overflow-hidden"
        >
          <div className="flex items-start justify-between px-5 pt-5 pb-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                <UserMinus className="h-4.5 w-4.5" />
              </span>
              <div>
                <h2 className="text-[16px] font-bold text-slate-900">Dar de baja</h2>
                <p className="text-[13px] text-slate-500">
                  {nombre} · {practice.company?.name || 'Sin empresa'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100 text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Lo que va a pasar con el papel */}
          <div className="px-5 pb-4">
            {firmados.length > 0 ? (
              <div className="mb-4 flex items-start gap-2.5 rounded-[12px] border border-amber-200 bg-amber-50 px-3.5 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-[12.5px] leading-snug text-amber-800">
                  Sus documentos <strong>ya salieron a firma</strong>, así que no se reemiten: el oficio
                  que está en {practice.company?.name || 'la empresa'} conserva su validez en papel.
                  Queda el registro de la baja.
                </p>
              </div>
            ) : sinFirmar.length > 0 ? (
              <div className="mb-4 flex items-start gap-2.5 rounded-[12px] border border-blue-200 bg-blue-50 px-3.5 py-2.5">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <p className="text-[12.5px] leading-snug text-blue-800">
                  Sus documentos <strong>todavía no salieron a firma</strong>, así que conviene
                  regenerarlos sin él antes de enviarlos.
                </p>
              </div>
            ) : (
              <p className="mb-4 text-[12.5px] text-slate-500">
                No tiene documentos emitidos, así que no hay nada que rehacer.
              </p>
            )}

            <ReasonPicker
              scope="PRACTICE"
              value={reasonId}
              onChange={setReasonId}
              note={note}
              onNoteChange={setNote}
              disabled={enviando}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <Button variant="secondary" onClick={onClose} disabled={enviando} className="text-[13px] rounded-[10px]">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmar}
              disabled={!reasonId || enviando}
              className="text-[13px] rounded-[10px]"
            >
              {enviando ? 'Dando de baja…' : 'Confirmar baja'}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
