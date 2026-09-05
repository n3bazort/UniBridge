'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  PenLine,
  Download,
  Upload,
  FileText,
  CheckCircle2,
  Info,
  History,
  Eye,
} from 'lucide-react'

interface BatchItem {
  id: string
  status: 'PENDING' | 'SIGNED_BY_DIRECTOR' | 'SIGNED_BY_DEAN' | 'SIGNED' | 'REJECTED'
  rejectReason?: string
  document: {
    id: string
    documentCode: string
    documentType: string
    student: { firstName: string; lastName: string }
  }
}

interface SignatureBatch {
  id: string
  code: string
  name?: string
  status: 'PENDING_DEAN' | 'PENDING_DIRECTOR' | 'COMPLETED' | 'CANCELLED'
  createdAt: string
  items: BatchItem[]
}

interface DocFirmado {
  itemId: string
  documentId: string
  documentCode: string
  documentType: string
  student: { firstName: string; lastName: string }
  estadoItem: string
  etapa: 'DIRECTOR' | 'DEAN' | 'FINAL'
  firmadoEl: string
}

interface LoteFirmado {
  batchId: string
  code: string
  name?: string
  status: SignatureBatch['status']
  createdAt: string
  firmadoEl: string
  documentos: DocFirmado[]
}

const ETAPA_LABEL: Record<string, string> = {
  DIRECTOR: 'Firmaste como Responsable',
  DEAN: 'Firmaste como Decano',
  FINAL: 'Firma final',
}

const ESTADO_LOTE: Record<string, { label: string; cls: string }> = {
  PENDING_DIRECTOR: { label: 'Esperando al Responsable', cls: 'text-amber-600 bg-amber-50 border-amber-100' },
  PENDING_DEAN: { label: 'Esperando al Decano', cls: 'text-blue-600 bg-blue-50 border-blue-100' },
  COMPLETED: { label: 'Completado', cls: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  CANCELLED: { label: 'Anulado', cls: 'text-red-600 bg-red-50 border-red-100' },
}

const ITEM_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Pendiente', cls: 'text-amber-600 bg-amber-50 border-amber-100' },
  SIGNED_BY_DIRECTOR: { label: 'Firmado por Responsable', cls: 'text-blue-600 bg-blue-50 border-blue-100' },
  SIGNED_BY_DEAN: { label: 'Firmado por Decano', cls: 'text-blue-600 bg-blue-50 border-blue-100' },
  SIGNED: { label: 'Firmado', cls: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  REJECTED: { label: 'Rechazado', cls: 'text-red-600 bg-red-50 border-red-100' },
}

export default function SignerDashboardPage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const multiInputRef = useRef<HTMLInputElement>(null)
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [dragOverBatchId, setDragOverBatchId] = useState<string | null>(null)
  // Lotes marcados para la descarga combinada. Vacío = «todos los pendientes».
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [dragGlobal, setDragGlobal] = useState(false)
  const [pestana, setPestana] = useState<'pendientes' | 'historial'>('pendientes')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  const { data: batches = [], isLoading } = useQuery<SignatureBatch[]>({
    queryKey: ['signer-pending-batches'],
    queryFn: async () => (await api.get('/signatures/batches/pending')).data,
  })

  /** Lo que esta persona ya firmó, agrupado por lote. Solo se pide al abrir la
      pestaña, porque es una consulta que crece con el tiempo. */
  const { data: historial = [], isLoading: cargandoHistorial } = useQuery<LoteFirmado[]>({
    queryKey: ['signer-signed-history'],
    queryFn: async () => (await api.get('/signatures/batches/signed-by-me')).data,
    enabled: pestana === 'historial',
  })

  const verDocumento = async (batchId: string, itemId: string) => {
    try {
      const { data } = await api.get(`/signatures/batches/${batchId}/items/${itemId}/download`)
      window.open(data.url, '_blank')
    } catch {
      toast.error('No se pudo abrir el documento')
    }
  }

  const alternarLote = (batchId: string) => {
    setAbiertos((prev) => {
      const next = new Set(prev)
      next.has(batchId) ? next.delete(batchId) : next.add(batchId)
      return next
    })
  }

  const uploadMutation = useMutation({
    mutationFn: async ({ batchId, files }: { batchId: string; files: File[] }) => {
      const formData = new FormData()
      files.forEach((f) => formData.append('files', f))
      const res = await api.post(`/signatures/batches/${batchId}/upload`, formData)
      return res.data
    },
    onSuccess: (data) => {
      if (data.failed > 0) {
        const errors = data.results.filter((r: any) => !r.ok)
        errors.slice(0, 3).forEach((e: any) => toast.error(`${e.file}: ${e.error}`))
        toast.warning(`${data.uploaded} archivo(s) aceptado(s), ${data.failed} con errores`)
      } else {
        toast.success(`${data.uploaded} documento(s) firmados subidos y verificados`)
      }
      if (data.batchStatus === 'PENDING_DEAN') toast.info('Lote completo: pasa al Decano de la Facultad para la segunda firma')
      if (data.batchStatus === 'COMPLETED') toast.success('Lote completado: documentos publicados a los estudiantes')
      queryClient.invalidateQueries({ queryKey: ['signer-pending-batches'] })
      queryClient.invalidateQueries({ queryKey: ['signer-signed-history'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Error al subir archivos'),
  })

  /**
   * Subida en bloque: los archivos van sin decir a qué lote pertenecen y el
   * servidor los encamina por el código que llevan en el nombre. Evita tener
   * que separarlos a mano cuando se firman varios lotes de una sentada.
   */
  const uploadMultiMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData()
      files.forEach((f) => formData.append('files', f))
      return (await api.post('/signatures/upload-signed', formData)).data
    },
    onSuccess: (data) => {
      if (data.failed > 0) {
        const errores = data.results.filter((r: any) => !r.ok)
        errores.slice(0, 3).forEach((e: any) => toast.error(`${e.file}: ${e.error}`))
        toast.warning(`${data.uploaded} archivo(s) aceptado(s), ${data.failed} sin subir`)
      } else {
        toast.success(`${data.uploaded} documento(s) firmados subidos y verificados`)
      }
      for (const b of data.batches || []) {
        if (b.status === 'PENDING_DEAN') toast.info(`${b.batchCode} completo: pasa al Decano para la segunda firma`)
        if (b.status === 'COMPLETED') toast.success(`${b.batchCode} completado: documentos publicados`)
      }
      queryClient.invalidateQueries({ queryKey: ['signer-pending-batches'] })
      queryClient.invalidateQueries({ queryKey: ['signer-signed-history'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Error al subir archivos'),
  })

  const descargarBlob = (blob: Blob, nombre: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Un único ZIP con los lotes marcados o, si no hay ninguno, con todos. */
  const handleDownloadVarios = async () => {
    const ids = [...seleccionados]
    const cuantos = ids.length || batches.length
    setDownloading('multi')
    try {
      const res = await api.get('/signatures/batches/pending-zip', {
        params: ids.length ? { ids: ids.join(',') } : undefined,
        responseType: 'blob',
      })
      descargarBlob(res.data, cuantos === 1 ? 'lote.zip' : `lotes-pendientes-${cuantos}.zip`)
      toast.success(
        `${cuantos} lote(s) en un solo ZIP. Fírmalos con FirmaEC y súbelos todos juntos aquí.`,
      )
    } catch {
      toast.error('Error al descargar los lotes')
    } finally {
      setDownloading(null)
    }
  }

  const alternarSeleccion = (batchId: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      next.has(batchId) ? next.delete(batchId) : next.add(batchId)
      return next
    })
  }

  const handleDownloadZip = async (batch: SignatureBatch) => {
    setDownloading(batch.id)
    try {
      const res = await api.get(`/signatures/batches/${batch.id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `${batch.code}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('ZIP descargado. Firma los PDFs con FirmaEC y súbelos aquí.')
    } catch {
      toast.error('Error al descargar el lote')
    } finally {
      setDownloading(null)
    }
  }

  const handleUploadClick = (batchId: string) => {
    setActiveBatchId(batchId)
    fileInputRef.current?.click()
  }

  const onFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length && activeBatchId) {
      const filesArray = Array.from(e.target.files)
      uploadMutation.mutate({ batchId: activeBatchId, files: filesArray })
    }
    e.target.value = ''
  }

  const handleDragOver = (e: React.DragEvent, batchId: string) => {
    e.preventDefault()
    setDragOverBatchId(batchId)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOverBatchId(null)
  }

  const handleDrop = (e: React.DragEvent, batchId: string) => {
    e.preventDefault()
    setDragOverBatchId(null)
    if (e.dataTransfer.files?.length) {
      const filesArray = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf')
      if (filesArray.length > 0) {
        uploadMutation.mutate({ batchId, files: filesArray })
      } else {
        toast.error('Solo se permiten archivos PDF.')
      }
    }
  }

  return (
    <RoleGate allowedRoles={['SIGNER']}>
      <div className="flex flex-col w-full flex-1">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={onFilesSelected}
        />
        {/* Selector para la subida en bloque: no lleva lote asociado, el
            servidor deduce el destino de cada archivo por su código. */}
        <input
          ref={multiInputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) uploadMultiMutation.mutate(Array.from(e.target.files))
            e.target.value = ''
          }}
        />

        <PageContainer variant="wide" className="flex flex-col gap-6">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-[#eef2f7]">
            <PageHeader
              description={
                pestana === 'pendientes'
                  ? 'Descarga el lote, fírmalo con FirmaEC y vuelve a subirlo. El sistema verifica cada firma automáticamente.'
                  : 'Los documentos que ya suscribiste, agrupados por lote.'
              }
            />

            {/* Pestañas: lo pendiente y lo ya firmado son dos lecturas distintas
                del mismo trabajo, y mezclarlas obligaba a recordar qué lote ya
                se había atendido. */}
            <div className="flex items-center gap-1 bg-[#f1f3f5] rounded-[10px] p-1 shrink-0">
              <button
                onClick={() => setPestana('pendientes')}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-1.5 rounded-[8px] text-[13px] font-semibold transition-colors',
                  pestana === 'pendientes' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#64748b] hover:text-[#111827]',
                )}
              >
                <PenLine className="w-3.5 h-3.5" />
                Pendientes
                {batches.length > 0 && (
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 rounded-full">
                    {batches.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setPestana('historial')}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-1.5 rounded-[8px] text-[13px] font-semibold transition-colors',
                  pestana === 'historial' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#64748b] hover:text-[#111827]',
                )}
              >
                <History className="w-3.5 h-3.5" />
                Historial
              </button>
            </div>
          </div>

          {pestana === 'historial' ? (
            cargandoHistorial ? (
              <div className="bg-white rounded-[18px] border border-[#eef2f7] shadow-soft flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
                <span className="text-[13px] font-medium text-slate-500">Cargando tu historial...</span>
              </div>
            ) : historial.length === 0 ? (
              <div className="bg-white rounded-[18px] border border-[#eef2f7] shadow-soft flex flex-col items-center justify-center py-20 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                  <History className="w-6 h-6 text-slate-400" />
                </div>
                <h3 className="text-[15px] font-bold text-slate-700">Todavía no has firmado documentos</h3>
                <p className="text-[13px] text-slate-400 mt-1 max-w-[380px]">
                  Cuando suscribas un lote quedará aquí, con su fecha y los documentos que amparaba.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {historial.map((lote) => {
                  const estado = ESTADO_LOTE[lote.status] || ESTADO_LOTE.PENDING_DIRECTOR
                  const abierto = abiertos.has(lote.batchId)
                  return (
                    <div key={lote.batchId} className="bg-white rounded-[16px] border border-[#eef2f7] shadow-soft overflow-hidden">
                      <button
                        onClick={() => alternarLote(lote.batchId)}
                        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50/70 transition-colors text-left"
                      >
                        <div className="w-9 h-9 rounded-[10px] bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[14px] font-bold text-[#111827] truncate">{lote.name || lote.code}</span>
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-[6px] uppercase tracking-wider shrink-0">
                              {lote.code}
                            </span>
                          </div>
                          <span className="text-[12px] text-muted-foreground font-medium mt-0.5">
                            {lote.documentos.length} documento(s) &middot; {ETAPA_LABEL[lote.documentos[0]?.etapa] || 'Firmado'} el{' '}
                            {new Date(lote.firmadoEl).toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })}
                          </span>
                        </div>
                        <span className={cn('text-[11px] font-bold px-2.5 py-1 rounded-full border shrink-0', estado.cls)}>
                          {estado.label}
                        </span>
                      </button>

                      {abierto && (
                        <div className="border-t border-[#f3f4f6]">
                          {lote.documentos.map((doc) => {
                            const badge = ITEM_STATUS_BADGE[doc.estadoItem] || ITEM_STATUS_BADGE.PENDING
                            return (
                              <div
                                key={doc.itemId}
                                className="flex items-center gap-3 px-5 py-3 border-b border-[#f3f4f6] last:border-0 hover:bg-slate-50/70 transition-colors"
                              >
                                <div className="w-8 h-8 rounded-[9px] bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div className="flex flex-col min-w-0 flex-1">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[13px] font-semibold text-[#111827] truncate">
                                      {doc.student?.firstName} {doc.student?.lastName}
                                    </span>
                                    <span className="text-[10.5px] font-bold text-slate-400 font-mono shrink-0">
                                      {doc.documentCode}
                                    </span>
                                  </div>
                                  <span className="text-[11.5px] text-muted-foreground">
                                    {new Date(doc.firmadoEl).toLocaleString('es-EC', {
                                      day: '2-digit', month: '2-digit', year: 'numeric',
                                      hour: '2-digit', minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                                <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0', badge.cls)}>
                                  {badge.label}
                                </span>
                                <button
                                  onClick={() => verDocumento(lote.batchId, doc.itemId)}
                                  className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors shrink-0"
                                  title="Ver el documento firmado"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          ) : isLoading ? (
            <div className="bg-white rounded-[18px] border border-[#eef2f7] shadow-soft flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
              <span className="text-[13px] font-medium text-slate-500">Cargando lotes de firma...</span>
            </div>
          ) : batches.length === 0 ? (
            <div className="bg-white rounded-[18px] border border-[#eef2f7] shadow-soft flex flex-col items-center justify-center py-20 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              </div>
              <h3 className="text-[15px] font-bold text-slate-700">No tienes documentos pendientes de firma</h3>
              <p className="text-[13px] text-slate-400 mt-1 max-w-[360px]">
                Cuando coordinación envíe un lote al circuito de firma, aparecerá aquí.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">

              {/* Barra de trabajo por lotes. Con más de un lote pendiente, ir de
                  uno en uno es puro trámite: aquí se bajan juntos y se devuelven
                  juntos, y cada archivo encuentra su lote por su código. */}
              {batches.length > 1 && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragGlobal(true) }}
                  onDragLeave={(e) => { e.preventDefault(); setDragGlobal(false) }}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragGlobal(false)
                    const pdfs = Array.from(e.dataTransfer.files).filter((f) => f.type === 'application/pdf')
                    if (pdfs.length) uploadMultiMutation.mutate(pdfs)
                    else toast.error('Solo se permiten archivos PDF.')
                  }}
                  className={cn(
                    'bg-white rounded-[18px] border shadow-soft px-5 py-4 flex flex-col md:flex-row md:items-center gap-4 transition-colors',
                    dragGlobal ? 'border-blue-400 bg-blue-50/60' : 'border-[#eef2f7]',
                  )}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[14px] font-bold text-[#111827]">
                      {seleccionados.size > 0
                        ? `${seleccionados.size} lote(s) seleccionado(s)`
                        : `Tienes ${batches.length} lotes pendientes`}
                    </span>
                    <span className="text-[12.5px] text-[#6b7280]">
                      {dragGlobal
                        ? 'Suelta aquí: cada documento irá a su lote'
                        : 'Descárgalos en un solo ZIP y, al terminar de firmar, suéltalos todos aquí sin separarlos.'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {seleccionados.size > 0 && (
                      <Button
                        variant="ghost"
                        onClick={() => setSeleccionados(new Set())}
                        className="text-[13px] rounded-[10px]"
                      >
                        Quitar selección
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={handleDownloadVarios}
                      disabled={downloading === 'multi'}
                      className="text-[13px] rounded-[10px] gap-2"
                    >
                      <Download className="w-4 h-4" />
                      {downloading === 'multi'
                        ? 'Preparando...'
                        : seleccionados.size > 0
                        ? `Descargar ${seleccionados.size} en un ZIP`
                        : 'Descargar todos en un ZIP'}
                    </Button>
                    <Button
                      onClick={() => multiInputRef.current?.click()}
                      disabled={uploadMultiMutation.isPending}
                      className="text-[13px] rounded-[10px] gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      {uploadMultiMutation.isPending ? 'Subiendo...' : 'Subir firmados'}
                    </Button>
                  </div>
                </div>
              )}

              {batches.map((batch) => {
                const active = batch.items.filter((i) => i.status !== 'REJECTED')
                const done = active.filter((i) => i.status === 'SIGNED' || (batch.status === 'PENDING_DEAN' && i.status === 'SIGNED_BY_DEAN')).length
                return (
                  <div 
                    key={batch.id} 
                    className="relative bg-white rounded-[18px] border border-[#eef2f7] shadow-soft overflow-hidden"
                    onDragOver={(e) => handleDragOver(e, batch.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, batch.id)}
                  >
                    {dragOverBatchId === batch.id && (
                      <div className="absolute inset-0 z-50 bg-blue-50/90 border-2 border-dashed border-blue-400 rounded-[18px] flex flex-col items-center justify-center pointer-events-none transition-all">
                        <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-3">
                          <Upload className="w-8 h-8 text-blue-600 animate-bounce" />
                        </div>
                        <h3 className="text-[18px] font-bold text-blue-900">Suelta los PDF firmados aquí</h3>
                        <p className="text-[14px] text-blue-700 mt-1">Para subirlos al {batch.code}</p>
                      </div>
                    )}
                    {/* Card header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-6 py-4 border-b border-[#f3f4f6]">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          {batches.length > 1 && (
                            <input
                              type="checkbox"
                              checked={seleccionados.has(batch.id)}
                              onChange={() => alternarSeleccion(batch.id)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                              title="Incluir este lote en la descarga combinada"
                            />
                          )}
                          <span className="text-[15px] font-bold text-[#111827]">{batch.name || batch.code}</span>
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-[6px] uppercase tracking-wider">{batch.code}</span>
                        </div>
                        <span className="text-[12px] text-muted-foreground font-medium mt-0.5">
                          {batch.items.length} documento(s) · firmados {done}/{active.length} · {new Date(batch.createdAt).toLocaleDateString('es-ES')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() => handleDownloadZip(batch)}
                          disabled={downloading === batch.id}
                          className="h-[38px] gap-2 text-[13px] rounded-[10px] shadow-sm"
                        >
                          {downloading === batch.id
                            ? <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
                            : <Download className="w-4 h-4" />}
                          Descargar ZIP
                        </Button>
                        <Button
                          onClick={() => handleUploadClick(batch.id)}
                          disabled={uploadMutation.isPending}
                          className="h-[38px] gap-2 text-[13px] rounded-[10px] shadow-sm"
                        >
                          {uploadMutation.isPending && activeBatchId === batch.id
                            ? <div className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-white animate-spin" />
                            : <Upload className="w-4 h-4" />}
                          Subir Firmados
                        </Button>
                      </div>
                    </div>

                    {/* Items */}
                    <div className="divide-y divide-[#f3f4f6]">
                      {batch.items.map((item) => {
                        const badge = ITEM_STATUS_BADGE[item.status]
                        return (
                          <div key={item.id} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50/70 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-[10px] bg-[#f8fafc] border border-[#eef2f7] flex items-center justify-center shrink-0">
                                <FileText className="w-4 h-4 text-muted-foreground" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[13px] font-semibold text-[#111827] truncate leading-snug">
                                  {item.document.documentCode || 'Sin código'} · {item.document.documentType}
                                </span>
                                <span className="text-[11px] text-muted-foreground tracking-wide mt-0.5 truncate">
                                  {item.document.student.lastName} {item.document.student.firstName}
                                  {item.rejectReason && <span className="text-red-400"> — {item.rejectReason}</span>}
                                </span>
                              </div>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-[6px] uppercase tracking-wider border shrink-0 ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {/* Footer note */}
                    <div className="flex items-start gap-2 px-6 py-3.5 bg-slate-50 border-t border-[#eef2f7]">
                      <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-[12px] text-[#6b7280] leading-relaxed">
                        No cambies el nombre de los archivos al firmarlos: el código (ej. CERT-2026-1-00001) se usa
                        para emparejar cada PDF con su documento. FirmaEC puede añadir el sufijo &quot;-signed&quot; sin problema.
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </PageContainer>
      </div>

    </RoleGate>
  )
}
