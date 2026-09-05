'use client'

import React, { useState, useMemo, useEffect, useRef, Suspense } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import {
  FileText,
  UserCheck,
  Search,
  Download,
  ExternalLink,
  PenLine,
  X,
  Building2,
  List,
  LayoutGrid,
  Archive,
  Upload,
  FileOutput,
  Printer,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchStore } from '@/store/search'
import { usePeriodStore } from '@/store/period'
import { usePeriodoCerrado } from '@/components/layout/periodo-cerrado-aviso'
import { cn } from '@/lib/utils'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { DocxPreviewModal } from '@/components/shared/DocxPreviewModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

interface GeneratedDocument {
  id: string
  templateId: string
  studentId: string
  fileUrl: string
  signedFileKey?: string | null
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
  status: 'PENDING' | 'SIGNED_BY_DIRECTOR' | 'SIGNED_BY_DEAN' | 'SIGNED' | 'REJECTED'
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
  createdBy?: { email: string; firstName?: string | null; lastName?: string | null }
  items: SignatureBatchItem[]
}

// Colores de las 3 tablas de estado de esta página consolidados sobre los
// tokens semánticos (--warning/--info/--success/--destructive/--muted) en
// vez de tonos Tailwind sueltos: es la misma fuente que ahora usa <Badge>.
const BATCH_STATUS_META: Record<SignatureBatch['status'], { label: string; variant: BadgeProps['variant'] }> = {
  PENDING_DIRECTOR: { label: 'Esperando Responsable de Prácticas (1 de 2)', variant: 'warning' },
  PENDING_DEAN: { label: 'Responsable ✓ · Esperando Decano (2 de 2)', variant: 'info' },
  COMPLETED: { label: 'Firmado y publicado', variant: 'success' },
  CANCELLED: { label: 'Cancelado', variant: 'neutral' },
}

const BATCH_ITEM_BADGE: Record<SignatureBatchItem['status'], { label: string; variant: BadgeProps['variant'] }> = {
  PENDING: { label: 'Sin firmas', variant: 'warning' },
  SIGNED_BY_DIRECTOR: { label: 'Responsable ✓', variant: 'info' },
  SIGNED_BY_DEAN: { label: 'Decano ✓', variant: 'info' },
  SIGNED: { label: 'Firmado ✓✓', variant: 'success' },
  REJECTED: { label: 'Rechazado', variant: 'danger' },
}

/**
 * Estado único por documento: fusiona vigencia + etapa de firma en una sola
 * píldora, en vez de apilar 2-3 badges que decían lo mismo de otra forma.
 */
function docState(doc: GeneratedDocument): { label: string; variant: BadgeProps['variant'] } {
  if (doc.status === 'INVALIDATED') return { label: 'Invalidado', variant: 'danger' }
  if (doc.status === 'SUPERSEDED') return { label: 'Reemplazado', variant: 'neutral' }
  // La solicitud no entra al circuito de firma: su único estado útil es vigente
  if (doc.documentType !== 'CERTIFICADO') {
    return { label: 'Vigente', variant: 'success' }
  }
  switch (doc.signatureStatus) {
    case 'IN_SIGNING': return { label: 'Esperando Responsable de Prácticas', variant: 'warning' }
    case 'PARTIALLY_SIGNED': return { label: 'Esperando Decano', variant: 'info' }
    case 'SIGNED': return { label: 'Firmado ✓✓', variant: 'success' }
    case 'REJECTED': return { label: 'Firma rechazada', variant: 'danger' }
    default: return { label: 'Listo para enviar', variant: 'neutral' }
  }
}

/**
 * Un documento admite revisión manual mientras siga vigente, conserve el
 * formato Word y no haya entrado al circuito de firma: una vez firmado,
 * cualquier cambio invalidaría la rúbrica de las autoridades.
 */
function isEditable(doc: GeneratedDocument): boolean {
  return doc.status === 'VALID'
    && (doc.fileUrl || '').toLowerCase().endsWith('.docx')
    && (!doc.signatureStatus || doc.signatureStatus === 'NONE')
}

const formatShortDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })

/** Stepper horizontal: Enviado → Firma Responsable → Firma Decano → Publicado */
function BatchStepper({ batch }: { batch: SignatureBatch }) {
  const steps = [
    { label: 'Enviado a firma', date: batch.createdAt, done: true },
    {
      label: 'Firma del Responsable',
      date: batch.directorSignedAt,
      done: !!batch.directorSignedAt || batch.status === 'PENDING_DEAN' || batch.status === 'COMPLETED',
    },
    {
      label: 'Firma del Decano',
      date: batch.deanSignedAt,
      done: !!batch.deanSignedAt || batch.status === 'COMPLETED',
    },
    { label: 'Publicado', date: batch.deanSignedAt, done: batch.status === 'COMPLETED' },
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

function getDocTypeName(type: string): string {
  if (type === 'DESIGNACION') return 'Designación'
  if (type === 'SOLICITUD') return 'Solicitud'
  if (type === 'CERTIFICADO') return 'Certificado'
  return type
}

function getClusterTypeName(type: string): string {
  if (type === 'DESIGNACION') return 'Designación grupal'
  if (type === 'SOLICITUD') return 'Solicitud grupal'
  if (type === 'CERTIFICADO') return 'Certificado'
  return `${type} grupal`
}

function CertificatesPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const highlightId = searchParams.get('highlight')

  const { searchQuery } = useSearchStore()
  const [localSearch, setLocalSearch] = useState('')
  /**
   * Estado del filtro rápido. `AWAITING_DEAN` y `AWAITING_DIRECTOR` existen por
   * separado porque son dos tarjetas distintas: antes ambas apuntaban a
   * `IN_SIGNATURE`, así que pulsar una encendía las dos y devolvía la misma
   * lista. `REJECTED` tampoco existía: la tarjeta de rechazados llevaba
   * `'ALL'`, de modo que pulsarla quitaba el filtro en vez de mostrar lo
   * único que de verdad hay que rehacer.
   */
  const [filterState, setFilterState] = useState<
    'ALL' | 'READY' | 'IN_SIGNATURE' | 'AWAITING_DEAN' | 'AWAITING_DIRECTOR' | 'SIGNED' | 'REJECTED' | 'ARCHIVED'
  >('ALL')
  const [viewMode, setViewMode] = useState<'documents' | 'batches'>('documents')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [groupBy, setGroupBy] = useState<'COMPANY' | 'STUDENT'>('COMPANY')

  const [showInvalidateModal, setShowInvalidateModal] = useState(false)
  const [docToInvalidate, setDocToInvalidate] = useState<string | null>(null)
  const [invalidateReason, setInvalidateReason] = useState('')
  const [invalidateReasonId, setInvalidateReasonId] = useState('')
  const [invalidating, setInvalidating] = useState(false)

  const queryClient = useQueryClient()

  /** Catálogo de motivos (RF-24): el texto libre pasa a ser la nota. */
  const { data: motivos = [] } = useQuery<Array<{ id: string; code: string; label: string }>>({
    queryKey: ['reasons', 'DOCUMENT'],
    queryFn: async () => (await api.get('/reasons', { params: { scope: 'DOCUMENT' } })).data,
    staleTime: 5 * 60 * 1000,
  })

  /** Lo que se anularía en cascada, consultado al servidor antes de confirmar. */
  const { data: invalidationImpact } = useQuery<{
    students: number
    cascade: { documentType: string; nombre: string; count: number }[]
  }>({
    queryKey: ['invalidation-impact', docToInvalidate],
    queryFn: async () => (await api.get(`/generated-documents/${docToInvalidate}/invalidation-impact`)).data,
    enabled: !!docToInvalidate && showInvalidateModal,
  })

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sendingToSignature, setSendingToSignature] = useState(false)
  const [barHidden, setBarHidden] = useState(false)
  const lastScrollY = useRef(0)

  // Vista de documentos: lista o cuadrícula estilo explorador, con tamaño
  // de ícono ajustable (se recuerda entre sesiones)
  const [layout, setLayout] = useState<'list' | 'grid'>(() =>
    typeof window !== 'undefined' && localStorage.getItem('docs-layout') === 'grid' ? 'grid' : 'list'
  )
  const [iconSize, setIconSize] = useState<number>(() =>
    typeof window !== 'undefined' ? Number(localStorage.getItem('docs-icon-size')) || 96 : 96
  )
  const changeLayout = (l: 'list' | 'grid') => { setLayout(l); localStorage.setItem('docs-layout', l) }
  const changeIconSize = (s: number) => { setIconSize(s); localStorage.setItem('docs-icon-size', String(s)) }

  // Descarga de ZIPs de lotes firmados (la única descarga automática permitida
  // junto con los DOCX: un ZIP no se puede "visualizar")
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set())
  const [downloadingZip, setDownloadingZip] = useState(false)
  // Revisión manual del oficio: reemplazo del Word, conversión a PDF e impresión
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const [docToReplace, setDocToReplace] = useState<string | null>(null)
  const [busyDocId, setBusyDocId] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

  const handleDownloadSignedZip = async (ids?: string[]) => {
    setDownloadingZip(true)
    try {
      const params = ids?.length ? { ids: ids.join(',') } : undefined
      const res = await api.get('/signatures/signed-zip', { responseType: 'blob', params })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `Certificados_Firmados_${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(ids?.length ? `ZIP con ${ids.length} lote(s) descargado` : 'ZIP con todos los lotes firmados descargado')
      setSelectedBatchIds(new Set())
    } catch (err: any) {
      // El error de un blob viene como Blob: se lee para mostrar el mensaje real
      let msg = 'No se pudo generar el ZIP'
      try { msg = JSON.parse(await err.response?.data?.text())?.message || msg } catch {}
      toast.error(msg)
    } finally {
      setDownloadingZip(false)
    }
  }

  const toggleBatchSelected = (id: string) => {
    setSelectedBatchIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Acotado al periodo del selector global — mismo criterio que /practices:
  // el queryKey lleva el periodo para que React Query cachee por separado y
  // solo pida de nuevo cuando cambia, en vez de traer todos los documentos
  // que se han emitido desde que existe el sistema.
  const { selectedPeriod } = usePeriodStore()
  // Período cerrado = solo consulta. El aviso lo pinta el layout; aquí sirve
  // para no ofrecer acciones que el servidor va a rechazar por período.
  const { soloLectura } = usePeriodoCerrado()
  const { data: documents = [], isPending, isFetching, refetch } = useQuery<GeneratedDocument[]>({
    queryKey: ['generated-documents-all', selectedPeriod],
    queryFn: async () => (await api.get('/generated-documents', {
      params: { academicPeriod: selectedPeriod || undefined },
    })).data || [],
    enabled: !!selectedPeriod,
  })

  /**
   * Cuándo mostrar el cargador en lugar de la lista.
   *
   * El periodo sale de un store persistido que se rehidrata después del primer
   * render. Hasta entonces la consulta está deshabilitada y, con la consulta
   * deshabilitada, `isLoading` vale false: la pantalla anunciaba «No hay
   * documentos» antes siquiera de haber preguntado.
   *
   * El segundo caso es la llegada desde Prácticas con ?highlight=<id> recién
   * emitido. Si la lista viene de caché y el documento aún no figura en ella,
   * se espera al refetch en curso antes de pintar, para no mostrar un
   * repositorio en el que falta justamente el documento que se vino a ver.
   */
  const esperandoDestacado =
    !!highlightId && isFetching && !documents.some(d => d.id === highlightId)
  const cargandoDocumentos = !selectedPeriod || isPending || esperandoDestacado

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

  // Llegada desde Prácticas con ?highlight=docId: descolapsar grupo + scroll + resaltado temporal
  useEffect(() => {
    if (!highlightId || documents.length === 0) return

    setViewMode('documents')

    const targetDoc = documents.find(d => d.id === highlightId)
    if (targetDoc) {
      let groupKey = 'Otros'
      if (groupBy === 'COMPANY') {
        groupKey = targetDoc.student?.practices?.[0]?.company?.name || 'Sin empresa'
      } else if (groupBy === 'STUDENT') {
        groupKey = `${targetDoc.student?.firstName || ''} ${targetDoc.student?.lastName || ''}`.trim() || 'Desconocido'
      }
      setCollapsedGroups(prev => ({ ...prev, [groupKey]: false }))
    }

    let attempts = 0
    const interval = setInterval(() => {
      attempts++
      const el = document.getElementById(`doc-${highlightId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        clearInterval(interval)
      } else if (attempts >= 12) {
        clearInterval(interval)
      }
    }, 150)

    return () => clearInterval(interval)
  }, [highlightId, documents, groupBy])

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  /**
   * Envía al circuito solo los certificados que todavía pueden entrar. La
   * selección admite también los ya firmados, porque son los que se exportan;
   * mandarlos de nuevo a firma sería un error que el servidor rechazaría.
   */
  const handleSendToSignature = async () => {
    const firmables = documents.filter((d) => selectedIds.has(d.id) && isSignable(d))
    if (firmables.length === 0) {
      toast.error('Ninguno de los certificados seleccionados puede entrar al circuito de firma')
      return
    }
    setSendingToSignature(true)
    try {
      const res = await api.post('/signatures/batches', { documentIds: firmables.map((d) => d.id) })
      toast.success(`Lote ${res.data.code} enviado al circuito de firma (Responsable de Prácticas → Decano)`)
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

  /**
   * Exporta los certificados marcados en un ZIP con nombres legibles.
   *
   * Es la salida del circuito: lo que se entrega al estudiante. Por eso admite
   * cualquier certificado vigente, esté firmado o no, y por eso el archivo se
   * llama por el período y no por un lote interno.
   */
  const [exportando, setExportando] = useState(false)
  const handleExportarZip = async () => {
    if (selectedIds.size === 0) return
    setExportando(true)
    try {
      const res = await api.post(
        '/generated-documents/export-certificados-zip',
        { documentIds: Array.from(selectedIds), academicPeriod: selectedPeriod || undefined },
        { responseType: 'blob' },
      )
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `Certificados Practicas ${selectedPeriod || ''}`.trim() + '.zip'
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`${selectedIds.size} certificado(s) exportados`)
    } catch {
      toast.error('No se pudo exportar el ZIP de certificados')
    } finally {
      setExportando(false)
    }
  }

  /** Marca todos los certificados vigentes que la vista está mostrando. */
  const seleccionarTodos = () => {
    const todos = filteredDocuments.filter(isSelectable)
    const yaTodos = todos.length > 0 && todos.every((d) => selectedIds.has(d.id))
    setSelectedIds(yaTodos ? new Set() : new Set(todos.map((d) => d.id)))
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
        case 'AWAITING_DEAN': return isCert && doc.status === 'VALID' && doc.signatureStatus === 'IN_SIGNING'
        case 'AWAITING_DIRECTOR': return isCert && doc.status === 'VALID' && doc.signatureStatus === 'PARTIALLY_SIGNED'
        case 'SIGNED': return isCert && doc.status === 'VALID' && doc.signatureStatus === 'SIGNED'
        case 'REJECTED': return isCert && doc.status === 'VALID' && doc.signatureStatus === 'REJECTED'
        case 'ARCHIVED': return doc.status !== 'VALID'
        // Por defecto solo lo vigente: las versiones invalidadas o reemplazadas
        // estorban en la agrupación por empresa y ya tienen su propia vista
        // en el filtro de archivados.
        default: return doc.status === 'VALID'
      }
    })
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [documents, combinedSearch, filterState])

  /**
   * Los documentos se pueden agrupar por empresa o estudiante.
   */
  const groupedDocuments = useMemo(() => {
    const groups: Record<string, GeneratedDocument[]> = {}
    filteredDocuments.forEach(doc => {
      let key = 'Otros'
      if (groupBy === 'COMPANY') {
        key = doc.student?.practices?.[0]?.company?.name || 'Sin empresa'
      } else if (groupBy === 'STUDENT') {
        key = `${doc.student?.firstName || ''} ${doc.student?.lastName || ''}`.trim() || 'Desconocido'
      }
      
      if (!groups[key]) groups[key] = []
      groups[key].push(doc)
    })
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredDocuments, groupBy])

  /**
   * Solo los CERTIFICADOS entran al circuito de firma: la solicitud es un
   * oficio dirigido a la empresa, no lleva firma digital de las autoridades.
   */
  /**
   * Qué puede marcarse: cualquier certificado vigente.
   *
   * Antes solo se podían marcar los que aún no habían entrado al circuito, y
   * eso dejaba fuera precisamente a los ya firmados, que son los que se
   * exportan para entregar. La casilla habilita ahora la selección y es cada
   * acción la que decide sobre qué parte de lo marcado actúa.
   */
  const isSelectable = (d: GeneratedDocument) =>
    d.documentType === 'CERTIFICADO' && d.status === 'VALID'

  /** De lo marcado, lo que todavía puede entrar al circuito de firma. */
  const isSignable = (d: GeneratedDocument) =>
    isSelectable(d) &&
    (!d.signatureStatus || d.signatureStatus === 'NONE' || d.signatureStatus === 'REJECTED')

  const selectableInGroup = (docs: GeneratedDocument[]) => docs.filter(isSelectable)

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

  /**
   * Abrir un documento: PDF en pestaña nueva, Word en el visor de la propia
   * app (docx-preview lo renderiza en el navegador).
   *
   * Antes un DOCX solo se podía descargar — para mirar un oficio había que
   * bajar el archivo, abrirlo en Word y luego borrarlo. Con el visor se
   * revisa sin dejar copias sueltas en el disco de quien lo consulta.
   * La descarga sigue disponible en su propio botón, para cuando de verdad
   * se quiere el archivo.
   */
  const [docxPreview, setDocxPreview] = useState<{ url: string; title: string } | null>(null)

  const handleOpenDoc = async (doc: GeneratedDocument) => {
    const esDocx = (doc.signedFileKey || doc.fileUrl || '').toLowerCase().endsWith('.docx')
    if (!esDocx) return handleView(doc.id)
    try {
      const res = await api.get(`/generated-documents/${doc.id}/view`)
      setDocxPreview({ url: res.data.url, title: doc.documentCode || 'Documento' })
    } catch {
      toast.error('No se pudo abrir la vista previa del Word')
    }
  }

  /**
   * Flujo de revisión del oficio: se descarga el Word, se corrige fuera del
   * sistema y se vuelve a subir. El documento conserva su código y suma una
   * versión, de modo que la numeración oficial no se altera.
   */
  const handleReplaceFile = (docId: string) => {
    setDocToReplace(docId)
    replaceInputRef.current?.click()
  }

  const onReplaceSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !docToReplace) return
    setBusyDocId(docToReplace)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post(`/generated-documents/${docToReplace}/replace-file`, fd)
      toast.success(res.data.message || 'Documento actualizado')
      refetch()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'No se pudo reemplazar el documento')
    } finally {
      setBusyDocId(null)
      setDocToReplace(null)
    }
  }

  const handleConvertToPdf = async (docId: string) => {
    setBusyDocId(docId)
    try {
      const res = await api.post(`/generated-documents/${docId}/convert-to-pdf`)
      toast.success(res.data.message || 'Documento convertido a PDF')
      refetch()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'No se pudo convertir a PDF')
    } finally {
      setBusyDocId(null)
    }
  }

  /** Une los documentos indicados en un PDF y abre el diálogo de impresión. */
  const handlePrint = async (ids: string[]) => {
    if (!ids.length) return
    setPrinting(true)
    try {
      const res = await api.post('/generated-documents/print',
        { ids },
        { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const frame = document.createElement('iframe')
      frame.style.display = 'none'
      frame.src = url
      document.body.appendChild(frame)
      frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print() }
      const omitidos = res.headers['x-documentos-omitidos']
      toast.success(`${res.headers['x-documentos-incluidos'] || ''} documento(s) listos para imprimir`)
      if (omitidos) toast.warning(`No se pudieron incluir: ${omitidos}`)
    } catch {
      toast.error('No se pudo preparar la impresión')
    } finally {
      setPrinting(false)
    }
  }

  const handleInvalidate = async () => {
    if (!docToInvalidate || !invalidateReasonId) return
    setInvalidating(true)
    try {
      const { data } = await api.patch(`/generated-documents/${docToInvalidate}/invalidate`, {
        reasonId: invalidateReasonId,
        reason: invalidateReason.trim() || undefined,
      })

      setShowInvalidateModal(false)
      setDocToInvalidate(null)
      setInvalidateReason('')
      setInvalidateReasonId('')

      // Invalidar un documento cambia el estado de la práctica y del expediente
      // del estudiante, no solo esta lista. Antes solo se refrescaba la de aquí
      // y el resto de la aplicación seguía mostrando el documento como vigente
      // hasta que alguien recargaba la página entera.
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['practices-all'] }),
        queryClient.invalidateQueries({ queryKey: ['generated-documents'] }),
        queryClient.invalidateQueries({ queryKey: ['generated-documents-all'] }),
        queryClient.invalidateQueries({ queryKey: ['students-all'] }),
      ])

      const arrastrados = (data?.cascade ?? []).reduce((n: number, c: any) => n + (c.cuantos ?? 0), 0)
      toast.success(
        arrastrados > 0
          ? `Documento invalidado. Se anularon también ${arrastrados} documento(s) que quedaron sin objeto.`
          : 'Documento invalidado.',
        { duration: 8000 },
      )
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Error al invalidar documento')
    } finally {
      setInvalidating(false)
    }
  }

  const handleCancelBatch = async (id: string) => {
    if (!confirm('¿Estás seguro de anular este lote? Los documentos volverán a estar pendientes de envío.')) return
    try {
      await api.delete(`/signatures/batches/${id}`)
      toast.success('Lote anulado correctamente')
      refetchBatches()
      refetch()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al anular el lote')
    }
  }

  const renderDocRow = (doc: GeneratedDocument) => {
    const state = docState(doc)
    const esDocx = (doc.signedFileKey || doc.fileUrl || '').toLowerCase().endsWith('.docx')
    const isPdf = doc.template?.type === 'PDF'
    const isSolicitud = doc.documentType !== 'CERTIFICADO'
    const selectable = isSelectable(doc)
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
            title={
              !selectable
                ? 'Este documento no está vigente'
                : isSignable(doc)
                  ? 'Seleccionar para enviar a firma o exportar'
                  : 'Seleccionar para exportar (ya pasó por el circuito de firma)'
            }
          />
        )}

        {/* Identidad del documento: tipo + código + estudiante en un bloque */}
        {(() => {
          const isDesignacion = doc.documentType === 'DESIGNACION'
          const isCert = doc.documentType === 'CERTIFICADO'
          const iconBoxCls = isCert
            ? 'bg-rose-50 text-rose-500'
            : isDesignacion
            ? 'bg-violet-50 text-violet-600'
            : 'bg-blue-50 text-blue-500'
          // El ícono es el acceso rápido a abrir el documento: el Word se ve en
          // el visor de la propia app, el PDF lo abre el navegador en una
          // pestaña. Los botones de la derecha conservan sus funciones.
          return (
            <button
              type="button"
              onClick={() => handleOpenDoc(doc)}
              title={esDocx ? 'Ver el Word aquí mismo, sin descargarlo' : 'Abrir el documento'}
              className={cn(
                'w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                iconBoxCls,
              )}
            >
              {isDesignacion ? <UserCheck className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            </button>
          )
        })()}

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-semibold text-[#111827] truncate">
              {doc.student?.firstName} {doc.student?.lastName}
            </span>
            <span className="text-[10.5px] font-bold text-slate-400 font-mono shrink-0">{doc.documentCode}</span>
          </div>
          <span className="text-[11.5px] text-muted-foreground truncate">
            {getDocTypeName(doc.documentType)} · {formatDate(doc.createdAt)}
            {doc.invalidReason && <span className="text-amber-600"> · {doc.invalidReason}</span>}
          </span>
        </div>

        {/* Estado único (vigencia + firma fusionados) */}
        <Badge variant={state.variant} dot className="text-[11px] px-2.5 py-1 shrink-0">
          {state.label}
        </Badge>

        {/* Acciones. Nada se descarga solo: el botón principal ABRE el
            documento — el PDF en pestaña nueva y el Word en el visor de la
            propia app. La descarga es un botón aparte, para cuando de verdad
            se quiere el archivo en el disco. Antes el Word solo se podía
            descargar, así que revisar un oficio obligaba a bajarlo. */}
        <div className="flex items-center gap-1 shrink-0">
          {esDocx ? (
            <>
              <button
                onClick={() => handleOpenDoc(doc)}
                className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                title="Ver el Word aquí mismo, sin descargarlo"
              >
                <Eye className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDownload(doc.id)}
                className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                title="Descargar el archivo Word"
              >
                <Download className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => handleView(doc.id)}
              className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
              title="Visualizar en pestaña nueva"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
          {isEditable(doc) && (
            <>
              <button
                onClick={() => handleReplaceFile(doc.id)}
                disabled={busyDocId === doc.id}
                className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors disabled:opacity-50"
                title="Subir el Word corregido (conserva el código y suma una versión)"
              >
                {busyDocId === doc.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Upload className="w-4 h-4" />}
              </button>
              <button
                onClick={() => handleConvertToPdf(doc.id)}
                disabled={busyDocId === doc.id}
                className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors disabled:opacity-50"
                title="Convertir a PDF cuando el documento ya esté conforme"
              >
                <FileOutput className="w-4 h-4" />
              </button>
            </>
          )}
          {doc.status === 'VALID' && (
            <>
              <button
                onClick={() => handlePrint([doc.id])}
                disabled={printing}
                className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-50"
                title="Imprimir este documento"
              >
                <Printer className="w-4 h-4" />
              </button>
            </>
          )}
          {doc.status === 'VALID' && !soloLectura && (
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

  /**
   * Una SOLICITUD es un solo documento físico compartido por varios
   * estudiantes: se agrupan sus filas (mismo código + estado) en una sola,
   * con un único estado y un único juego de acciones. Los certificados son
   * individuales y quedan como filas propias.
   */
  const clusterDocs = (docs: GeneratedDocument[]) => {
    const map = new Map<string, GeneratedDocument[]>()
    const order: string[] = []
    for (const d of docs) {
      const key = d.documentType !== 'CERTIFICADO' && d.documentCode
        ? `S:${d.documentCode}:${d.status}:${d.signatureStatus || 'NONE'}`
        : `U:${d.id}`
      if (!map.has(key)) { map.set(key, []); order.push(key) }
      map.get(key)!.push(d)
    }
    return order.map(k => map.get(k)!)
  }

  /** Fila unificada del oficio grupal: un documento, N estudiantes. */
  const renderSharedRow = (cluster: GeneratedDocument[]) => {
    const doc = cluster[0]
    const state = docState(doc)
    const isDocxFile = (doc.signedFileKey || doc.fileUrl || '').endsWith('.docx')
    const matchDoc = cluster.find(d => d.id === highlightId)
    const isHighlighted = !!matchDoc
    const rowId = matchDoc ? `doc-${matchDoc.id}` : `doc-${doc.id}`

    return (
      <div
        key={`shared-${doc.documentCode}-${doc.status}`}
        id={rowId}
        className={cn(
          'flex items-center gap-3 px-4 py-3 border-b border-[#f3f4f6] last:border-0 transition-colors hover:bg-slate-50/70',
          isHighlighted && 'ring-2 ring-blue-400 ring-inset rounded-[10px] bg-blue-50/40'
        )}
      >
        <span className="w-4 shrink-0" />

        {/* Ícono "apilado": comunica que es UN documento de varios */}
        {(() => {
          const isDesignacion = doc.documentType === 'DESIGNACION'
          return (
            <button
              type="button"
              onClick={() => handleOpenDoc(doc)}
              title={isDocxFile ? 'Ver el Word aquí mismo, sin descargarlo' : 'Abrir el oficio'}
              className="relative shrink-0 w-9 h-8 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-[9px]"
            >
              <div className={cn('absolute left-1.5 top-0 w-8 h-8 rounded-[9px] rotate-3', isDesignacion ? 'bg-violet-100/70' : 'bg-blue-100/70')} />
              <div className={cn('absolute left-0 top-0 w-8 h-8 rounded-[9px] flex items-center justify-center border', isDesignacion ? 'bg-violet-50 text-violet-600 border-violet-100' : 'bg-blue-50 text-blue-500 border-blue-100')}>
                {isDesignacion ? <UserCheck className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
              </div>
            </button>
          )
        })()}

        <div className="flex flex-col min-w-0 flex-1 gap-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-semibold text-[#111827] shrink-0">{getClusterTypeName(doc.documentType)}</span>
            <span className="text-[10.5px] font-bold text-slate-400 font-mono truncate">{doc.documentCode}</span>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full shrink-0">
              {cluster.length} estudiantes
            </span>
          </div>
          {/* Los dueños del documento, en una línea */}
          <span className="text-[11.5px] text-muted-foreground truncate">
            {cluster.map(d => `${d.student?.firstName?.split(' ')[0]} ${d.student?.lastName?.split(' ')[0]}`).join(' · ')}
            <span className="text-muted-foreground"> — {formatDate(doc.createdAt)}</span>
          </span>
        </div>

        {/* UN estado y UN juego de acciones para todo el grupo */}
        <Badge variant={state.variant} dot className="text-[11px] px-2.5 py-1 shrink-0">
          {state.label}
        </Badge>

        <div className="flex items-center gap-1 shrink-0">
          {isDocxFile ? (
            <button
              onClick={() => handleDownload(doc.id)}
              className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              title="Descargar el Word para revisarlo"
            >
              <Download className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => handleView(doc.id)}
              className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
              title="Visualizar en pestaña nueva"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}

          {/* Revisión manual: solo mientras el oficio siga en Word y fuera del circuito de firma */}
          {isEditable(doc) && (
            <>
              <button
                onClick={() => handleReplaceFile(doc.id)}
                disabled={busyDocId === doc.id}
                className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors disabled:opacity-50"
                title="Subir el Word corregido (conserva el código y suma una versión)"
              >
                {busyDocId === doc.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Upload className="w-4 h-4" />}
              </button>
              <button
                onClick={() => handleConvertToPdf(doc.id)}
                disabled={busyDocId === doc.id}
                className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors disabled:opacity-50"
                title="Convertir a PDF cuando el oficio ya esté conforme"
              >
                <FileOutput className="w-4 h-4" />
              </button>
            </>
          )}

          {doc.status === 'VALID' && (
            <>
              <button
                onClick={() => handlePrint([doc.id])}
                disabled={printing}
                className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-50"
                title="Imprimir este documento"
              >
                <Printer className="w-4 h-4" />
              </button>
            </>
          )}
          {doc.status === 'VALID' && !soloLectura && (
            <button
              onClick={() => { setDocToInvalidate(doc.id); setShowInvalidateModal(true) }}
              className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-300 hover:bg-red-50 hover:text-red-600 transition-colors"
              title={`Invalidar el oficio (afecta a los ${cluster.length} estudiantes)`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    )
  }

  /**
   * Tarjeta de cuadrícula (estilo explorador de Windows): el ícono escala con
   * el slider, click = visualizar (o descargar si es DOCX).
   */
  const renderDocCard = (doc: GeneratedDocument) => {
    const state = docState(doc)
    const isDocxFile = (doc.signedFileKey || doc.fileUrl || '').endsWith('.docx')
    const selectable = isSelectable(doc)
    const isHighlighted = highlightId === doc.id

    return (
      <div
        key={doc.id}
        id={`doc-${doc.id}`}
        onClick={() => handleOpenDoc(doc)}
        className={cn(
          'relative flex flex-col items-center gap-1.5 p-3 rounded-[12px] border border-transparent cursor-pointer transition-colors hover:bg-slate-50 hover:border-[#eef2f7] group',
          isHighlighted && 'ring-2 ring-blue-400 bg-blue-50/50'
        )}
        title={`${doc.documentCode} — ${isDocxFile ? 'descargar' : 'visualizar'}`}
      >
        {selectable && (
          <input
            type="checkbox"
            checked={selectedIds.has(doc.id)}
            onChange={() => toggleSelected(doc.id)}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2 left-2 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer opacity-0 group-hover:opacity-100 checked:opacity-100 transition-opacity"
          />
        )}
        {(() => {
          const isDesignacion = doc.documentType === 'DESIGNACION'
          const isCert = doc.documentType === 'CERTIFICADO'
          const iconBoxCls = isCert
            ? 'bg-rose-50 text-rose-400'
            : isDesignacion
            ? 'bg-violet-50 text-violet-600'
            : 'bg-blue-50 text-blue-400'
          return (
            <div
              className={cn('flex items-center justify-center rounded-[14px]', iconBoxCls)}
              style={{ width: iconSize, height: iconSize * 0.78 }}
            >
              {isDesignacion ? (
                <UserCheck style={{ width: iconSize * 0.42, height: iconSize * 0.42 }} strokeWidth={1.5} />
              ) : (
                <FileText style={{ width: iconSize * 0.42, height: iconSize * 0.42 }} strokeWidth={1.5} />
              )}
            </div>
          )
        })()}
        <span
          className="text-[11px] font-semibold text-[#111827] text-center leading-tight line-clamp-2"
          style={{ maxWidth: iconSize + 24 }}
        >
          {doc.student?.firstName} {doc.student?.lastName}
        </span>
        <span className="text-[9.5px] font-mono text-slate-400 truncate" style={{ maxWidth: iconSize + 24 }}>
          {doc.documentCode}
        </span>
        <Badge variant={state.variant} dot className="text-[9px] px-1.5 py-0.5">
          {state.label}
        </Badge>
      </div>
    )
  }

  const pendingBatches = batches.filter(b => b.status === 'PENDING_DEAN' || b.status === 'PENDING_DIRECTOR').length
  const completedBatches = batches.filter(b => b.status === 'COMPLETED')

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      {/* Entrada oculta para subir el Word corregido */}
      <input
        ref={replaceInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={onReplaceSelected}
      />
      <div className="flex flex-col w-full flex-1">
        <PageContainer variant="wide" className="flex flex-col gap-5">

          {/* Header */}
          <PageHeader
            description="Bandeja de certificados y oficios generados, y su avance en el circuito de firma."
            actions={
              <button
                onClick={() => { refetch(); refetchBatches() }}
                className="h-9 px-3.5 bg-card hover:bg-muted/60 border border-border rounded-md text-xs font-semibold text-foreground transition-colors shrink-0"
              >
                Actualizar
              </button>
            }
          />

          {/* KPIs — y ÚNICO filtro rápido. Antes había dos controles para lo
              mismo: estas 5 tarjetas Y una fila de chips "Todos/Sin
              enviar/En firma/..." debajo, con etiquetas casi idénticas,
              cambiando el mismo filterState. Se quitó la fila de chips —
              estas tarjetas ya dicen lo mismo con más información (el
              número real). El anillo azul marca cuál está activo como
              filtro; tocar la misma lo apaga (vuelve a "Todos"). */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {[
              { label: 'Sin enviar', value: kpis.notSent, tone: 'info' as const, filter: 'READY' as const },
              { label: 'Esperando Decano', value: kpis.awaitingDean, tone: 'warning' as const, filter: 'AWAITING_DEAN' as const },
              { label: 'Esperando Responsable', value: kpis.awaitingDirector, tone: 'warning' as const, filter: 'AWAITING_DIRECTOR' as const },
              { label: 'Firmados', value: kpis.signed, tone: 'success' as const, filter: 'SIGNED' as const },
              { label: 'Rechazados', value: kpis.rejected, tone: 'danger' as const, filter: 'REJECTED' as const },
            ].map((kpi) => {
              const active = kpi.value > 0
              const isSelected = viewMode === 'documents' && filterState === kpi.filter
              const toneCls = {
                info: { border: 'border-info/25', text: 'text-info', dot: 'bg-info', ring: 'ring-info/40' },
                warning: { border: 'border-warning/25', text: 'text-warning', dot: 'bg-warning', ring: 'ring-warning/40' },
                success: { border: 'border-success/25', text: 'text-success', dot: 'bg-success', ring: 'ring-success/40' },
                danger: { border: 'border-destructive/25', text: 'text-destructive', dot: 'bg-destructive', ring: 'ring-destructive/40' },
              }[kpi.tone]
              return (
                // Una sola línea (etiqueta + número), no dos apiladas: eran
                // tarjetas de 60px+ de alto para mostrar dos palabras y un
                // número — demasiado peso para tan poca información.
                <button
                  key={kpi.label}
                  onClick={() => {
                    setViewMode('documents')
                    setFilterState((prev) => (prev === kpi.filter ? 'ALL' : kpi.filter))
                  }}
                  className={cn(
                    'rounded-[10px] border px-2.5 py-1.5 flex items-center justify-between gap-2 text-left transition-colors',
                    isSelected && cn('ring-2', toneCls.ring),
                    active
                      ? cn('bg-white shadow-soft hover:border-slate-300', toneCls.border)
                      : 'bg-muted/40 border-transparent hover:border-border',
                  )}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', active ? toneCls.dot : 'bg-muted-foreground/30')} />
                    <span className={cn('text-[10px] font-bold uppercase tracking-wider truncate', active ? 'text-muted-foreground' : 'text-muted-foreground/50')}>{kpi.label}</span>
                  </div>
                  <span className={cn('text-[15px] font-bold leading-none shrink-0', active ? toneCls.text : 'text-muted-foreground/40')}>{kpi.value}</span>
                </button>
              )
            })}
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
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Estudiante, código o empresa..."
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    className="w-full pl-9 pr-3"
                  />
                </div>
                {/* "Archivados" es el único valor que las tarjetas KPI de
                    arriba no cubren (no hay un conteo de archivados que
                    tenga sentido mostrar como KPI) — por eso es el único
                    que sigue viviendo aquí, como un toggle suelto en vez de
                    una fila entera de chips repitiendo lo que ya dicen las
                    tarjetas. */}
                <button
                  onClick={() => setFilterState((prev) => (prev === 'ARCHIVED' ? 'ALL' : 'ARCHIVED'))}
                  className={cn(
                    'h-9 px-3 rounded-[10px] text-[11.5px] font-bold transition-all border shrink-0',
                    filterState === 'ARCHIVED'
                      ? 'bg-white border-border shadow-sm text-foreground'
                      : 'bg-transparent border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  Archivados
                </button>


                {/* Preferencias de visualización: agrupar + lista/cuadrícula
                    comparten UNA sola caja con divisor interno — antes eran
                    2 cajas grises separadas, del mismo peso que "buscar" y
                    "filtro de estado" (que sí cambian QUÉ se ve, no CÓMO).
                    El margen extra a la izquierda marca la frontera entre
                    ambos grupos de intención. */}
                <div className="flex items-center gap-1 bg-[#f1f5f9] p-1 rounded-[10px] ml-1 pl-1">
                  <Select
                    value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value as any)}
                    className="w-40"
                    title="Agrupar por"
                    icon={groupBy === 'COMPANY' ? <Building2 className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  >
                    <option value="COMPANY">Empresa</option>
                    <option value="STUDENT">Estudiante</option>
                  </Select>

                  <div className="w-px h-5 bg-[#e2e8f0] mx-0.5" />

                  <button
                    onClick={() => changeLayout('list')}
                    className={`p-1.5 rounded-[8px] transition-all ${layout === 'list' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#64748b] hover:text-[#111827]'}`}
                    title="Vista de lista"
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => changeLayout('grid')}
                    className={`p-1.5 rounded-[8px] transition-all ${layout === 'grid' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#64748b] hover:text-[#111827]'}`}
                    title="Vista de cuadrícula"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  {layout === 'grid' && (
                    <Input
                      type="range"
                      min={64}
                      max={160}
                      step={8}
                      value={iconSize}
                      onChange={(e) => changeIconSize(Number(e.target.value))}
                      className="w-[90px]"
                      title={`Tamaño de ícono: ${iconSize}px`}
                    />
                  )}
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
                className="sticky top-[84px] z-30 mx-auto w-fit"
              >
                <div className="flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-[14px] shadow-xl border border-white/10 bg-primary/95 backdrop-blur-md">
                  <div className="flex items-center gap-2.5">
                    <span className="flex items-center justify-center min-w-[26px] h-[26px] px-2 rounded-full bg-white text-[#111827] text-[13px] font-bold">
                      {selectedIds.size}
                    </span>
                    <span className="text-[13px] font-semibold text-white whitespace-nowrap">
                      certificado{selectedIds.size > 1 ? 's' : ''} seleccionado{selectedIds.size > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="w-[1px] h-6 bg-white/15" />
                  {/* Enviar a firma solo aparece si algo de lo marcado puede
                      entrar al circuito; con certificados ya firmados el botón
                      no tendría a qué aplicarse. */}
                  {!soloLectura && documents.some((d) => selectedIds.has(d.id) && isSignable(d)) && (
                    <button
                      onClick={handleSendToSignature}
                      disabled={sendingToSignature}
                      className="h-[34px] px-4 flex items-center gap-2 rounded-[10px] bg-white hover:bg-slate-100 text-[#111827] text-[12.5px] font-bold transition-colors disabled:opacity-60 whitespace-nowrap"
                    >
                      <PenLine className="w-4 h-4 text-blue-600" />
                      {sendingToSignature ? 'Enviando...' : 'Enviar a firma'}
                    </button>
                  )}
                  <button
                    onClick={handleExportarZip}
                    disabled={exportando}
                    className="h-[34px] px-4 flex items-center gap-2 rounded-[10px] bg-emerald-500 hover:bg-emerald-600 text-white text-[12.5px] font-bold transition-colors disabled:opacity-60 whitespace-nowrap"
                    title={`Descarga los certificados en un ZIP: «Certificados Practicas ${selectedPeriod || ''}»`}
                  >
                    {exportando
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Download className="w-4 h-4" />}
                    {exportando ? 'Preparando...' : 'Exportar ZIP'}
                  </button>
                  <button
                    onClick={() => handlePrint(Array.from(selectedIds))}
                    disabled={printing}
                    className="h-[34px] px-4 flex items-center gap-2 rounded-[10px] bg-white/10 hover:bg-white/20 text-white text-[12.5px] font-bold transition-colors disabled:opacity-60 whitespace-nowrap"
                    title="Une los documentos elegidos en un solo PDF y abre el diálogo de impresión"
                  >
                    {printing
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Printer className="w-4 h-4" />}
                    {printing ? 'Preparando...' : 'Imprimir'}
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
            cargandoDocumentos ? (
              <div className="bg-white rounded-[16px] border border-[#eef2f7] shadow-soft flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
                <span className="text-[13px] font-medium text-slate-500">
                  {highlightId ? 'Buscando el documento…' : 'Cargando documentos...'}
                </span>
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

                {/* Casilla maestra. Va aquí, en la misma columna que las de cada
                    grupo, porque es la lectura natural: una casilla que manda
                    sobre las de abajo. */}
                {(() => {
                  const marcables = filteredDocuments.filter(isSelectable)
                  if (marcables.length === 0) return null
                  const todosMarcados = marcables.every((d) => selectedIds.has(d.id))
                  return (
                    <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none group">
                      <input
                        type="checkbox"
                        checked={todosMarcados}
                        onChange={seleccionarTodos}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                      />
                      <span className="text-[12.5px] font-semibold text-[#64748b] group-hover:text-[#111827] transition-colors">
                        {todosMarcados
                          ? `Quitar la selección de los ${marcables.length} certificados`
                          : `Seleccionar los ${marcables.length} certificados`}
                      </span>
                    </label>
                  )
                })()}

                {groupedDocuments.map(([groupName, docs]) => {
                  const selectable = selectableInGroup(docs)
                  const allSelected = selectable.length > 0 && selectable.every(d => selectedIds.has(d.id))
                  // El oficio grupal es un solo documento para varios estudiantes:
                  // se cuentan los documentos, no las filas que cada uno ampara.
                  const docCount = clusterDocs(docs).length
                  return (
                    <div key={groupName} className="bg-white rounded-[16px] border border-[#eef2f7] shadow-soft overflow-hidden">
                      {/* Cabecera de grupo */}
                      <div 
                        className="flex items-center gap-3 px-4 py-3 bg-[#fdfdfd] border-b border-[#f3f4f6] cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setCollapsedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }))}
                      >
                        <input
                          type="checkbox"
                          checked={allSelected}
                          disabled={selectable.length === 0}
                          onChange={(e) => {
                            e.stopPropagation()
                            toggleGroup(docs)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-25 cursor-pointer shrink-0"
                          title={selectable.length > 0 ? `Seleccionar los ${selectable.length} enviables` : 'Ninguno disponible para firma'}
                        />
                        <div className="w-7 h-7 rounded-[8px] bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          {groupBy === 'COMPANY' && <Building2 className="w-3.5 h-3.5" />}
                          {groupBy === 'STUDENT' && <UserCheck className="w-3.5 h-3.5" />}
                        </div>
                        <span className="text-[13.5px] font-bold text-[#111827] truncate select-none">{groupName}</span>
                        <span className="text-[11.5px] font-medium text-muted-foreground select-none">{docCount} doc{docCount > 1 ? 's' : ''}</span>
                        
                        <div className="ml-auto text-slate-400">
                          {collapsedGroups[groupName] ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                      
                      <AnimatePresence initial={false}>
                        {!collapsedGroups[groupName] && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            {layout === 'grid' ? (
                        <div
                          className="grid gap-1 p-3 pl-6"
                          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${iconSize + 40}px, 1fr))` }}
                        >
                          {clusterDocs(docs).map(cluster => {
                            const matchDoc = cluster.find(d => d.id === highlightId)
                            const isHighlighted = !!matchDoc
                            const rowId = matchDoc ? `doc-${matchDoc.id}` : `doc-${cluster[0].id}`
                            return cluster.length > 1 ? (
                              <div
                                key={`shared-${cluster[0].documentCode}-${cluster[0].status}`}
                                id={rowId}
                                onClick={() => handleOpenDoc(cluster[0])}
                                className={cn(
                                  'relative flex flex-col items-center gap-1.5 p-3 rounded-[12px] border border-transparent cursor-pointer transition-colors hover:bg-slate-50 hover:border-[#eef2f7]',
                                  isHighlighted && 'ring-2 ring-blue-400 ring-inset bg-blue-50/40'
                                )}
                                title={`${getClusterTypeName(cluster[0].documentType)} ${cluster[0].documentCode} — ${cluster.length} estudiantes`}
                              >
                                {(() => {
                                  const isDesignacion = cluster[0].documentType === 'DESIGNACION'
                                  return (
                                    <div className="relative" style={{ width: iconSize, height: iconSize * 0.78 }}>
                                      <div className={cn('absolute left-1.5 top-1 w-full h-full rounded-[14px] rotate-2', isDesignacion ? 'bg-violet-100/60' : 'bg-blue-100/60')} />
                                      <div className={cn('absolute inset-0 rounded-[14px] flex items-center justify-center border', isDesignacion ? 'bg-violet-50 text-violet-600 border-violet-100' : 'bg-blue-50 text-blue-400 border-blue-100')}>
                                        {isDesignacion ? (
                                          <UserCheck style={{ width: iconSize * 0.42, height: iconSize * 0.42 }} strokeWidth={1.5} />
                                        ) : (
                                          <FileText style={{ width: iconSize * 0.42, height: iconSize * 0.42 }} strokeWidth={1.5} />
                                        )}
                                      </div>
                                      <span className={cn('absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center', isDesignacion ? 'bg-violet-600' : 'bg-blue-600')}>
                                        {cluster.length}
                                      </span>
                                    </div>
                                  )
                                })()}
                                <span className="text-[11px] font-semibold text-[#111827] text-center leading-tight" style={{ maxWidth: iconSize + 24 }}>
                                  {getClusterTypeName(cluster[0].documentType)}
                                </span>
                                <span className="text-[9.5px] font-mono text-slate-400 truncate" style={{ maxWidth: iconSize + 24 }}>
                                  {cluster[0].documentCode}
                                </span>
                              </div>
                            ) : renderDocCard(cluster[0])
                          })}
                        </div>
                      ) : (
                        // Sangría: los documentos son "hijos" de la empresa
                        <div className="ml-6 border-l-2 border-[#eef2f7]">
                          <AnimatePresence mode="popLayout">
                            {clusterDocs(docs).map(cluster =>
                              cluster.length > 1 ? renderSharedRow(cluster) : renderDocRow(cluster[0])
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {viewMode === 'batches' && (
            <div className="flex flex-col gap-5">
              {/* Descarga de firmados: todos o los lotes seleccionados */}
              {completedBatches.length > 0 && (
                <div className="flex items-center justify-between gap-3 bg-white rounded-[14px] border border-[#eef2f7] shadow-soft px-4 py-3">
                  <span className="text-[12.5px] font-medium text-[#64748b]">
                    {completedBatches.length} lote(s) firmados y publicados.
                    {selectedBatchIds.size > 0 && (
                      <span className="text-[#111827] font-semibold"> {selectedBatchIds.size} seleccionado(s).</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {selectedBatchIds.size > 0 && (
                      <Button
                        onClick={() => handleDownloadSignedZip([...selectedBatchIds])}
                        disabled={downloadingZip}
                        className="h-[34px] gap-1.5 text-[12px] rounded-[10px]"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        ZIP seleccionados ({selectedBatchIds.size})
                      </Button>
                    )}
                    <button
                      onClick={() => handleDownloadSignedZip()}
                      disabled={downloadingZip}
                      className="h-[34px] px-3.5 flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-[#eef2f7] text-[#374151] rounded-[10px] text-[12px] font-semibold transition-colors disabled:opacity-50"
                    >
                      <Archive className="w-3.5 h-3.5 text-emerald-600" />
                      {downloadingZip ? 'Generando ZIP…' : 'ZIP de todos los firmados'}
                    </button>
                  </div>
                </div>
              )}
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
                    Selecciona documentos en la pestaña &quot;Documentos&quot; y presiona &quot;Enviar a firma&quot; para iniciar el circuito Responsable de Prácticas → Decano.
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
                        <div className="flex items-center gap-3 min-w-0">
                          {batch.status === 'COMPLETED' && (
                            <input
                              type="checkbox"
                              checked={selectedBatchIds.has(batch.id)}
                              onChange={() => toggleBatchSelected(batch.id)}
                              className="w-4 h-4 rounded border-slate-300 text-[#111827] focus:ring-[#111827]/20 cursor-pointer shrink-0"
                              title="Seleccionar este lote para el ZIP"
                            />
                          )}
                          <div className="flex flex-col gap-1.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[14px] font-bold text-[#111827] font-mono">{batch.code}</span>
                              <Badge variant={meta.variant} className="text-[10.5px] px-2.5 py-1">{meta.label}</Badge>
                            </div>
                            <span className="text-[11.5px] text-muted-foreground font-medium">
                              {batch.items.length} documento(s)
                              {rejected > 0 && <span className="text-red-500"> · {rejected} rechazado(s)</span>}
                              {/* Quién lo envió: el firmante que abre la lista
                                  necesita saber a quién preguntarle. */}
                              {batch.createdBy && (
                                <> · enviado por {[batch.createdBy.firstName, batch.createdBy.lastName]
                                  .filter(Boolean).join(' ') || batch.createdBy.email}</>
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {batch.status === 'COMPLETED' && (
                            <button
                              onClick={() => handleDownloadSignedZip([batch.id])}
                              disabled={downloadingZip}
                              className="h-[32px] px-3 flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-[9px] text-[11.5px] font-semibold transition-colors disabled:opacity-50"
                              title="Descargar los PDFs firmados de este lote"
                            >
                              <Archive className="w-3.5 h-3.5" />
                              ZIP firmado
                            </button>
                          )}
                          {(batch.status === 'PENDING_DEAN' || batch.status === 'PENDING_DIRECTOR') && (
                            <button
                              onClick={() => handleCancelBatch(batch.id)}
                              className="h-[32px] px-3 flex items-center gap-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-[9px] text-[11.5px] font-semibold transition-colors"
                              title="Anular lote y devolver documentos a estado pendiente"
                            >
                              <X className="w-3.5 h-3.5" />
                              Anular Lote
                            </button>
                          )}
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-wider">
                              Decano {deanSigned}/{active.length} · Responsable {directorSigned}/{active.length}
                            </span>
                            <div className="w-[180px] h-[6px] bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${batch.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                style={{ width: `${batch.status === 'COMPLETED' ? 100 : stagePct}%` }}
                              />
                            </div>
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
                                <span className="text-[10.5px] text-muted-foreground font-mono truncate">
                                  {item.document.documentCode || 'Sin código'}
                                  {item.rejectReason && <span className="text-red-400 font-sans"> — {item.rejectReason}</span>}
                                </span>
                              </div>
                              <Badge variant={badge.variant} className="text-[10px] px-2 py-0.5 rounded-[6px] uppercase tracking-wider shrink-0">
                                {badge.label}
                              </Badge>
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

        </PageContainer>
      </div>

      {/* Invalidate Modal */}
      {showInvalidateModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[20px] shadow-xl w-full max-w-md p-6 border border-[#eef2f7]">
            <h2 className="text-[17px] font-bold text-[#0f172a] mb-2">Invalidar documento</h2>
            <p className="text-[13px] text-[#64748b] mb-4">
              El documento dejará de ser válido para el estudiante. Queda registrado en el historial con la razón que indiques.
            </p>

            {/* Qué se lleva por delante. Anular la designación arrastra la
                solicitud que la precedió, porque pidió el cupo para una
                designación que ya no existe. El certificado no entra: si se
                emitió es porque el acta acreditó la práctica cumplida. */}
            {invalidationImpact && invalidationImpact.cascade.length > 0 && (
              <div className="mb-5 rounded-[12px] border border-amber-200 bg-amber-50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-[12.5px] font-bold text-amber-900">
                    Se anulará también lo que queda sin objeto
                  </span>
                </div>
                <ul className="ml-6 list-disc text-[12.5px] text-amber-800 leading-relaxed">
                  {invalidationImpact.cascade.map((c) => (
                    <li key={c.documentType}>
                      {c.count} {c.nombre}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11.5px] text-amber-700 leading-snug">
                  Un certificado ya emitido no se anula por esta vía: si existe, es porque el acta
                  acreditó la práctica cumplida. Afecta a{' '}
                  {invalidationImpact.students} estudiante{invalidationImpact.students > 1 ? 's' : ''}.
                </p>
              </div>
            )}
            {/* El motivo se elige de una lista (RF-24): con texto libre, cada
                quien escribía lo mismo de otra forma y ningún reporte podía
                agruparlo. La nota queda para lo que la etiqueta no dice. */}
            <label className="block text-[12px] font-semibold text-[#334155] mb-1.5">Motivo</label>
            <Select
              value={invalidateReasonId}
              onChange={(e) => setInvalidateReasonId(e.target.value)}
              className="w-full mb-4"
            >
              <option value="">Elige un motivo…</option>
              {motivos.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </Select>

            <label className="block text-[12px] font-semibold text-[#334155] mb-1.5">
              Nota <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <textarea
              value={invalidateReason}
              onChange={(e) => setInvalidateReason(e.target.value)}
              className="w-full border border-[#cbd5e1] rounded-[12px] px-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none h-20"
              placeholder="Ej: la empresa rechazó a 2 estudiantes."
            />
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="secondary"
                onClick={() => { setShowInvalidateModal(false); setDocToInvalidate(null); setInvalidateReason(''); setInvalidateReasonId('') }}
                className="text-[13px] rounded-[10px]"
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleInvalidate}
                disabled={!invalidateReasonId || invalidating}
                className="text-[13px] rounded-[10px]"
              >
                {invalidating ? 'Invalidando…' : 'Confirmar invalidación'}
              </Button>
            </div>
          </div>
        </div>
      )}
      <DocxPreviewModal
        isOpen={!!docxPreview}
        onClose={() => setDocxPreview(null)}
        url={docxPreview?.url || null}
        title={docxPreview?.title}
      />
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
