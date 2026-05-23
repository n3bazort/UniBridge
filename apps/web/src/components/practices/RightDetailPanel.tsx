'use client'

import React, { useState } from 'react'
import { FileText, Clock, Mail, Download, Trash2, X, Building2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import type { Practice } from './EntityList'

interface RightDetailPanelProps {
  selectedCount: number
  selectedPractice: Practice | null
  onClearSelection?: () => void
  onGenerateCertificate?: (studentId: string) => void
}

export function RightDetailPanel({ selectedCount, selectedPractice, onClearSelection, onGenerateCertificate }: RightDetailPanelProps) {
  const [showAllDocs, setShowAllDocs] = useState(false)

  const { data: generatedDocsRes } = useQuery({
    queryKey: ['generated-documents', selectedPractice?.studentId],
    queryFn: () => api.get(`/generated-documents/student/${selectedPractice?.studentId}`),
    enabled: !!selectedPractice?.studentId
  })

  // Docs combinados
  const generatedDocs: any[] = generatedDocsRes?.data || []
  const expectedDocs = ['Plan de práctica', 'Carta de presentación', 'Informe mensual', 'Evaluación final']
  
  const realDocs = generatedDocs.map(d => ({
    name: d.template?.name || 'Documento',
    type: d.template?.type || 'PDF',
    url: d.fileUrl,
    isReal: true
  }))

  const staticDocs = expectedDocs
    .filter(ed => !realDocs.some(rd => rd.name.toLowerCase().includes(ed.toLowerCase())))
    .map(ed => ({
      name: ed,
      type: ed.includes('Informe') ? 'DOCX' : 'PDF',
      url: '#',
      isReal: false
    }))

  const allDocs = [...realDocs, ...staticDocs]
  const displayedDocs = showAllDocs ? allDocs : allDocs.slice(0, 4)

  if (!selectedPractice && selectedCount === 0) {
    return (
      <div className="sticky top-[96px] flex flex-col items-center justify-center gap-4 w-full h-[calc(100vh-120px)] bg-white rounded-[18px] border border-dashed border-[#eef2f7]">
        <FileText className="w-12 h-12 text-[#e5e7eb]" />
        <p className="text-[#9ca3af] font-medium text-[14px]">Selecciona un registro para ver detalles</p>
      </div>
    )
  }

  if (!selectedPractice && selectedCount > 0) {
    return (
      <div className="sticky top-[96px] flex flex-col p-[24px] bg-white rounded-[18px] shadow-soft border border-[#eef2f7] items-center text-center gap-4">
        <div className="w-16 h-16 bg-[#f3f4f6] rounded-full flex items-center justify-center mb-2">
          <FileText className="w-8 h-8 text-[#374151]" />
        </div>
        <div>
          <h2 className="text-[20px] font-semibold text-[#111827]">{selectedCount} estudiantes seleccionados</h2>
          <p className="text-[14px] text-[#6b7280] mt-2 max-w-[280px]">Haz clic en el botón de abajo para generar los certificados de todos los estudiantes finalizados seleccionados.</p>
        </div>
        <button 
          onClick={() => onGenerateCertificate && onGenerateCertificate('')}
          title="Generar certificado de culminación de prácticas"
          className="mt-4 flex items-center gap-2 px-6 h-[44px] bg-[#111827] rounded-[12px] text-[14px] font-medium text-white shadow-md hover:bg-[#1f2937] transition-all hover:scale-[0.98] active:scale-[0.95]"
        >
          <FileText className="w-5 h-5" />
          <span>Certificados ({selectedCount})</span>
        </button>
      </div>
    )
  }

  const p = selectedPractice!

  return (
    <div className="sticky top-[96px] flex flex-col gap-[24px] w-full h-[calc(100vh-120px)] overflow-y-auto no-scrollbar pb-10">
      
        {/* Top Actions Block */}
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold text-[#111827]">
          {selectedCount > 0 ? `${selectedCount} seleccionado${selectedCount > 1 ? 's' : ''}` : 'Detalles'}
        </span>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              if (onGenerateCertificate) {
                onGenerateCertificate(p.id)
              }
            }}
            disabled={selectedCount === 0 && p.status !== 'COMPLETED'}
            title={selectedCount > 1 || p.status === 'COMPLETED' ? "Generar certificado de culminación de prácticas" : "Solo disponible para prácticas finalizadas"}
            className="flex items-center gap-2 px-3 h-[36px] bg-white rounded-[10px] text-[13px] font-medium text-[#374151] border border-[#eef2f7] hover:bg-[#f8fafc] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FileText className={`w-4 h-4 ${selectedCount > 1 || p.status === 'COMPLETED' ? 'text-red-500' : 'text-[#6b7280]'}`} />
            <span className="hidden sm:inline">Certificado{selectedCount > 1 ? `s (${selectedCount})` : ''}</span>
          </button>
          <button className="flex items-center gap-2 px-3 h-[36px] bg-white rounded-[10px] text-[13px] font-medium text-[#374151] border border-[#eef2f7] hover:bg-[#f8fafc] transition-colors">
            <Download className="w-4 h-4 text-[#6b7280]" />
          </button>
          <button 
            onClick={onClearSelection}
            className="flex items-center justify-center w-[36px] h-[36px] text-[#9ca3af] hover:text-[#111827] bg-white rounded-[10px] border border-[#eef2f7] hover:bg-[#f8fafc] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
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
            <span className="text-[12px] font-medium text-[#9ca3af] mb-2">Empresa / Institución</span>
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
          {allDocs.length > 4 && (
            <button 
              onClick={() => setShowAllDocs(!showAllDocs)}
              className="text-[13px] font-medium text-[#2563eb] hover:underline"
            >
              {showAllDocs ? 'Ver menos' : 'Ver todos'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-3">
           {displayedDocs.map((doc, i) => (
             <div 
               key={i} 
               onClick={() => {
                 if (doc.isReal && doc.url) {
                   const fullUrl = process.env.NEXT_PUBLIC_API_URL 
                      ? process.env.NEXT_PUBLIC_API_URL.replace('/api/v1', '') + doc.url
                      : 'http://localhost:3001' + doc.url;
                   window.open(fullUrl, '_blank');
                 }
               }}
               className={`flex flex-col items-center gap-2 group ${doc.isReal ? 'cursor-pointer' : 'opacity-60 cursor-default'}`}
             >
               <div className={`w-[64px] h-[64px] rounded-[14px] bg-[#f8fafc] border border-[#eef2f7] flex items-center justify-center transition-colors ${doc.isReal ? 'group-hover:border-[#2563eb] shadow-sm' : ''}`}>
                 <FileText className={`w-8 h-8 ${doc.isReal ? (doc.type === 'DOCX' ? 'text-blue-500' : 'text-rose-500') : 'text-gray-400'}`} strokeWidth={1.5} />
               </div>
               <span className="text-[11px] font-medium text-[#374151] text-center leading-tight line-clamp-2">{doc.name}</span>
               <span className="text-[10px] text-[#9ca3af]">{doc.type}</span>
             </div>
           ))}
        </div>
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
