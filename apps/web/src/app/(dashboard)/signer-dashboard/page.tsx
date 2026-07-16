'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { toast } from 'sonner'
import {
  PenLine,
  Download,
  Upload,
  FileText,
  CheckCircle2,
  Info,
} from 'lucide-react'

interface BatchItem {
  id: string
  status: 'PENDING' | 'SIGNED_BY_DEAN' | 'SIGNED' | 'REJECTED'
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

const ITEM_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Pendiente', cls: 'text-amber-600 bg-amber-50 border-amber-100' },
  SIGNED_BY_DEAN: { label: 'Firmado por Decano', cls: 'text-blue-600 bg-blue-50 border-blue-100' },
  SIGNED: { label: 'Firmado', cls: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  REJECTED: { label: 'Rechazado', cls: 'text-red-600 bg-red-50 border-red-100' },
}

export default function SignerDashboardPage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  const { data: batches = [], isLoading } = useQuery<SignatureBatch[]>({
    queryKey: ['signer-pending-batches'],
    queryFn: async () => (await api.get('/signatures/batches/pending')).data,
  })

  const uploadMutation = useMutation({
    mutationFn: async ({ batchId, files }: { batchId: string; files: FileList }) => {
      const formData = new FormData()
      Array.from(files).forEach((f) => formData.append('files', f))
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
      if (data.batchStatus === 'PENDING_DIRECTOR') toast.info('Lote completo: pasa al Director para la segunda firma')
      if (data.batchStatus === 'COMPLETED') toast.success('Lote completado: documentos publicados a los estudiantes')
      queryClient.invalidateQueries({ queryKey: ['signer-pending-batches'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Error al subir archivos'),
  })

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
      uploadMutation.mutate({ batchId: activeBatchId, files: e.target.files })
    }
    e.target.value = ''
  }

  return (
    <RoleGate allowedRoles={['SIGNER']}>
      <div className="flex flex-col w-full min-h-[calc(100vh-72px)] bg-[#f7f7f8] pt-6 pb-12 px-4 lg:px-8">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={onFilesSelected}
        />

        <div className="w-full max-w-[1400px] mx-auto flex flex-col gap-6">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-[#eef2f7]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[12px] bg-white border border-[#eef2f7] flex items-center justify-center text-[#111827] shadow-sm">
                <PenLine className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-[20px] font-bold text-[#111827]">Documentos Pendientes de Firma</h1>
                <p className="text-[13px] text-[#6b7280]">
                  Descarga el lote, firma los PDF con FirmaEC y vuelve a subirlos. El sistema verifica cada firma automáticamente.
                </p>
              </div>
            </div>
          </div>

          {isLoading ? (
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
              {batches.map((batch) => {
                const active = batch.items.filter((i) => i.status !== 'REJECTED')
                const done = active.filter((i) => i.status === 'SIGNED' || (batch.status === 'PENDING_DEAN' && i.status === 'SIGNED_BY_DEAN')).length
                return (
                  <div key={batch.id} className="bg-white rounded-[18px] border border-[#eef2f7] shadow-soft overflow-hidden">
                    {/* Card header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-6 py-4 border-b border-[#f3f4f6]">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-bold text-[#111827]">{batch.name || batch.code}</span>
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-[6px] uppercase tracking-wider">{batch.code}</span>
                        </div>
                        <span className="text-[12px] text-[#9ca3af] font-medium mt-0.5">
                          {batch.items.length} documento(s) · firmados {done}/{active.length} · {new Date(batch.createdAt).toLocaleDateString('es-ES')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDownloadZip(batch)}
                          disabled={downloading === batch.id}
                          className="flex items-center gap-2 h-[38px] px-4 bg-white hover:bg-slate-50 border border-[#eef2f7] rounded-[10px] text-[13px] font-semibold text-[#475569] shadow-sm transition-colors disabled:opacity-60"
                        >
                          {downloading === batch.id
                            ? <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
                            : <Download className="w-4 h-4" />}
                          Descargar ZIP
                        </button>
                        <button
                          onClick={() => handleUploadClick(batch.id)}
                          disabled={uploadMutation.isPending}
                          className="flex items-center gap-2 h-[38px] px-4 bg-[#111827] hover:bg-[#1f2937] rounded-[10px] text-[13px] font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
                        >
                          {uploadMutation.isPending && activeBatchId === batch.id
                            ? <div className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-white animate-spin" />
                            : <Upload className="w-4 h-4" />}
                          Subir Firmados
                        </button>
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
                                <FileText className="w-4 h-4 text-[#9ca3af]" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[13px] font-semibold text-[#111827] truncate leading-snug">
                                  {item.document.documentCode || 'Sin código'} · {item.document.documentType}
                                </span>
                                <span className="text-[11px] text-[#9ca3af] tracking-wide mt-0.5 truncate">
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
                      <Info className="w-3.5 h-3.5 text-[#9ca3af] mt-0.5 shrink-0" />
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
        </div>
      </div>
    </RoleGate>
  )
}
