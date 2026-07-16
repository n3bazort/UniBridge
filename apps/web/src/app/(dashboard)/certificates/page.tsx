'use client'

import React, { useState, useMemo, useEffect, useRef, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import {
  FileText,
  Search,
  Download,
  ExternalLink,
  PenLine,
  X,
  Building2,
} from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchStore } from '@/store/search'
import { cn } from '@/lib/utils'

interface GeneratedDocument {
  id: string
  templateId: string
  studentId: string
  fileUrl: string
  createdAt: string
  status: 'VALID' | 'INVALIDATED' | 'SUPERSEDED'
  signatureStatus?: 'NONE' | 'IN_SIGNING' | 'PARTIALLY_SIGNED' | 'SIGNED' | 'REJECTED'
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
      company: { id: string; name: string } | null
    }>
  }
  template: { id: string; name: string; type: 'PDF' | 'DOCX' }
}

interface SignatureBatchItem {
  id: string
  status: 'PENDING' | 'SIGNED_BY_DEAN' | 'SIGNED' | 'REJECTED'
  rejectReason?: string
  document: {
    id: string
    documentCode: string | null
    documentType: string | null
    student: { firstName: string; lastName: string }
  }
}

interface SignatureBatch {
  id: string
  code: string
  name?: string
  status: 'PENDING_DEAN' | 'PENDING_DIRECTOR' | 'COMPLETED' | 'CANCELLED'
  createdAt: string
  deanSignedAt?: string | null
  directorSignedAt?: string | null
  createdBy?: { email: string }
  items: SignatureBatchItem[]
}

const BATCH_STATUS_META: Record<SignatureBatch['status'], { label: string; cls: string }> = {
  PENDING_DEAN: { label: 'Esperando Decano (1 de 2)', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  PENDING_DIRECTOR: { label: 'Decano ✓ · Esperando Director (2 de 2)', cls: 'text-blue-700 bg-blue-50 border-blue-200' },
  COMPLETED: { label: 'Firmado y publicado', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  CANCELLED: { label: 'Cancelado', cls: 'text-slate-500 bg-slate-100 border-slate-200' },
}

const BATCH_ITEM_BADGE: Record<SignatureBatchItem['status'], { label: string; cls: string }> = {
  PENDING: { label: 'Sin firmas', cls: 'text-amber-600 bg-amber-50 border-amber-100' },
  SIGNED_BY_DEAN: { label: 'Decano ✓', cls: 'text-blue-600 bg-blue-50 border-blue-100' },
  SIGNED: { label: 'Firmado ✓✓', cls: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  REJECTED: { label: 'Rechazado', cls: 'text-red-600 bg-red-50 border-red-100' },
}

/**
 * Estado único por documento: fusiona vigencia + etapa de firma en una sola
 * píldora, en vez de apilar 2-3 badges que decían lo mismo de otra forma.
 */
function docState(doc: GeneratedDocument): { label: string; cls: string; dot: string } {
  if (doc.status === 'INVALIDATED') return { label: 'Invalidado', cls: 'text-red-700 bg-red-50 border-red-100', dot: 'bg-red-500' }
  if (doc.status === 'SUPERSEDED') return { label: 'Reemplazado', cls: 'text-slate-500 bg-slate-100 border-slate-200', dot: 'bg-slate-400' }
  // La solicitud no entra al circuito de firma: su único estado útil es vigente
  if (doc.documentType !== 'CERTIFICADO') {
    return { label: 'Vigente', cls: 'text-emerald-700 bg-emerald-50 border-emerald-100', dot: 'bg-emerald-500' }
  }
  switch (doc.signatureStatus) {
    case 'IN_SIGNING': return { label: 'Esperando Decano', cls: 'text-amber-700 bg-amber-50 border-amber-100', dot: 'bg-amber-500' }
    case 'PARTIALLY_SIGNED': return { label: 'Esperando Director', cls: 'text-blue-700 bg-blue-50 border-blue-100', dot: 'bg-blue-500' }
    case 'SIGNED': return { label: 'Firmado ✓✓', cls: 'text-emerald-700 bg-emerald-50 border-emerald-100', dot: 'bg-emerald-500' }
    case 'REJECTED': return { label: 'Firma rechazada', cls: 'text-red-700 bg-red-50 border-red-100', dot: 'bg-red-500' }
    default: return { label: 'Listo para enviar', cls: 'text-slate-600 bg-slate-50 border-slate-200', dot: 'bg-slate-300' }
  }
}

const formatShortDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })

/** Stepper horizontal: Enviado → Firma Decano → Firma Director → Publicado */
function BatchStepper({ batch }: { batch: SignatureBatch }) {
  const steps = [
    { label: 'Enviado a firma', date: batch.createdAt, done: true },
    {
      label: 'Firma del Decano',
      date: batch.deanSignedAt,
      done: !!batch.deanSignedAt || batch.status === 'PENDING_DIRECTOR' || batch.status === 'COMPLETED',
    },
    {
      label: 'Firma del Director',
      date: batch.directorSignedAt,
      done: !!batch.directorSignedAt || batch.status === 'COMPLETED',
    },
    { label: 'Publicado', date: batch.directorSignedAt, done: batch.status === 'COMPLETED' },
  ]
  const currentIdx = steps.findIndex(s => !s.done)

  return (
    <div className="flex items-start w-full">
      {steps.map((step, i) => {
        const isCurrent = i === currentIdx && batch.status !== 'CANCELLED'
        return (
          <React.Fragment key={step.label}>
            {i > 0 && (
              <div className={`flex-1 h-[2px] mt-[11px] mx-1 rounded-full ${steps[i - 1].done && step.done ? 'bg-emerald-400' : steps[i - 1].done ? 'bg-blue-300' : 'bg-slate-200'}`} />
            )}
            <div className="flex flex-col items-center text-center w-[92px] shrink-0">
              {step.done ? (
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              ) : isCurrent ? (
                <div className="w-6 h-6 rounded-full border-2 border-blue-500 bg-blue-50 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-slate-200 bg-white" />
              )}
              <span className={`text-[10.5px] font-bold mt-1.5 leading-tight ${step.done ? 'text-emerald-700' : isCurrent ? 'text-blue-700' : 'text-slate-400'}`}>
                {step.label}
              </span>
              <span className="text-[9.5px] text-slate-400 font-medium mt-0.5 leading-tight">
                {step.done && formatShortDate(step.date) ? formatShortDate(step.date) : isCurrent ? 'En curso...' : '—'}
              </span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

function CertificatesPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const highlightId = searchParams.get('highlight')

  const { searchQuery } = useSearchStore()
  const [localSearch, setLocalSearch] = useState('')
  const [filterState, setFilterState] = useState<'ALL' | 'READY' | 'IN_SIGNATURE' | 'SIGNED' | 'ARCHIVED'>('ALL')
  const [viewMode, setViewMode] = useState<'documents' | 'batches'>('documents')

  const [showInvalidateModal, setShowInvalidateModal] = useState(false)
  const [docToInvalidate, setDocToInvalidate] = useState<string | null>(null)
  const [invalidateReason, setInvalidateReason] = useState('')

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sendingToSignature, setSendingToSignature] = useState(false)
  const [barHidden, setBarHidden] = useState(false)
  const lastScrollY = useRef(0)

  const { data: documents = [], isLoading, refetch } = useQuery<GeneratedDocument[]>({
    queryKey: ['generated-documents-all'],
    queryFn: async () => (await api.get('/generated-documents')).data || [],
  })

  const { data: batches = [], isLoading: isLoadingBatches, refetch: refetchBatches } = useQuery<SignatureBatch[]>({
    queryKey: ['signature-batches'],
    queryFn: async () => (await api.get('/signatures/batches')).data || [],
    refetchInterval: 60000,
    refetchOnWindowFocus: false,
    staleTime: 30000,
  })

  // La barra flotante se esconde al subir para no tapar los filtros
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setBarHidden(y < lastScrollY.current && y > 200)
      lastScrollY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Llegada desde Prácticas con ?highlight=docId: scroll + resaltado temporal
  useEffect(() => {
    if (!highlightId || documents.length === 0) return
    const t = setTimeout(() => {
      const el = document.getElementById(`doc-${highlightId}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 250)
    return () => clearTimeout(t)
  }, [highlightId, documents.length])

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSendToSignature = async () => {
    if (selectedIds.size === 0) return
    setSendingToSignature(true)
    try {
      const res = await api.post('/signatures/batches', { documentIds: Array.from(selectedIds) })
      toast.success(`Lote ${res.data.code} enviado al circuito de firma (Decano → Director)`)
      setSelectedIds(new Set())
      setViewMode('batches')
      refetch()
      refetchBatches()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al crear el lote de firma')
    } finally {
      setSendingToSignature(false)
    }
  }

  // Los KPIs miden el circuito de firma, así que solo cuentan CERTIFICADOS:
  // incluir solicitudes inflaba "sin enviar" con documentos que nunca se firman.
  const kpis = useMemo(() => {
    const valid = documents.filter(d => d.status === 'VALID' && d.documentType === 'CERTIFICADO')
    return {
      notSent: valid.filter(d => !d.signatureStatus || d.signatureStatus === 'NONE').length,
      awaitingDean: valid.filter(d => d.signatureStatus === 'IN_SIGNING').length,
      awaitingDirector: valid.filter(d => d.signatureStatus === 'PARTIALLY_SIGNED').length,
      signed: valid.filter(d => d.signatureStatus === 'SIGNED').length,
      rejected: valid.filter(d => d.signatureStatus === 'REJECTED').length,
    }
  }, [documents])

  const combinedSearch = useMemo(() => (localSearch || searchQuery || '').trim().toLowerCase(), [localSearch, searchQuery])

  const filteredDocuments = useMemo(() => {
    const result = documents.filter((doc) => {
      const studentName = `${doc.student?.firstName || ''} ${doc.student?.lastName || ''}`.toLowerCase()
      const matchesSearch = !combinedSearch ||
        studentName.includes(combinedSearch) ||
        (doc.student?.dni || '').toLowerCase().includes(combinedSearch) ||
        (doc.documentCode || '').toLowerCase().includes(combinedSearch) ||
        (doc.student?.practices?.[0]?.company?.name || '').toLowerCase().includes(combinedSearch)

      if (!matchesSearch) return false

      // Los filtros de firma solo aplican a certificados: una solicitud nunca
      // está "sin enviar a firma" porque no pasa por ese circuito.
      const isCert = doc.documentType === 'CERTIFICADO'
      switch (filterState) {
        case 'READY': return isCert && doc.status === 'VALID' && (!doc.signatureStatus || doc.signatureStatus === 'NONE')
        case 'IN_SIGNATURE': return isCert && doc.status === 'VALID' && (doc.signatureStatus === 'IN_SIGNING' || doc.signatureStatus === 'PARTIALLY_SIGNED')
        case 'SIGNED': return isCert && doc.status === 'VALID' && doc.signatureStatus === 'SIGNED'
        case 'ARCHIVED': return doc.status !== 'VALID'
        default: return true
      }
    })
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [documents, combinedSearch, filterState])

  /**
   * Los documentos se agrupan siempre por empresa: es la unidad real de
   * trabajo (la solicitud es grupal y los certificados se emiten por equipo).
   * Así el nombre de la empresa se escribe una vez, no en cada fila.
   */
  const groupedDocuments = useMemo(() => {
    const groups: Record<string, GeneratedDocument[]> = {}
    filteredDocuments.forEach(doc => {
      const key = doc.student?.practices?.[0]?.company?.name || 'Sin empresa'
      if (!groups[key]) groups[key] = []
      groups[key].push(doc)
    })
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredDocuments])

  /**
   * Solo los CERTIFICADOS entran al circuito de firma: la solicitud es un
   * oficio dirigido a la empresa, no lleva firma digital de las autoridades.
   */
  const isSignable = (d: GeneratedDocument) =>
    d.documentType === 'CERTIFICADO' &&
    d.status === 'VALID' &&
    (!d.signatureStatus || d.signatureStatus === 'NONE' || d.signatureStatus === 'REJECTED')

  const selectableInGroup = (docs: GeneratedDocument[]) => docs.filter(isSignable)

  const toggleGroup = (docs: GeneratedDocument[]) => {
    const selectable = selectableInGroup(docs)
    const allSelected = selectable.length > 0 && selectable.every(d => selectedIds.has(d.id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      selectable.forEach(d => allSelected ? next.delete(d.id) : next.add(d.id))
      return next
    })
  }

  const handleDownload = async (docId: string) => {
    try {
      const res = await api.get(`/generated-documents/${docId}/download`)
      window.open(res.data.url, '_blank')
      toast.success(res.data.signed ? 'Descargando versión firmada' : 'Descarga iniciada')
    } catch {
      toast.error('No se pudo descargar el archivo')
    }
  }

  const handleView = async (docId: string) => {
    try {
      const res = await api.get(`/generated-documents/${docId}/view`)
      window.open(res.data.url, '_blank')
    } catch {
      toast.error('No se pudo previsualizar el archivo')
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
    } catch {
      toast.error('Error al invalidar documento')
    }
  }

  const renderDocRow = (doc: GeneratedDocument) => {
    const state = docState(doc)
    const isPdf = doc.template?.type === 'PDF'
    const isSolicitud = doc.documentType !== 'CERTIFICADO'
    const selectable = isSignable(doc)
    const isHighlighted = highlightId === doc.id

    return (
      <motion.div
        key={doc.id}
        id={`doc-${doc.id}`}
        initial={{ opacity: 0, y: 4 }}
        animate={
          isHighlighted
            ? { opacity: 1, y: 0, backgroundColor: ['rgba(219,234,254,0.9)', 'rgba(219,234,254,0.9)', 'rgba(255,255,255,0)'] }
            : { opacity: 1, y: 0 }
        }
        transition={isHighlighted ? { backgroundColor: { duration: 3, times: [0, 0.6, 1] } } : { duration: 0.15 }}
        className={cn(
          'flex items-center gap-3 px-4 py-3 border-b border-[#f3f4f6] last:border-0 transition-colors hover:bg-slate-50/70',
          isHighlighted && 'ring-2 ring-blue-400 ring-inset rounded-[10px]'
        )}
      >
        {/* Las solicitudes no se firman: en su fila el checkbox ni aparece */}
        {isSolicitud ? (
          <span className="w-4 shrink-0" />
        ) : (
          <input
            type="checkbox"
            checked={selectedIds.has(doc.id)}
            disabled={!selectable}
            onChange={() => toggleSelected(doc.id)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-25 cursor-pointer shrink-0"
            title={selectable ? 'Seleccionar para enviar a firma' : 'Ya está en el circuito de firma'}
          />
        )}

        {/* Identidad del documento: tipo + código + estudiante en un bloque */}
        <div className={cn('w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0', isPdf ? 'bg-rose-50 text-rose-500' : 'bg-blue-50 text-blue-500')}>
          <FileText className="w-4 h-4" />
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-semibold text-[#111827] truncate">
              {doc.student?.firstName} {doc.student?.lastName}
            </span>
            <span className="text-[10.5px] font-bold text-slate-400 font-mono shrink-0">{doc.documentCode}</span>
          </div>
          <span className="text-[11.5px] text-[#9ca3af] truncate">
            {doc.documentType === 'CERTIFICADO' ? 'Certificado' : 'Solicitud'} · {formatDate(doc.createdAt)}
            {doc.invalidReason && <span className="text-amber-600"> · {doc.invalidReason}</span>}
          </span>
        </div>

        {/* Estado único (vigencia + firma fusionados) */}
        <span className={cn('flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border shrink-0', state.cls)}>
          <span className={cn('w-1.5 h-1.5 rounded-full', state.dot)} />
          {state.label}
        </span>

        {/* Acciones */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => handleView(doc.id)}
            className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
            title="Visualizar"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDownload(doc.id)}
            className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            title="Descargar"
          >
            <Download className="w-4 h-4" />
          </button>
          {doc.status === 'VALID' && (
            <button
              onClick={() => { setDocToInvalidate(doc.id); setShowInvalidateModal(true) }}
              className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-300 hover:bg-red-50 hover:text-red-600 transition-colors"
              title="Invalidar documento"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>
    )
  }

  const pendingBatches = batches.filter(b => b.status === 'PENDING_DEAN' || b.status === 'PENDING_DIRECTOR').length

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <div className="flex flex-col w-full min-h-[calc(100vh-72px)] bg-[#f7f7f8] pt-6 pb-12 px-4 lg:px-8">
        <div className="w-full max-w-[1200px] mx-auto flex flex-col gap-5">

          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[12px] bg-white border border-[#eef2f7] flex items-center justify-center shadow-sm">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-[19px] font-bold text-[#111827] leading-tight">Documentos y Firmas</h1>
                <p className="text-[12.5px] text-[#6b7280]">Bandeja de certificados y oficios generados, y su avance en el circuito de firma.</p>
              </div>
            </div>
            <button
              onClick={() => { refetch(); refetchBatches() }}
              className="h-[36px] px-3.5 bg-white hover:bg-slate-50 border border-[#eef2f7] rounded-[10px] text-[12.5px] font-semibold text-[#475569] shadow-sm transition-colors shrink-0"
            >
              Actualizar
            </button>
          </div>

          {/* KPIs — también funcionan como filtro rápido */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {[
              { label: 'Sin enviar', value: kpis.notSent, cls: 'text-slate-700', dot: 'bg-slate-300', filter: 'READY' as const },
              { label: 'Esperando Decano', value: kpis.awaitingDean, cls: 'text-amber-600', dot: 'bg-amber-400', filter: 'IN_SIGNATURE' as const },
              { label: 'Esperando Director', value: kpis.awaitingDirector, cls: 'text-blue-600', dot: 'bg-blue-500', filter: 'IN_SIGNATURE' as const },
              { label: 'Firmados', value: kpis.signed, cls: 'text-emerald-600', dot: 'bg-emerald-500', filter: 'SIGNED' as const },
              { label: 'Rechazados', value: kpis.rejected, cls: 'text-red-600', dot: 'bg-red-500', filter: 'ALL' as const },
            ].map((kpi) => (
              <button
                key={kpi.label}
                onClick={() => { setViewMode('documents'); setFilterState(kpi.filter) }}
                className="bg-white rounded-[12px] border border-[#eef2f7] shadow-soft px-3.5 py-2.5 flex flex-col gap-0.5 text-left hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${kpi.dot}`} />
                  <span className="text-[10.5px] font-bold text-[#9ca3af] uppercase tracking-wider truncate">{kpi.label}</span>
                </div>
                <span className={`text-[21px] font-bold leading-none ${kpi.cls}`}>{kpi.value}</span>
              </button>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-[#f1f5f9] p-1 rounded-[12px] w-fit">
              <button
                onClick={() => setViewMode('documents')}
                className={`px-4 py-2 rounded-[10px] text-[13px] font-bold transition-all ${viewMode === 'documents' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#64748b] hover:text-[#111827]'}`}
              >
                Documentos
              </button>
              <button
                onClick={() => setViewMode('batches')}
                className={`flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] font-bold transition-all ${viewMode === 'batches' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#64748b] hover:text-[#111827]'}`}
              >
                Circuito de Firma
                {pendingBatches > 0 && (
                  <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                    {pendingBatches}
                  </span>
                )}
              </button>
            </div>

            {viewMode === 'documents' && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative w-full sm:w-[260px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9ca3af]" />
                  <input
                    type="text"
                    placeholder="Estudiante, código o empresa..."
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-[#eef2f7] rounded-[10px] text-[12.5px] font-medium placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-[#374151] shadow-sm"
                  />
                </div>
                <div className="flex items-center gap-1 bg-[#f1f5f9] p-1 rounded-[10px]">
                  {([
                    { v: 'ALL', l: 'Todos' },
                    { v: 'READY', l: 'Sin enviar' },
                    { v: 'IN_SIGNATURE', l: 'En firma' },
                    { v: 'SIGNED', l: 'Firmados' },
                    { v: 'ARCHIVED', l: 'Archivados' },
                  ] as const).map(opt => (
                    <button
                      key={opt.v}
                      onClick={() => setFilterState(opt.v)}
                      className={`px-2.5 py-1.5 rounded-[8px] text-[11.5px] font-bold transition-all ${filterState === opt.v ? 'bg-white text-[#111827] shadow-sm' : 'text-[#64748b] hover:text-[#111827]'}`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Barra flotante de selección: sigue el scroll, se esconde al subir */}
          <AnimatePresence>
            {viewMode === 'documents' && selectedIds.size > 0 && (
              <motion.div
                initial={{ y: -70, opacity: 0 }}
                animate={{ y: barHidden ? -80 : 0, opacity: barHidden ? 0 : 1 }}
                exit={{ y: -70, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                className="sticky top-[84px] z-[60] mx-auto w-fit"
              >
                <div className="flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-[14px] shadow-xl border border-white/10 bg-[#111827]/95 backdrop-blur-md">
                  <div className="flex items-center gap-2.5">
                    <span className="flex items-center justify-center min-w-[26px] h-[26px] px-2 rounded-full bg-white text-[#111827] text-[13px] font-bold">
                      {selectedIds.size}
                    </span>
                    <span className="text-[13px] font-semibold text-white whitespace-nowrap">
                      documento{selectedIds.size > 1 ? 's' : ''} listo{selectedIds.size > 1 ? 's' : ''} para firma
                    </span>
                  </div>
                  <div className="w-[1px] h-6 bg-white/15" />
                  <button
                    onClick={handleSendToSignature}
                    disabled={sendingToSignature}
                    className="h-[34px] px-4 flex items-center gap-2 rounded-[10px] bg-white hover:bg-slate-100 text-[#111827] text-[12.5px] font-bold transition-colors disabled:opacity-60 whitespace-nowrap"
                  >
                    <PenLine className="w-4 h-4 text-blue-600" />
                    {sendingToSignature ? 'Enviando...' : 'Enviar a firma'}
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="flex items-center justify-center w-7 h-7 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                    title="Limpiar selección"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {viewMode === 'documents' && (
            isLoading ? (
              <div className="bg-white rounded-[16px] border border-[#eef2f7] shadow-soft flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
                <span className="text-[13px] font-medium text-slate-500">Cargando documentos...</span>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="bg-white rounded-[16px] border border-[#eef2f7] shadow-soft flex flex-col items-center justify-center py-20 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                  <FileText className="w-6 h-6 text-slate-400" />
                </div>
                <h3 className="text-[15px] font-bold text-slate-700">No hay documentos</h3>
                <p className="text-[13px] text-slate-400 mt-1 max-w-[360px]">
                  {combinedSearch
                    ? `Nada coincide con "${combinedSearch}".`
                    : 'Genera solicitudes y certificados desde la sección de Prácticas.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {groupedDocuments.map(([companyName, docs]) => {
                  const selectable = selectableInGroup(docs)
                  const allSelected = selectable.length > 0 && selectable.every(d => selectedIds.has(d.id))
                  return (
                    <div key={companyName} className="bg-white rounded-[16px] border border-[#eef2f7] shadow-soft overflow-hidden">
                      {/* Cabecera de empresa: el nombre se escribe UNA vez */}
                      <div className="flex items-center gap-3 px-4 py-3 bg-[#fdfdfd] border-b border-[#f3f4f6]">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          disabled={selectable.length === 0}
                          onChange={() => toggleGroup(docs)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-25 cursor-pointer shrink-0"
                          title={selectable.length > 0 ? `Seleccionar los ${selectable.length} enviables` : 'Ninguno disponible para firma'}
                        />
                        <div className="w-7 h-7 rounded-[8px] bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          <Building2 className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-[13.5px] font-bold text-[#111827] truncate">{companyName}</span>
                        <span className="text-[11.5px] font-medium text-[#9ca3af]">{docs.length} doc{docs.length > 1 ? 's' : ''}</span>
                      </div>
                      <AnimatePresence mode="popLayout">
                        {docs.map(renderDocRow)}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {viewMode === 'batches' && (
            <div className="flex flex-col gap-5">
              {isLoadingBatches ? (
                <div className="bg-white rounded-[16px] border border-[#eef2f7] shadow-soft flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
                  <span className="text-[13px] font-medium text-slate-500">Cargando circuito de firma...</span>
                </div>
              ) : batches.length === 0 ? (
                <div className="bg-white rounded-[16px] border border-[#eef2f7] shadow-soft flex flex-col items-center justify-center py-20 px-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                    <PenLine className="w-6 h-6 text-slate-400" />
                  </div>
                  <h3 className="text-[15px] font-bold text-slate-700">Aún no hay lotes de firma</h3>
                  <p className="text-[13px] text-slate-400 mt-1 max-w-[400px]">
                    Selecciona documentos en la pestaña &quot;Documentos&quot; y presiona &quot;Enviar a firma&quot; para iniciar el circuito Decano → Director.
                  </p>
                </div>
              ) : (
                batches.map((batch) => {
                  const active = batch.items.filter(i => i.status !== 'REJECTED')
                  const deanSigned = active.filter(i => i.status === 'SIGNED_BY_DEAN' || i.status === 'SIGNED').length
                  const directorSigned = active.filter(i => i.status === 'SIGNED').length
                  const rejected = batch.items.length - active.length
                  const meta = BATCH_STATUS_META[batch.status]
                  const stageDone = batch.status === 'PENDING_DEAN' ? deanSigned : directorSigned
                  const stagePct = active.length > 0 ? Math.round((stageDone / active.length) * 100) : 0

                  return (
                    <div key={batch.id} className="bg-white rounded-[16px] border border-[#eef2f7] shadow-soft overflow-hidden">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 py-4 border-b border-[#f3f4f6]">
                        <div className="flex flex-col gap-1.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[14px] font-bold text-[#111827] font-mono">{batch.code}</span>
                            <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-full border ${meta.cls}`}>{meta.label}</span>
                          </div>
                          <span className="text-[11.5px] text-[#9ca3af] font-medium">
                            {batch.items.length} documento(s)
                            {rejected > 0 && <span className="text-red-500"> · {rejected} rechazado(s)</span>}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[10.5px] font-bold text-[#9ca3af] uppercase tracking-wider">
                            Decano {deanSigned}/{active.length} · Director {directorSigned}/{active.length}
                          </span>
                          <div className="w-[180px] h-[6px] bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${batch.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                              style={{ width: `${batch.status === 'COMPLETED' ? 100 : stagePct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="px-5 py-5 border-b border-[#f3f4f6] bg-[#fdfdfd]">
                        <BatchStepper batch={batch} />
                      </div>

                      <div className="divide-y divide-[#f3f4f6] max-h-[280px] overflow-y-auto">
                        {batch.items.map((item) => {
                          const badge = BATCH_ITEM_BADGE[item.status]
                          return (
                            <div key={item.id} className="flex items-center justify-between px-5 py-2.5 hover:bg-slate-50/70 transition-colors">
                              <div className="flex flex-col min-w-0">
                                <span className="text-[12.5px] font-semibold text-[#111827] truncate">
                                  {item.document.student.firstName} {item.document.student.lastName}
                                </span>
                                <span className="text-[10.5px] text-[#9ca3af] font-mono truncate">
                                  {item.document.documentCode || 'Sin código'}
                                  {item.rejectReason && <span className="text-red-400 font-sans"> — {item.rejectReason}</span>}
                                </span>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-[6px] uppercase tracking-wider border shrink-0 ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

        </div>
      </div>

      {/* Invalidate Modal */}
      {showInvalidateModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[20px] shadow-xl w-full max-w-md p-6 border border-[#eef2f7]">
            <h2 className="text-[17px] font-bold text-[#0f172a] mb-2">Invalidar documento</h2>
            <p className="text-[13px] text-[#64748b] mb-5">
              El documento dejará de ser válido para el estudiante. Queda registrado en el historial con la razón que indiques.
            </p>
            <textarea
              value={invalidateReason}
              onChange={(e) => setInvalidateReason(e.target.value)}
              className="w-full border border-[#cbd5e1] rounded-[12px] px-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none h-24"
              placeholder="Ej: La empresa rechazó a 2 estudiantes y la solicitud ya no es válida."
            />
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => { setShowInvalidateModal(false); setDocToInvalidate(null); setInvalidateReason('') }}
                className="px-4 py-2.5 text-[13px] font-semibold text-[#64748b] bg-slate-100 hover:bg-slate-200 rounded-[10px] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleInvalidate}
                disabled={!invalidateReason.trim()}
                className="px-4 py-2.5 text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-[10px] transition-colors"
              >
                Confirmar invalidación
              </button>
            </div>
          </div>
        </div>
      )}
    </RoleGate>
  )
}

export default function CertificatesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-[13px] text-slate-400">Cargando...</div>}>
      <CertificatesPageInner />
    </Suspense>
  )
}
