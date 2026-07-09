'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { 
  FileText, 
  Search, 
  Download, 
  Calendar, 
  User, 
  FileDown, 
  ExternalLink,
  ChevronRight,
  Filter,
  CheckCircle,
  HelpCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchStore } from '@/store/search'

interface GeneratedDocument {
  id: string
  templateId: string
  studentId: string
  fileUrl: string
  createdAt: string
  status: 'VALID' | 'INVALIDATED' | 'SUPERSEDED'
  documentType: string
  documentCode: string
  invalidReason?: string
  student: {
    id: string
    firstName: string
    lastName: string
    dni: string
    practices?: Array<{
      id: string
      academicPeriod: string
      company: {
        id: string
        name: string
      } | null
    }>
  }
  template: {
    id: string
    name: string
    type: 'PDF' | 'DOCX'
  }
}

export default function CertificatesPage() {
  const { searchQuery, setSearchQuery } = useSearchStore()
  const [localSearch, setLocalSearch] = useState('')
  const [filterType, setFilterType] = useState<'ALL' | 'PDF' | 'DOCX'>('ALL')
  const [sortBy, setSortBy] = useState<'recent' | 'old'>('recent')
  const [groupByCompany, setGroupByCompany] = useState(false)
  
  const [showInvalidateModal, setShowInvalidateModal] = useState(false)
  const [docToInvalidate, setDocToInvalidate] = useState<string | null>(null)
  const [invalidateReason, setInvalidateReason] = useState('')

  // Fetch all generated documents
  const { data: documents = [], isLoading, refetch } = useQuery<GeneratedDocument[]>({
    queryKey: ['generated-documents-all'],
    queryFn: async () => {
      const res = await api.get('/generated-documents')
      return res.data || []
    }
  })

  // Combine global search store and local search input
  const combinedSearch = useMemo(() => {
    return (localSearch || searchQuery || '').trim().toLowerCase()
  }, [localSearch, searchQuery])

  // Filter & Sort documents
  const filteredDocuments = useMemo(() => {
    let result = documents.filter((doc) => {
      // Search matches
      const studentName = `${doc.student?.firstName || ''} ${doc.student?.lastName || ''}`.toLowerCase()
      const studentDni = (doc.student?.dni || '').toLowerCase()
      const templateName = (doc.template?.name || '').toLowerCase()
      
      const matchesSearch = !combinedSearch || 
        studentName.includes(combinedSearch) ||
        studentDni.includes(combinedSearch) ||
        templateName.includes(combinedSearch)

      // Type filter matches
      const matchesType = filterType === 'ALL' || doc.template?.type === filterType

      return matchesSearch && matchesType
    })

    // Sorting
    return result.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      return sortBy === 'recent' ? dateB - dateA : dateA - dateB
    })
  }, [documents, combinedSearch, filterType, sortBy])

  const groupedDocuments = useMemo(() => {
    if (!groupByCompany) return null

    const groups: Record<string, GeneratedDocument[]> = {}
    filteredDocuments.forEach(doc => {
      const companyName = doc.student?.practices?.[0]?.company?.name || 'Sin Asignar'
      if (!groups[companyName]) {
        groups[companyName] = []
      }
      groups[companyName].push(doc)
    })
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredDocuments, groupByCompany])

  // Handle file download
  const handleDownload = (fileUrl: string, fileName?: string) => {
    try {
      const fullUrl = process.env.NEXT_PUBLIC_API_URL 
        ? process.env.NEXT_PUBLIC_API_URL.replace('/api/v1', '') + fileUrl
        : fileUrl
      
      // Open in blank window to trigger download
      window.open(fullUrl, '_blank')
      toast.success('Descarga iniciada para: ' + (fileName || 'Documento'))
    } catch (error) {
      toast.error('No se pudo descargar el archivo')
    }
  }

  const handleInvalidate = async () => {
    if (!docToInvalidate || !invalidateReason.trim()) return
    try {
      await api.patch(`/generated-documents/${docToInvalidate}/invalidate`, { reason: invalidateReason })
      toast.success('Documento invalidado correctamente')
      setShowInvalidateModal(false)
      setDocToInvalidate(null)
      setInvalidateReason('')
      refetch()
    } catch (err) {
      toast.error('Error al invalidar documento')
    }
  }

  // Format date nicely
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const renderDocRow = (doc: GeneratedDocument) => {
    const studentName = `${doc.student?.firstName || 'Estudiante'} ${doc.student?.lastName || 'Sin Nombre'}`
    const studentDni = doc.student?.dni || 'N/A'
    const isPdf = doc.template?.type === 'PDF'
    const fileBaseName = doc.fileUrl.split('/').pop() || 'documento'
    const companyName = doc.student?.practices?.[0]?.company?.name || 'Sin Empresa'

    return (
      <motion.tr
        key={doc.id}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.15 }}
        className="hover:bg-slate-50/70 transition-colors"
      >
        {/* Student Info */}
        <td className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-[13px] shrink-0 shadow-sm border border-slate-200/50">
              {doc.student?.firstName?.[0] || 'E'}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-semibold text-[#111827] truncate leading-snug">{studentName}</span>
              <span className="text-[11px] text-[#9ca3af] tracking-wide mt-0.5">DNI: {studentDni}</span>
            </div>
          </div>
        </td>

        {/* Company Info */}
        <td className="px-6 py-4">
          <span className="text-[13px] font-semibold text-[#374151] truncate max-w-[200px]" title={companyName}>
            {companyName}
          </span>
        </td>

        {/* Template Name */}
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-[#374151] truncate max-w-[220px]">
              {doc.template?.name || 'Plantilla predeterminada'}
            </span>
          </div>
        </td>

        {/* Document Type & Status Badge */}
        <td className="px-6 py-4">
          <div className="flex flex-col gap-1.5 items-start">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
              isPdf 
                ? 'bg-red-50 text-red-700 border border-red-100' 
                : 'bg-blue-50 text-blue-700 border border-blue-100'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isPdf ? 'bg-red-500' : 'bg-blue-500'}`} />
              {doc.template?.type || 'PDF'}
            </span>
            {doc.status === 'INVALIDATED' && (
              <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-[6px] uppercase tracking-wider border border-red-100">
                Invalidado
              </span>
            )}
            {doc.status === 'SUPERSEDED' && (
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-[6px] uppercase tracking-wider border border-slate-200">
                Reemplazado
              </span>
            )}
            {doc.status === 'VALID' && (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-[6px] uppercase tracking-wider border border-emerald-100">
                Vigente
              </span>
            )}
          </div>
        </td>

        {/* Created Date */}
        <td className="px-6 py-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Calendar className="w-3.5 h-3.5 text-[#9ca3af]" />
            <span className="text-[12px] font-medium text-[#475569]">{formatDate(doc.createdAt)}</span>
          </div>
        </td>

        {/* Actions */}
        <td className="px-6 py-4 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => handleDownload(doc.fileUrl, fileBaseName)}
              className="flex items-center justify-center w-8 h-8 rounded-[8px] bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-800 transition-colors border border-slate-200/40"
              title="Descargar Documento"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                const fullUrl = process.env.NEXT_PUBLIC_API_URL 
                  ? process.env.NEXT_PUBLIC_API_URL.replace('/api/v1', '') + doc.fileUrl
                  : doc.fileUrl
                window.open(fullUrl, '_blank')
              }}
              className="flex items-center justify-center w-8 h-8 rounded-[8px] bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-800 transition-colors border border-slate-200/40"
              title="Abrir en pestaña nueva"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            {doc.status === 'VALID' && (
              <button
                onClick={() => {
                  setDocToInvalidate(doc.id)
                  setShowInvalidateModal(true)
                }}
                className="flex items-center justify-center px-3 h-8 rounded-[8px] bg-red-50 hover:bg-red-100 text-red-600 font-medium text-[12px] transition-colors border border-red-100"
                title="Invalidar documento"
              >
                Invalidar
              </button>
            )}
          </div>
        </td>
      </motion.tr>
    )
  }

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <div className="flex flex-col w-full min-h-[calc(100vh-72px)] bg-[#f7f7f8] pt-6 pb-12 px-4 lg:px-8">
        <div className="w-full max-w-[1400px] mx-auto flex flex-col gap-6">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-[#eef2f7]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[12px] bg-white border border-[#eef2f7] flex items-center justify-center text-[#111827] shadow-sm">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-[20px] font-bold text-[#111827]">Historial de Certificados</h1>
                <p className="text-[13px] text-[#6b7280]">Visualiza, filtra y descarga todos los certificados y oficios que han sido generados en UniBridge.</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => refetch()}
                className="h-[38px] px-4 bg-white hover:bg-slate-50 border border-[#eef2f7] rounded-[10px] text-[13px] font-semibold text-[#475569] shadow-sm transition-colors"
              >
                Actualizar Lista
              </button>
            </div>
          </div>

          {/* Filters Panel */}
          <div className="bg-white rounded-[18px] border border-[#eef2f7] shadow-soft p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search Input */}
            <div className="relative w-full md:max-w-[360px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
              <input
                type="text"
                placeholder="Buscar estudiante, DNI o plantilla..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#f9fafb] border border-[#eef2f7] rounded-[12px] text-[13px] font-medium placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-[#374151]"
              />
            </div>

            {/* Filters chips and Sort */}
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-1 bg-[#f1f5f9] p-1 rounded-[10px]">
                <button
                  onClick={() => setFilterType('ALL')}
                  className={`px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition-all ${
                    filterType === 'ALL'
                      ? 'bg-white text-[#111827] shadow-sm'
                      : 'text-[#64748b] hover:text-[#111827]'
                  }`}
                >
                  Todos ({documents.length})
                </button>
                <button
                  onClick={() => setFilterType('PDF')}
                  className={`px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition-all ${
                    filterType === 'PDF'
                      ? 'bg-red-50 text-red-700 shadow-sm border border-red-100'
                      : 'text-[#64748b] hover:text-[#111827]'
                  }`}
                >
                  PDF ({documents.filter(d => d.template?.type === 'PDF').length})
                </button>
                <button
                  onClick={() => setFilterType('DOCX')}
                  className={`px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition-all ${
                    filterType === 'DOCX'
                      ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100'
                      : 'text-[#64748b] hover:text-[#111827]'
                  }`}
                >
                  DOCX ({documents.filter(d => d.template?.type === 'DOCX').length})
                </button>
              </div>

              <div className="h-6 w-[1px] bg-slate-200 hidden sm:block" />

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'recent' | 'old')}
                className="px-3 py-2 bg-white border border-[#eef2f7] rounded-[10px] text-[13px] font-semibold text-[#475569] focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all cursor-pointer shadow-sm"
              >
                <option value="recent">Más recientes</option>
                <option value="old">Más antiguos</option>
              </select>

              <button
                onClick={() => setGroupByCompany(!groupByCompany)}
                className={`flex items-center gap-2 h-[38px] px-3.5 rounded-[10px] border transition-all text-[13px] font-semibold shadow-sm
                  ${groupByCompany 
                    ? 'bg-[#f0f9ff] border-[#bae6fd] text-[#0369a1]' 
                    : 'bg-white border-[#eef2f7] hover:bg-slate-50 text-[#475569]'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
                Agrupar por Empresa
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-[18px] border border-[#eef2f7] shadow-soft overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
                <span className="text-[13px] font-medium text-slate-500">Cargando bandeja de certificados...</span>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                  <FileText className="w-6 h-6 text-slate-400" />
                </div>
                <h3 className="text-[15px] font-bold text-slate-700">No se encontraron certificados</h3>
                <p className="text-[13px] text-slate-400 mt-1 max-w-[360px]">
                  {combinedSearch 
                    ? `No existen documentos generados que coincidan con la búsqueda "${combinedSearch}".`
                    : 'Aún no se han generado certificados en la plataforma. Dirígete a la sección de Prácticas para emitir certificados.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#f3f4f6] bg-[#fdfdfd]">
                      <th className="px-6 py-4 text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider">Estudiante</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider">Empresa</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider">Plantilla Base</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider">Tipo</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider">Fecha de Emisión</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f3f4f6]">
                    <AnimatePresence mode="popLayout">
                      {groupByCompany ? (
                        groupedDocuments?.map(([companyName, docs]) => (
                          <React.Fragment key={companyName}>
                            {/* Group Header Row */}
                            <tr className="bg-slate-50/60 font-semibold text-[13px] text-[#374151] border-y border-[#eef2f7]">
                              <td colSpan={6} className="px-6 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-[6px] uppercase tracking-wider">Empresa</span>
                                  <span className="font-bold text-[#111827]">{companyName}</span>
                                  <span className="text-[11px] text-[#9ca3af] font-medium">({docs.length} documentos)</span>
                                </div>
                              </td>
                            </tr>
                            {docs.map((doc) => renderDocRow(doc))}
                          </React.Fragment>
                        ))
                      ) : (
                        filteredDocuments.map((doc) => renderDocRow(doc))
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
        </div>
      </div>

      {/* Invalidate Modal */}
      {showInvalidateModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[24px] shadow-xl w-full max-w-md p-6 border border-[#eef2f7]">
            <h2 className="text-xl font-bold text-[#0f172a] mb-2">Invalidar Documento</h2>
            <p className="text-sm text-[#64748b] mb-6">
              El documento será marcado como inválido y el estudiante ya no podrá descargarlo como válido. Necesitas proporcionar una razón.
            </p>
            
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-[#475569] mb-1.5 block">Razón de la invalidación</label>
                <textarea 
                  value={invalidateReason}
                  onChange={(e) => setInvalidateReason(e.target.value)}
                  className="w-full border border-[#cbd5e1] rounded-[12px] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none h-24"
                  placeholder="Ej: La empresa rechazó a 2 estudiantes y la solicitud ya no es válida."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button 
                onClick={() => {
                  setShowInvalidateModal(false)
                  setDocToInvalidate(null)
                  setInvalidateReason('')
                }}
                className="px-5 py-2.5 text-sm font-medium text-[#64748b] bg-slate-100 hover:bg-slate-200 rounded-[12px] transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleInvalidate}
                disabled={!invalidateReason.trim()}
                className="px-5 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-[12px] transition-colors"
              >
                Confirmar Invalidación
              </button>
            </div>
          </div>
        </div>
      )}
    </RoleGate>
  )
}
