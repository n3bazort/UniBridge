'use client'

import React from 'react'
import { X, AlertTriangle, Edit3, ArrowRight, ShieldAlert, CheckCircle2 } from 'lucide-react'

interface MissingDataModalProps {
  isOpen: boolean
  onClose: () => void
  studentName?: string
  documentType: string
  missingFields: string[]
  onFixData: () => void
}

export function MissingDataModal({
  isOpen,
  onClose,
  studentName,
  documentType,
  missingFields,
  onFixData,
}: MissingDataModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[350] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-rose-100 w-full max-w-md overflow-hidden flex flex-col">
        {/* Header con alerta visual */}
        <div className="px-6 py-4 bg-gradient-to-r from-rose-600 to-rose-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold">Datos Faltantes para Emisión</h3>
              <p className="text-[11.5px] text-rose-100">Impedimento legal/técnico de generación</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-4">
          <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-900 leading-relaxed font-medium">
              No se puede generar el documento <strong className="font-bold">{documentType}</strong>
              {studentName ? ` para ${studentName}` : ''} porque faltan datos esenciales que deben imprimirse en la plantilla.
            </div>
          </div>

          <div>
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Campos requeridos por completar:
            </h4>
            <div className="flex flex-col gap-2">
              {missingFields.map((field, idx) => (
                <div key={idx} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs font-semibold text-slate-800">
                  <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  <span>{field}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-[11.5px] text-blue-900 leading-normal">
            💡 <strong className="font-bold">Recomendación:</strong> Presiona el botón a continuación para abrir el formulario de la práctica y completar los campos señalados de inmediato.
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 mt-1">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={() => {
                onClose()
                onFixData()
              }}
              className="px-5 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              <span>Completar datos faltantes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
