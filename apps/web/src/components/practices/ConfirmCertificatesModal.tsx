'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, PenLine, X } from 'lucide-react'

interface ConfirmCertificatesModalProps {
  open: boolean
  count: number
  onClose: () => void
  onConfirm: (autoSendToSignature: boolean) => void
}

const AUTO_SIGN_KEY = 'ppp-auto-send-signature'

/**
 * Confirmación previa a emitir certificados. La palomita decide si, al
 * terminar la generación, el lote se envía solo al circuito de firma
 * (Decano → Director) o queda esperando en la bandeja.
 */
export function ConfirmCertificatesModal({ open, count, onClose, onConfirm }: ConfirmCertificatesModalProps) {
  const [autoSend, setAutoSend] = useState(() => {
    if (typeof window === 'undefined') return true
    const saved = localStorage.getItem(AUTO_SIGN_KEY)
    return saved === null ? true : saved === 'true'
  })

  const handleConfirm = () => {
    localStorage.setItem(AUTO_SIGN_KEY, String(autoSend))
    onConfirm(autoSend)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className="bg-white rounded-[20px] shadow-2xl w-full max-w-[440px] border border-slate-100 overflow-hidden"
          >
            <div className="flex items-start justify-between px-6 pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[12px] bg-rose-50 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-rose-500" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-[#111827] leading-tight">
                    Emitir {count} certificado{count > 1 ? 's' : ''}
                  </h2>
                  <p className="text-[12.5px] text-slate-500 mt-0.5">
                    Se generará el certificado de culminación de cada estudiante.
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Palomita: enviar a firma automáticamente */}
            <label className="mx-6 mb-5 flex items-start gap-3 p-3.5 rounded-[12px] border border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={autoSend}
                onChange={(e) => setAutoSend(e.target.checked)}
                className="w-[18px] h-[18px] mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
              />
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[#111827]">
                  <PenLine className="w-3.5 h-3.5 text-blue-500" />
                  Enviar a firma automáticamente
                </span>
                <span className="text-[12px] text-slate-500 leading-snug">
                  {autoSend
                    ? 'Al terminar, los certificados entran solos al circuito Decano → Responsable de Prácticas.'
                    : 'Al terminar, los certificados quedarán listos en la pestaña "Por Enviar a Firma".'}
                </span>
              </div>
            </label>

            <div className="flex justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button
                onClick={onClose}
                className="px-4 py-2.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-200/60 rounded-[10px] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                className="px-5 py-2.5 text-[13px] font-semibold text-white bg-[#111827] hover:bg-[#1f2937] rounded-[10px] transition-colors shadow-sm"
              >
                {autoSend ? 'Generar y enviar a firma' : 'Generar certificados'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
