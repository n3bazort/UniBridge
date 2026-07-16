'use client'

import React, { useState } from 'react'
import { FileText, Clock, Mail, Download, Trash2, X, Building2, ArrowLeftRight } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/lib/axios'
import type { Practice } from './EntityList'

interface RightDetailPanelProps {
  selectedCount: number
  selectedPractice: Practice | null
  onClearSelection?: () => void
  onGenerateCertificate?: (studentId: string) => void
  onReassign?: (p: Practice) => void
}

export function RightDetailPanel({ selectedCount, selectedPractice, onClearSelection, onGenerateCertificate, onReassign }: RightDetailPanelProps) {
  const [showAllDocs, setShowAllDocs] = useState(false)

  const queryClient = useQueryClient()

  const { data: generatedDocsRes } = useQuery({
    queryKey: ['generated-documents', selectedPractice?.studentId],
    queryFn: () => api.get(`/generated-documents/student/${selectedPractice?.studentId}`),
    enabled: !!selectedPractice?.studentId
  })

  // Docs reales del backend
  const generatedDocs: any[] = generatedDocsRes?.data || []
  
  const allDocs = generatedDocs.map(d => {
    let docName = d.template?.name || 'Documento'
    if (d.documentType === 'SOLICITUD') docName = 'Solicitud de Prácticas'
    if (d.documentType === 'CERTIFICADO') docName = 'Certificado de Prácticas'
    
    return {
      name: docName,
      type: d.template?.type || 'PDF',
      id: d.id,
      documentCode: d.documentCode,
      signatureStatus: d.signatureStatus,
      status: d.status,
      // Trazabilidad de la anulación: sin el motivo y el autor, un documento
      // invalidado no se puede justificar ante una auditoría.
      invalidReason: d.invalidReason,
      invalidatedAt: d.invalidatedAt,
      invalidatedByEmail: d.invalidatedBy?.email,
      isReal: true
    }
  })

  const validDocs = allDocs.filter(d => d.status === 'VALID' || !d.status)
  const historyDocs = allDocs.filter(d => d.status === 'SUPERSEDED' || d.status === 'INVALIDATED')

  const displayedDocs = showAllDocs ? validDocs : validDocs.slice(0, 4)
  const [showHistory, setShowHistory] = useState(false)

  if (!selectedPractice && selectedCount === 0) {
    return (
      <div className="sticky top-[96px] flex flex-col items-center justify-center gap-4 w-full h-[calc(100vh-120px)] bg-white rounded-[18px] border border-dashed border-[#eef2f7]">
        <FileText className="w-12 h-12 text-[#e5e7eb]" />
        <p className="text-[#9ca3af] font-medium text-[14px]">Selecciona un registro para ver detalles</p>
      </div>
    )
  }

  // Con selección activa pero sin ficha abierta no se muestra un CTA aquí: las
  // acciones de la selección viven en la barra flotante, que sigue el scroll.
  if (!selectedPractice && selectedCount > 0) {
    return (
      <div className="sticky top-[96px] flex flex-col items-center justify-center gap-3 w-full h-[calc(100vh-120px)] bg-white rounded-[18px] border border-dashed border-[#eef2f7] px-6 text-center">
        <div className="w-11 h-11 rounded-full bg-slate-50 flex items-center justify-center">
          <FileText className="w-5 h-5 text-slate-400" />
        </div>
        <p className="text-[13px] font-medium text-slate-500 leading-snug">
          {selectedCount} seleccionado{selectedCount > 1 ? 's' : ''}.<br />
          <span className="text-slate-400">Usa la barra superior para emitir certificados, o abre un registro para ver su ficha.</span>
        </p>
      </div>
    )
  }

  const p = selectedPractice!

  return (
    <div className="sticky top-[96px] flex flex-col gap-[24px] w-full h-[calc(100vh-120px)] overflow-y-auto no-scrollbar pb-10">
      
      {/* Top Actions Block — la emisión de certificados vive en la barra
          flotante de la selección; aquí solo se cierra la ficha. */}
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold text-[#111827]">Detalles</span>
        <button
          onClick={onClearSelection}
          className="flex items-center justify-center w-[36px] h-[36px] text-[#9ca3af] hover:text-[#111827] bg-white rounded-[10px] border border-[#eef2f7] hover:bg-[#f8fafc] transition-colors"
          title="Cerrar ficha"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Detail Card */}
      <div className="flex flex-col p-[20px] bg-white rounded-[18px] shadow-soft gap-[24px]">
        
        {/* Header (Student) */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <img 
              src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${p.student.firstName}${p.student.lastName}`} 
              alt="Student Avatar" 
              className="w-[48px] h-[48px] rounded-full bg-[#f8fafc] border border-slate-100" 
            />
            <div className="flex flex-col">
              <h2 className="text-[18px] font-semibold text-[#111827] leading-tight">{p.student.firstName} {p.student.lastName}</h2>
              <span className="text-[13px] font-medium text-[#6b7280] mt-1 leading-snug">
                {p.academicLevel} <br/>
                <span className="text-[11px] text-[#9ca3af]">DNI: {p.student.dni}</span>
              </span>
            </div>
          </div>
          <span className={`flex items-center h-[28px] px-[10px] rounded-full text-[12px] font-medium shrink-0
            ${p.status === 'COMPLETED' ? 'bg-[#ecfdf3] text-[#027a48]' : p.status === 'IN_PROGRESS' ? 'bg-[#eff6ff] text-[#1d4ed8]' : 'bg-[#fffaeb] text-[#b54708]'}
          `}>
            {p.status === 'COMPLETED' ? 'Terminado' : p.status === 'IN_PROGRESS' ? 'En curso' : 'Pendiente'}
          </span>
        </div>

        <div className="h-[1px] w-full bg-[#f3f4f6]" />

        {/* Company Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-[#9ca3af] mb-2 flex items-center gap-2">
              Empresa / Institución
              {onReassign && (
                <button
                  onClick={() => onReassign(p)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 transition-colors"
                  title="Reasignar a otra empresa"
                >
                  <ArrowLeftRight className="w-3 h-3" /> Reasignar
                </button>
              )}
            </span>
            <div className="flex items-center gap-2">
              <div className="w-[32px] h-[32px] rounded-lg bg-[#eff6ff] flex items-center justify-center text-[#2563eb] shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <span className="text-[14px] font-medium text-[#111827] leading-tight max-w-[120px] truncate" title={p.company?.name}>
                {p.company?.name || 'Sin asignar'}
                <br/><span className="text-[12px] text-[#6b7280] font-normal">Sector no disp.</span>
              </span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-[#9ca3af] mb-2">Contacto Empresa</span>
            <span className="text-[13px] font-medium text-[#374151] max-w-[140px] truncate" title={p.company?.contactName}>
              {p.company?.contactName || 'No registrado'}
              <br/><span className="text-[12px] text-[#6b7280] font-normal">Rol no disp.</span>
            </span>
          </div>
        </div>

        <div className="h-[1px] w-full bg-[#f3f4f6]" />

        {/* Tutor Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-[#9ca3af] mb-2">Tutor Institucional</span>
            <div className="flex items-center gap-2">
              <img src={`https://api.dicebear.com/9.x/notionists/svg?seed=${p.tutorName}`} className="w-[32px] h-[32px] rounded-full shrink-0" />
              <span className="text-[14px] font-medium text-[#111827] leading-tight max-w-[120px] truncate" title={p.tutorName}>
                {p.tutorName || 'Sin asignar'}
                <br/><span className="text-[12px] text-[#6b7280] font-normal">Docente</span>
              </span>
            </div>
          </div>
          <div className="flex flex-col justify-center">
             <span className="text-[12px] font-medium text-[#9ca3af] mb-2">Contacto Tutor</span>
             <span className="text-[13px] font-medium text-[#374151] truncate max-w-[140px]" title={p.student.user?.email}>
               {p.student.user?.email || 'Email no disp.'}
               <br/><span className="text-[12px] text-[#6b7280] font-normal">Tel no disp.</span>
             </span>
          </div>
        </div>
      </div>

      {/* Details Grid Card */}
      <div className="flex flex-col p-[20px] bg-white rounded-[18px] shadow-soft">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-4">Detalles de la práctica</h3>
        <div className="grid grid-cols-2 gap-y-5 gap-x-4">
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-[#9ca3af]">Área / Departamento</span>
            <span className="text-[13px] font-medium text-[#374151] mt-1">No disponible</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-[#9ca3af]">Jornada</span>
            <span className="text-[13px] font-medium text-[#374151] mt-1">No disponible</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-[#9ca3af]">Tipo de práctica</span>
            <span className="text-[13px] font-medium text-[#374151] mt-1">{p.practiceLevel || 'N/A'}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-[#9ca3af]">Total de horas</span>
            <div className="flex items-center gap-1.5 mt-1 text-[13px] font-semibold text-[#111827]">
              <Clock className="w-[14px] h-[14px] text-[#2563eb]" />
              {p.totalHours} / {p.totalHours} h
            </div>
          </div>
        </div>
      </div>

      {/* Documents Card */}
      <div className="flex flex-col p-[20px] bg-white rounded-[18px] shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-semibold text-[#111827]">Documentos generados</h3>
          {validDocs.length > 4 && (
            <button 
              onClick={() => setShowAllDocs(!showAllDocs)}
              className="text-[13px] font-medium text-[#2563eb] hover:underline"
            >
              {showAllDocs ? 'Ver menos' : 'Ver todos'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-3">
           <AnimatePresence>
             {displayedDocs.map((doc, i) => (
               <motion.div 
                 key={doc.id || i} 
                 initial={{ opacity: 0, scale: 0.8 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0, scale: 0.8 }}
                 transition={{ duration: 0.2 }}
                 onClick={async () => {
                   if (doc.isReal && doc.id) {
                     try {
                       const res = await api.get(`/generated-documents/${doc.id}/view`)
                       window.open(res.data.url, '_blank')
                     } catch {
                       console.error('No se pudo obtener el enlace de previsualización')
                     }
                   }
                 }}
                 className="flex flex-col items-center gap-2 group cursor-pointer relative"
               >
                 <div className="w-[64px] h-[64px] rounded-[14px] bg-[#f8fafc] border border-[#eef2f7] flex items-center justify-center transition-colors group-hover:border-[#2563eb] shadow-sm relative">
                   <FileText className={`w-8 h-8 ${doc.type === 'DOCX' ? 'text-blue-500' : 'text-rose-500'}`} strokeWidth={1.5} />
                   
                   {doc.type === 'PDF' && (
                     <div className="absolute -top-1.5 -right-1.5 bg-white border border-[#eef2f7] shadow-sm rounded-md px-1.5 py-0.5 text-[10px] font-bold text-[#374151]">
                       {doc.signatureStatus === 'SIGNED' ? '2' : doc.signatureStatus === 'PARTIALLY_SIGNED' ? '1' : '-'}
                     </div>
                   )}
                 </div>
                 <span className="text-[11px] font-medium text-[#374151] text-center leading-tight line-clamp-2" title={doc.name}>{doc.name}</span>
                 <span className="text-[10px] text-[#9ca3af]">{doc.type}</span>
               </motion.div>
             ))}
           </AnimatePresence>
           {displayedDocs.length === 0 && (
             <div className="col-span-4 text-center py-4 text-[12px] text-gray-400">
               No hay documentos vigentes.
             </div>
           )}
        </div>

        {historyDocs.length > 0 && (
          <div className="mt-6 border-t border-[#eef2f7] pt-4">
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2 text-[#6b7280]">
                <Trash2 className="w-4 h-4" />
                <span className="text-[13px] font-medium">Historial de versiones ({historyDocs.length})</span>
              </div>
              <span className="text-[#9ca3af] text-[12px]">{showHistory ? 'Ocultar' : 'Mostrar'}</span>
            </button>
            
            <AnimatePresence>
              {showHistory && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 flex flex-col gap-3">
                    {historyDocs.map((doc, i) => (
                      <div 
                        key={doc.id || i}
                        onClick={async () => {
                          if (doc.isReal && doc.id) {
                            try {
                              const res = await api.get(`/generated-documents/${doc.id}/view`)
                              window.open(res.data.url, '_blank')
                            } catch {
                              console.error('No se pudo obtener el enlace de previsualización')
                            }
                          }
                        }}
                        className="flex items-start gap-3 p-3 rounded-[12px] bg-[#f8fafc] border border-[#eef2f7] cursor-pointer hover:border-amber-300 hover:bg-amber-50 transition-colors"
                        title="Abrir esta versión anulada"
                      >
                        <div className="w-[32px] h-[32px] rounded-lg bg-white border border-[#eef2f7] flex items-center justify-center shrink-0 mt-0.5">
                          <FileText className="w-4 h-4 text-gray-400" />
                        </div>
                        <div className="flex flex-col flex-1 min-w-0 gap-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[12px] font-medium text-[#374151]">{doc.name}</span>
                            {doc.documentCode && (
                              <span className="text-[10px] font-mono text-[#9ca3af]">{doc.documentCode}</span>
                            )}
                          </div>
                          <span className="text-[10.5px] font-semibold text-amber-600 uppercase tracking-wide">
                            {doc.status === 'INVALIDATED' ? 'Invalidado' : 'Reemplazado'}
                            {doc.invalidatedAt && (
                              <span className="font-normal normal-case tracking-normal text-[#9ca3af]">
                                {' · '}{new Date(doc.invalidatedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            )}
                          </span>
                          {doc.invalidReason && (
                            <span className="text-[11px] text-[#6b7280] leading-snug">
                              {doc.invalidReason}
                            </span>
                          )}
                          {doc.invalidatedByEmail && (
                            <span className="text-[10.5px] text-[#9ca3af]">
                              Por {doc.invalidatedByEmail}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Timeline Card (Static Mock) */}
      <div className="flex flex-col p-[20px] bg-white rounded-[18px] shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-semibold text-[#111827]">Actividad reciente</h3>
          <button className="text-[13px] font-medium text-[#2563eb] hover:underline">Ver línea</button>
        </div>
        <div className="flex flex-col gap-0">
          <div className="flex gap-4 relative">
             <div className="absolute left-[3.5px] top-[14px] bottom-[-14px] w-[2px] bg-[#e5e7eb]" />
             <div className="w-[9px] h-[9px] rounded-full bg-[#10b981] mt-1.5 shrink-0 relative z-10" />
             <div className="flex flex-col pb-4">
                <span className="text-[13px] font-medium text-[#111827]">Asignado a {p.company?.name || 'Empresa'}</span>
                <span className="text-[12px] text-[#6b7280] mt-0.5">Sistema · Reciente</span>
             </div>
          </div>
          <div className="flex gap-4">
             <div className="w-[9px] h-[9px] rounded-full bg-[#d1d5db] mt-1.5 shrink-0" />
             <div className="flex flex-col">
                <span className="text-[13px] font-medium text-[#111827]">Registro creado</span>
             </div>
          </div>
        </div>
      </div>

    </div>
  )
}
