'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Stage, Layer, Text as KonvaText, Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth-store'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, Hash } from 'lucide-react'
import { getAssetUrl } from '@/lib/utils'
import { DocxPreviewModal } from '@/components/shared/DocxPreviewModal'

interface DocumentTemplate {
  id: string
  name: string
  type: string
  content: any
  createdAt: string
}

// Global variable for default name
const DEFAULT_TEMPLATE_NAME = 'Certificado de Prácticas Oficial'

/**
 * Los dos oficios en Word que emite la Facultad. Cada uno tiene su plantilla,
 * su numeración y su predeterminada: son documentos distintos que se emiten en
 * momentos distintos del trámite.
 */
type OficioKind = 'SOLICITUD' | 'DESIGNACION'

const OFICIOS: Record<OficioKind, {
  titulo: string
  descripcion: string
  ejemplo: string
  patron: string
  color: string
}> = {
  SOLICITUD: {
    titulo: 'Solicitud de prácticas',
    descripcion: 'Pide a la empresa la apertura de vacantes para el grupo de estudiantes.',
    ejemplo: 'Solicitud de Prácticas Oficial.docx',
    patron: '{YYYY}-{PROGRAM}-{SEQ:3}',
    color: 'blue',
  },
  DESIGNACION: {
    titulo: 'Designación de estudiantes',
    descripcion: 'Comunica a la empresa qué estudiantes fueron designados y quién los tutela.',
    ejemplo: 'Designación de Estudiantes Oficial.docx',
    patron: '{SEQ:3}-{FACULTY}-{PERIOD}-{PROGRAM}',
    color: 'violet',
  },
}

/** Tipo de oficio de una plantilla. Las antiguas no lo declaran: son solicitudes. */
const kindOf = (t: DocumentTemplate): OficioKind =>
  (typeof t.content === 'object' && t.content?.kind === 'DESIGNACION') ? 'DESIGNACION' : 'SOLICITUD'

/**
 * A cuántos estudiantes ampara un mismo papel. Por defecto uno por empresa, que
 * es como emite hoy la Facultad.
 */
type OficioScope = 'GRUPO' | 'ESTUDIANTE'

const ALCANCES: Record<OficioScope, { titulo: string; detalle: string }> = {
  GRUPO: {
    titulo: 'Uno por empresa',
    detalle: 'Un solo oficio con una fila por estudiante. Menos papel y una sola firma.',
  },
  ESTUDIANTE: {
    titulo: 'Uno por estudiante',
    detalle: 'Un oficio por cada estudiante, cada uno con su propio número de secuencia.',
  },
}

const scopeOf = (t: DocumentTemplate): OficioScope =>
  (typeof t.content === 'object' && t.content?.scope === 'ESTUDIANTE') ? 'ESTUDIANTE' : 'GRUPO'

/**
 * Resuelve un patrón de numeración con datos de muestra, igual que lo hace el
 * servidor al emitir. Sirve para que quien edita el patrón vea el resultado sin
 * tener que generar un oficio de prueba.
 */
interface DocumentSequenceItem {
  type: OficioKind
  periodCode: string
  lastNumber: number
  nextNumber: number
}

function SequenceControlCard({
  kind,
  sequence,
  onSave,
}: {
  kind: OficioKind
  sequence?: DocumentSequenceItem
  onSave: (kind: OficioKind, nextNum: number) => Promise<void>
}) {
  const info = OFICIOS[kind]
  const [val, setVal] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)

  const currentNext = sequence ? sequence.nextNumber : 1

  useEffect(() => {
    setVal(String(currentNext))
  }, [currentNext])

  const handleSave = async () => {
    const num = parseInt(val, 10)
    if (isNaN(num) || num < 1) {
      toast.error('Ingresa un número válido mayor a 0')
      return
    }
    setIsSaving(true)
    try {
      await onSave(kind, num)
      toast.success(`Numeración para ${info.titulo.toLowerCase()} actualizada. Próximo oficio: ${String(num).padStart(3, '0')}`)
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al actualizar numeración')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={`p-4 rounded-[16px] border bg-white flex flex-col justify-between gap-3 shadow-sm ${
      kind === 'SOLICITUD' ? 'border-blue-100' : 'border-violet-100'
    }`}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
            kind === 'SOLICITUD' ? 'bg-blue-50 text-blue-700 border border-blue-200/50' : 'bg-violet-50 text-violet-700 border border-violet-200/50'
          }`}>
            {info.titulo}
          </span>
          <span className="text-[11px] text-slate-400 font-mono font-medium">Periodo {sequence?.periodCode || '2026-1'}</span>
        </div>
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-[12.5px] text-slate-500 font-medium">Último oficio emitido:</span>
          <span className="text-[14px] font-bold text-slate-800 font-mono">
            {sequence?.lastNumber ? String(sequence.lastNumber).padStart(3, '0') : 'Ninguno (000)'}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 pt-2.5 border-t border-slate-100">
        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
          Próximo número a emitir:
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="w-24 h-9 px-3 bg-slate-50 border border-slate-200 rounded-[10px] text-[13px] font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || parseInt(val, 10) === currentNext}
            className={`h-9 px-3 text-[12px] rounded-[10px] gap-1.5 ${
              kind === 'SOLICITUD' ? 'bg-[#111827] hover:bg-[#1f2937]' : 'bg-violet-600 hover:bg-violet-700'
            }`}
          >
            {isSaving ? 'Guardando...' : 'Retomar numeración'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function vistaPreviaCodigo(patron: string, docTypeAbbr: string, numEjemplo = 17): string {
  const muestra: Record<string, string> = {
    YYYY: String(new Date().getFullYear()),
    YY: String(new Date().getFullYear()).slice(-2),
    PERIOD: '2026-1',
    PROGRAM: 'TI',
    FACULTY: 'FCVT',
    TYPE: docTypeAbbr || 'SPP',
  }
  return patron.replace(/\{(\w+)(?::(\d+))?\}/g, (literal, token: string, digitos?: string) => {
    const clave = token.toUpperCase()
    if (clave === 'SEQ') return String(numEjemplo).padStart(Number(digitos ?? 3), '0')
    return muestra[clave] ?? literal
  })
}

export default function DocumentsPage() {
  const router = useRouter()

  const { data: templates, isLoading } = useQuery({
    queryKey: ['document-templates'],
    queryFn: async () => {
      const res = await api.get<DocumentTemplate[]>('/document-templates')
      return res.data
    }
  })

  const { data: sequences = [] } = useQuery<DocumentSequenceItem[]>({
    queryKey: ['document-sequences'],
    queryFn: async () => (await api.get('/document-templates/sequences')).data,
  })

  const handleSaveSequence = async (type: OficioKind, nextNum: number) => {
    await api.patch('/document-templates/sequences', { type, nextNumber: nextNum })
    queryClient.invalidateQueries({ queryKey: ['document-sequences'] })
    queryClient.invalidateQueries({ queryKey: ['document-templates'] })
  }

  const queryClient = useQueryClient()
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, template: DocumentTemplate } | null>(null)
  const [deleteModal, setDeleteModal] = useState<{ show: boolean, templateId: string | null }>({ show: false, templateId: null })
  const [renameModal, setRenameModal] = useState<{ show: boolean, templateId: string | null, currentName: string }>({ show: false, templateId: null, currentName: '' })
  const [newName, setNewName] = useState('')
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  /** Para qué oficio se está subiendo la plantilla que se acaba de elegir */
  const [uploadKind, setUploadKind] = useState<OficioKind>('SOLICITUD')

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setDeleteModal({ show: true, templateId: id })
    setContextMenu(null)
  }

  const confirmDelete = async () => {
    if (!deleteModal.templateId) return
    try {
      await api.delete(`/document-templates/${deleteModal.templateId}`)
      queryClient.invalidateQueries({ queryKey: ['document-templates'] })
    } catch (error) {
      console.error('Error deleting template:', error)
      alert('Error al eliminar la plantilla')
    } finally {
      setDeleteModal({ show: false, templateId: null })
    }
  }

  const handleRenameClick = (id: string, name: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setNewName(name)
    setRenameModal({ show: true, templateId: id, currentName: name })
  }

  const confirmRename = async () => {
    if (!renameModal.templateId || !newName.trim()) return
    try {
      await api.patch(`/document-templates/${renameModal.templateId}/rename`, { name: newName.trim() })
      queryClient.invalidateQueries({ queryKey: ['document-templates'] })
    } catch (error) {
      console.error('Error renaming template:', error)
      alert('Error al renombrar la plantilla')
    } finally {
      setRenameModal({ show: false, templateId: null, currentName: '' })
    }
  }

  /**
   * El backend garantiza atómicamente que solo exista UNA predeterminada por
   * tipo (PDF/DOCX): marca esta y desmarca todas las demás en una transacción.
   */
  const handleMakeDefault = async (template: DocumentTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.patch(`/document-templates/${template.id}/set-default`)
      queryClient.invalidateQueries({ queryKey: ['document-templates'] })
    } catch (error) {
      console.error('Error updating default template:', error)
      alert('Error al actualizar la plantilla predeterminada')
    }
  }

  // ── Numeración del oficio DOCX ──
  const [codeModal, setCodeModal] = useState<{ show: boolean, template: DocumentTemplate | null }>({ show: false, template: null })
  const [docTypeAbbr, setDocTypeAbbr] = useState('')
  const [codeSuffix, setCodeSuffix] = useState('')
  const [periodCertModal, setPeriodCertModal] = useState(false)
  const [massPeriod, setMassPeriod] = useState('')
  const [massProgram, setMassProgram] = useState('ALL')
  
  const [previewTemplate, setPreviewTemplate] = useState<{ url: string, title: string } | null>(null)
  /** Vacío = usa el patrón que el sistema trae para ese formato */
  const [codePattern, setCodePattern] = useState('')
  /** A cuantos estudiantes ampara un mismo papel */
  const [codeScope, setCodeScope] = useState<OficioScope>('GRUPO')

  const openCodeModal = (template: DocumentTemplate) => {
    const c = typeof template.content === 'object' && template.content !== null ? template.content : {}
    setDocTypeAbbr(c.docTypeAbbr || 'SPP')
    setCodeSuffix(c.codeSuffix || '')
    setCodePattern(c.codePattern || '')
    setCodeScope(c.scope === 'ESTUDIANTE' ? 'ESTUDIANTE' : 'GRUPO')
    setCodeModal({ show: true, template })
  }

  /** Descarga la plantilla original: DOCX = archivo Word; PDF = diseño JSON. */
  const handleDownloadTemplate = async (template: DocumentTemplate, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      const { data } = await api.get(`/document-templates/${template.id}/download`)
      if (data.kind === 'url') {
        // La URL prefirmada ya trae Content-Disposition attachment
        const a = document.createElement('a')
        a.href = data.url
        a.download = data.filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } else {
        const blob = new Blob([JSON.stringify(data.content, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = data.filename
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'No se pudo descargar la plantilla')
    }
  }

  const handlePreviewTemplate = async (template: DocumentTemplate, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      const { data } = await api.get(`/document-templates/${template.id}/download`)
      if (data.kind === 'url') {
        setPreviewTemplate({ url: data.url, title: template.name })
      } else {
        toast.error('Solo las plantillas de Word (.docx) pueden previsualizarse aquí.')
      }
    } catch (err: any) {
      toast.error('No se pudo cargar la previsualización')
    }
  }

  const saveCodeConfig = async () => {
    if (!codeModal.template) return
    try {
      await api.patch(`/document-templates/${codeModal.template.id}/docx-config`, {
        docTypeAbbr,
        codeSuffix,
        codePattern: codePattern.trim(),
        scope: codeScope,
      })
      queryClient.invalidateQueries({ queryKey: ['document-templates'] })
      setCodeModal({ show: false, template: null })
    } catch (error) {
      console.error('Error guardando numeración:', error)
      alert('Error al guardar la numeración')
    }
  }

  const handleDocxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.docx')) {
      alert('Solo se permiten archivos .docx')
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', file.name.replace('.docx', ''))
      // De qué oficio es la plantilla: sin esto el sistema no sabría cuál usar
      // al emitir, y podría imprimir el cuerpo equivocado.
      formData.append('kind', uploadKind)
      // facultyId will be taken from token in backend

      await api.post('/document-templates/docx', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      queryClient.invalidateQueries({ queryKey: ['document-templates'] })
      alert(`Plantilla de ${OFICIOS[uploadKind].titulo.toLowerCase()} subida exitosamente`)
    } catch (error) {
      console.error('Error uploading DOCX:', error)
      const errorMessage = (error as any)?.response?.data?.message || 'Error desconocido al subir el archivo.'
      alert(`Error: ${errorMessage}`)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const pdfTemplates = templates?.filter(t => t.type === 'PDF') || []
  const docxTemplates = templates?.filter(t => t.type === 'DOCX') || []

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <div className="flex flex-col w-full min-h-[calc(100vh-72px)] bg-[#f7f7f8] pt-6 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-6xl mx-auto flex flex-col gap-8">
          
          <div>
            <h1 className="text-[22px] font-bold text-[#111827]">Gestión de Plantillas y Documentos</h1>
            <p className="text-[#6b7280] mt-0.5 text-[14px] font-medium">Gestiona los diseños de certificados PDF, las plantillas de oficios DOCX y su correlativo de numeración.</p>
          </div>

          {/* Sección de Control de Numeración / Retoma de Secuencia */}
          <div className="flex flex-col gap-4 bg-white p-5 rounded-[18px] border border-[#eef2f7] shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#f3f4f6]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-[10px] bg-slate-100 flex items-center justify-center text-slate-700">
                  <Hash className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-[#111827]">Control de Numeración y Retoma de Secuencia</h2>
                  <p className="text-[12.5px] text-[#6b7280]">Configura el número correlativo desde el cual se continuará numerando cada oficio en el periodo académico actual.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
              {(Object.keys(OFICIOS) as OficioKind[]).map((kind) => {
                const seq = sequences.find(s => s.type === kind)
                return (
                  <SequenceControlCard
                    key={kind}
                    kind={kind}
                    sequence={seq}
                    onSave={handleSaveSequence}
                  />
                )
              })}
            </div>
          </div>

          {/* Sección de Certificados PDF */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-[20px] font-semibold text-[#111827]">Certificados PDF (Diseños Visuales)</h2>
              <a 
                href="/templates/Certificado Real.png" 
                download="Certificado Real.png"
                title="Descargar plantilla de ejemplo"
                className="flex items-center justify-center w-8 h-8 rounded-[10px] text-[#9ca3af] hover:text-[#111827] hover:bg-white border border-transparent hover:border-[#eef2f7] hover:shadow-sm transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </a>
            </div>
            
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {[1,2,3,4].map(i => <Skeleton key={i} className="min-h-[220px] rounded-[16px] bg-white border border-[#eef2f7]" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                
                {/* Tarjeta: Crear Nuevo Diseño */}
                <button
                  onClick={() => router.push('/documents/designer')}
                  className="group flex flex-col items-center justify-center gap-3 min-h-[220px] rounded-[16px] border border-dashed border-[#d1d5db] bg-white/50 hover:bg-white hover:border-[#9ca3af] hover:shadow-soft transition-all duration-200 cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-full bg-[#f3f4f6] group-hover:bg-[#eef2f7] flex items-center justify-center transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#6b7280] group-hover:text-[#374151]">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-semibold text-[#374151] text-[14px]">Crear Nuevo Diseño</span>
                    <span className="text-[12px] font-medium text-[#9ca3af]">Editor visual interactivo</span>
                  </div>
                </button>

              {/* Tarjetas de Diseños Guardados */}
              {pdfTemplates.map((template) => {
                // Única fuente de verdad: el flag isDefault (el backend garantiza que sea uno solo)
                const isDefault = template.content?.isDefault === true;
                return (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    isDefault={isDefault}
                    onClick={() => router.push(`/documents/designer?templateId=${template.id}`)}
                    onDelete={handleDelete}
                    onMakeDefault={(e) => handleMakeDefault(template, e)}
                    onDownload={(e) => handleDownloadTemplate(template, e)}
                    onRename={handleRenameClick}
                  />
                );
              })}
            </div>
          )}
        </div>

          {/* Sección de Oficios DOCX */}
          <div className="flex flex-col gap-4 mt-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-[20px] font-semibold text-[#111827] ">Oficios en Word</h2>
                <p className="text-[13px] text-[#6b7280] mt-0.5">
                  La Facultad emite dos formatos: uno pide las vacantes y el otro designa al estudiante con su tutor.
                </p>
              </div>

              <input
                type="file"
                accept=".docx"
                ref={fileInputRef}
                className="hidden"
                onChange={handleDocxUpload}
              />
            </div>

            {/* Los dos diseños, cada uno con su plantilla y su predeterminada */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(Object.keys(OFICIOS) as OficioKind[]).map((kind) => {
                const info = OFICIOS[kind]
                const propias = docxTemplates.filter((t) => kindOf(t) === kind)
                const tienePredeterminada = propias.some(
                  (t) => typeof t.content === 'object' && t.content?.isDefault === true
                )
                return (
                  <div
                    key={kind}
                    className={`flex flex-col gap-2 p-4 rounded-[16px] border bg-white ${
                      kind === 'SOLICITUD' ? 'border-blue-100' : 'border-violet-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[15px] font-semibold text-[#111827]">{info.titulo}</h3>
                        <p className="text-[12.5px] text-[#6b7280] mt-0.5 leading-snug">{info.descripcion}</p>
                      </div>
                      <span
                        className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${
                          kind === 'SOLICITUD' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'
                        }`}
                      >
                        {propias.length} {propias.length === 1 ? 'plantilla' : 'plantillas'}
                      </span>
                    </div>

                    <p className="text-[11.5px] text-[#9ca3af] font-mono">Numeración: {info.patron}</p>

                    {!tienePredeterminada && (
                      <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-[8px] px-2.5 py-1.5 leading-snug">
                        {propias.length === 0
                          ? 'No hay plantilla subida: este oficio todavía no se puede emitir.'
                          : 'Ninguna está marcada como predeterminada: se usará la primera de la lista.'}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-1">
                      <button
                        onClick={() => { setUploadKind(kind); fileInputRef.current?.click() }}
                        disabled={isUploading}
                        className={`flex items-center gap-2 h-[34px] px-3 rounded-[10px] text-[13px] font-medium text-white shadow-soft transition-all disabled:opacity-50 ${
                          kind === 'SOLICITUD' ? 'bg-[#111827] hover:bg-[#1f2937]' : 'bg-violet-600 hover:bg-violet-700'
                        }`}
                      >
                        {isUploading && uploadKind === kind ? 'Subiendo…' : 'Subir plantilla'}
                      </button>
                      <a
                        href={`/templates/${encodeURIComponent(info.ejemplo)}`}
                        download={info.ejemplo}
                        title="Descarga el formato de ejemplo, con los marcadores a la vista y sin firma ni sello"
                        className="flex items-center gap-1.5 h-[34px] px-3 rounded-[10px] text-[13px] font-medium text-[#6b7280] hover:text-[#111827] hover:bg-slate-100 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Formato de ejemplo
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mt-4">
                {[1,2,3,4].map(i => <Skeleton key={i} className="min-h-[120px] rounded-[16px] bg-white border border-[#eef2f7]" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {docxTemplates.length === 0 && (
                  <div className="col-span-full mt-2">
                    <EmptyState 
                      icon={FileText} 
                      title="No hay plantillas DOCX" 
                      description="Sube una plantilla de Microsoft Word (.docx) para generar oficios de solicitud de prácticas."
                    />
                  </div>
                )}
              {docxTemplates.map((template) => {
                const isDocxDefault = typeof template.content === 'object' && template.content?.isDefault === true
                const cfg = typeof template.content === 'object' && template.content !== null ? template.content : {}
                const kind = kindOf(template)
                const esDesignacion = kind === 'DESIGNACION'
                return (
                <div key={template.id} className={`group relative flex flex-col p-4 rounded-[16px] border bg-white shadow-sm hover:shadow-soft transition-all ${isDocxDefault ? 'border-emerald-500 ring-4 ring-emerald-500/10' : 'border-[#eef2f7]'}`}>
                  {isDocxDefault && (
                    <span className="absolute -top-2.5 right-3 flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm uppercase tracking-wide">
                      ✓ Predeterminado
                    </span>
                  )}
                  {/* Qué oficio reproduce: sin esto las dos plantillas se ven idénticas en la cuadrícula */}
                  <span
                    className={`absolute -top-2.5 left-3 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm uppercase tracking-wide ${
                      esDesignacion ? 'bg-violet-600 text-white' : 'bg-blue-600 text-white'
                    }`}
                  >
                    {esDesignacion ? 'Designación' : 'Solicitud'}
                  </span>
                  <div 
                    onClick={(e) => handlePreviewTemplate(template, e)}
                    className={`w-full h-32 rounded-[12px] border flex items-center justify-center mb-3 cursor-pointer hover:bg-opacity-80 transition-opacity ${esDesignacion ? 'bg-violet-50/50 border-violet-100 hover:bg-violet-100/50' : 'bg-[#f8fafc] border-[#eef2f7] hover:bg-blue-50/50'}`}
                    title="Clic para previsualizar la plantilla"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={esDesignacion ? 'text-violet-500' : 'text-[#3b82f6]'}>
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <path d="M8 13h8"></path>
                      <path d="M8 17h8"></path>
                      <path d="M8 9h2"></path>
                    </svg>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-[#111827] text-[14px] leading-tight line-clamp-2" title={template.name}>
                        {template.name}
                      </h3>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleDownloadTemplate(template, e)}
                          className="flex items-center justify-center w-7 h-7 text-[#9ca3af] hover:text-[#111827] hover:bg-slate-100 rounded-[8px] transition-colors"
                          title="Descargar la plantilla Word original"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                          </svg>
                        </button>
                        <button
                          onClick={(e) => handleMakeDefault(template, e)}
                          className={`flex items-center justify-center w-7 h-7 rounded-[8px] transition-colors ${isDocxDefault ? 'text-emerald-600 bg-emerald-50' : 'text-[#9ca3af] hover:text-emerald-600 hover:bg-emerald-50'}`}
                          title={isDocxDefault ? 'Plantilla predeterminada' : 'Establecer como predeterminada'}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={isDocxDefault ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRenameClick(template.id, template.name)
                          }}
                          className="flex items-center justify-center w-7 h-7 text-[#9ca3af] hover:text-[#3b82f6] hover:bg-[#eff6ff] rounded-[8px] transition-colors"
                          title="Renombrar plantilla"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(template.id)
                          }}
                          className="flex items-center justify-center w-7 h-7 text-[#9ca3af] hover:text-[#ef4444] hover:bg-[#fef2f2] rounded-[8px] transition-colors"
                          title="Eliminar plantilla"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                          </svg>
                        </button>
                      </div>
                    </div>
                    <span className="text-[12px] font-medium text-[#9ca3af]">
                      Creado el {new Date(template.createdAt).toLocaleDateString('es-ES')}
                    </span>
                    {/* Alcance: se ve sin abrir la configuración, porque cambia
                        cuántos papeles produce cada emisión */}
                    <span
                      className={`mt-2 self-start text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${
                        scopeOf(template) === 'ESTUDIANTE'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                      title={ALCANCES[scopeOf(template)].detalle}
                    >
                      {ALCANCES[scopeOf(template)].titulo}
                    </span>
                    {/* Numeración del oficio: patrón configurable por plantilla */}
                    <button
                      onClick={() => openCodeModal(template)}
                      className="mt-2 flex items-center gap-1.5 text-left text-[11.5px] font-mono text-slate-500 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 hover:border-blue-200 rounded-[8px] px-2.5 py-1.5 transition-colors truncate"
                      title="Editar el alcance y la numeración del oficio"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                      <span className="truncate">
                        Oficio No.{' '}
                        <span className={esDesignacion ? 'text-violet-600 font-bold' : 'text-blue-600 font-bold'}>
                          {vistaPreviaCodigo(cfg.codePattern || OFICIOS[kind].patron, cfg.docTypeAbbr || 'SPP', sequences.find(s => s.type === kind)?.nextNumber || 17)}
                        </span>
                      </span>
                    </button>
                  </div>
                </div>
                )
              })}
            </div>
            )}
          </div>

        {/* Modal de Confirmación de Borrado */}
          {deleteModal.show && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={() => setDeleteModal({ show: false, templateId: null })}>
              <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-[400px] p-6 transform transition-all border border-[#eef2f7]" onClick={e => e.stopPropagation()}>
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                  </svg>
                </div>
                <h3 className="text-[18px] font-bold text-[#111827] mb-2">Eliminar Diseño</h3>
                <p className="text-[14px] text-[#6b7280] mb-6 leading-relaxed">
                  ¿Estás seguro de que deseas eliminar este diseño? Esta acción no se puede deshacer.
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button 
                    onClick={() => setDeleteModal({ show: false, templateId: null })}
                    className="px-4 py-2 text-[14px] font-medium text-[#374151] bg-white hover:bg-[#f8fafc] border border-[#eef2f7] rounded-[10px] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={confirmDelete}
                    className="px-4 py-2 text-[14px] font-medium text-white bg-red-600 hover:bg-red-700 rounded-[10px] transition-colors shadow-soft"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Renombrar Plantilla */}
          {renameModal.show && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={() => setRenameModal({ show: false, templateId: null, currentName: '' })}>
              <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-[400px] p-6 transform transition-all border border-[#eef2f7]" onClick={e => e.stopPropagation()}>
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                </div>
                <h3 className="text-[18px] font-bold text-[#111827] mb-2">Renombrar Documento</h3>
                <p className="text-[14px] text-[#6b7280] mb-4">
                  Ingresa el nuevo nombre para este diseño:
                </p>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#f9fafb] border border-[#eef2f7] rounded-[10px] text-[14px] text-[#111827] focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-all mb-6"
                  placeholder="Nombre de la plantilla"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename();
                  }}
                />
                <div className="flex items-center justify-end gap-3">
                  <button 
                    onClick={() => setRenameModal({ show: false, templateId: null, currentName: '' })}
                    className="px-4 py-2 text-[14px] font-medium text-[#374151] bg-white hover:bg-[#f8fafc] border border-[#eef2f7] rounded-[10px] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={confirmRename}
                    className="px-4 py-2 text-[14px] font-medium text-white bg-[#111827] hover:bg-[#1f2937] rounded-[10px] transition-colors shadow-soft"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Numeración del Oficio */}
          {codeModal.show && codeModal.template && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={() => setCodeModal({ show: false, template: null })}>
              <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-[520px] p-6 border border-[#eef2f7]" onClick={e => e.stopPropagation()}>
                <h3 className="text-[18px] font-bold text-[#111827] mb-1">
                  Configuración de la {kindOf(codeModal.template) === 'DESIGNACION' ? 'designación' : 'solicitud'}
                </h3>
                <p className="text-[13px] text-[#6b7280] mb-4">
                  Cómo se emite este oficio y cómo se numera.
                </p>

                {/* Alcance: a cuántos estudiantes ampara un mismo papel */}
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Cuántos oficios se emiten
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {(Object.keys(ALCANCES) as OficioScope[]).map((sc) => (
                    <button
                      key={sc}
                      onClick={() => setCodeScope(sc)}
                      className={`flex flex-col items-start gap-0.5 p-3 rounded-[12px] border text-left transition-colors ${
                        codeScope === sc
                          ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/10'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-[13px] font-bold text-[#111827]">{ALCANCES[sc].titulo}</span>
                      <span className="text-[11px] text-slate-500 leading-snug">{ALCANCES[sc].detalle}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11.5px] text-slate-400 mb-5">
                  El cuerpo del oficio se adapta solo: si ampara a uno habla en singular y si ampara a
                  varios, en plural.
                </p>

                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Patrón de numeración
                </label>
                <p className="text-[12.5px] text-[#6b7280] mb-2.5">
                  Lo que va entre llaves lo rellena el sistema; el resto sale tal cual.{' '}
                  <span className="font-semibold">{'{SEQ}'}</span> es obligatorio: es el secuencial que
                  impide que dos oficios se repitan.
                </p>

                <input
                  type="text"
                  value={codePattern}
                  onChange={(e) => setCodePattern(e.target.value)}
                  placeholder={OFICIOS[kindOf(codeModal.template)].patron}
                  className="w-full px-3 py-2.5 mb-1 bg-white border border-[#e5e7eb] rounded-[10px] text-[14px] font-mono text-[#111827] focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                />
                <p className="text-[11.5px] text-slate-400 mb-4">
                  Si lo dejas vacío se usa el del formato: <span className="font-mono">{OFICIOS[kindOf(codeModal.template)].patron}</span>
                </p>

                {/* Tokens disponibles */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {([
                    ['{SEQ:3}', 'secuencial, con 3 dígitos'],
                    ['{YYYY}', 'año de emisión'],
                    ['{PERIOD}', 'periodo académico'],
                    ['{PROGRAM}', 'abreviatura de la carrera'],
                    ['{FACULTY}', 'abreviatura de la facultad'],
                    ['{TYPE}', 'abreviatura del tipo'],
                  ] as const).map(([token, ayuda]) => (
                    <button
                      key={token}
                      onClick={() => setCodePattern((p) => p + token)}
                      title={ayuda}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11.5px] font-mono rounded-[6px] transition-colors"
                    >
                      {token}
                    </button>
                  ))}
                </div>

                {/* Vista previa */}
                <div className="flex items-center gap-2 mb-4 px-3 py-2.5 bg-emerald-50 border border-emerald-100 rounded-[10px]">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide shrink-0">Así se imprime:</span>
                  <span className="text-[13px] font-mono font-semibold text-[#111827] truncate">
                    {vistaPreviaCodigo(codePattern || OFICIOS[kindOf(codeModal.template)].patron, docTypeAbbr)}
                  </span>
                </div>

                {/* La abreviatura del tipo solo se imprime si el patrón la usa */}
                {(codePattern || OFICIOS[kindOf(codeModal.template)].patron).includes('{TYPE}') && (
                  <div className="flex items-center gap-2 mb-4">
                    <label className="text-[13px] text-slate-600">Abreviatura del tipo:</label>
                    <input
                      type="text"
                      value={docTypeAbbr}
                      onChange={(e) => setDocTypeAbbr(e.target.value.toUpperCase())}
                      placeholder="SPP"
                      className="w-[70px] px-2 py-1.5 bg-white border border-[#e5e7eb] rounded-[8px] text-[13px] font-mono text-center uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                    />
                  </div>
                )}

                <div className="mb-6 px-3 py-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg">
                  <span className="font-semibold text-slate-700">ℹ️ Nota:</span> las abreviaturas de carrera y facultad
                  se toman del programa del estudiante. Configúralas en Gestión de Carreras.
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => setCodeModal({ show: false, template: null })}
                    className="px-4 py-2 text-[14px] font-medium text-[#374151] bg-white hover:bg-[#f8fafc] border border-[#eef2f7] rounded-[10px] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveCodeConfig}
                    className="px-4 py-2 text-[14px] font-medium text-white bg-[#111827] hover:bg-[#1f2937] rounded-[10px] transition-colors shadow-soft"
                  >
                    Guardar numeración
                  </button>
                </div>
              </div>
            </div>
          )}

          <DocxPreviewModal
            isOpen={!!previewTemplate}
            onClose={() => setPreviewTemplate(null)}
            url={previewTemplate?.url || null}
            title={previewTemplate?.title}
          />
        </div>
      </div>
    </RoleGate>
  )
}

function TemplateCard({
  template,
  isDefault,
  onClick,
  onDelete,
  onMakeDefault,
  onDownload,
  onRename
}: {
  template: DocumentTemplate;
  isDefault?: boolean;
  onClick: () => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onMakeDefault: (e: React.MouseEvent) => void;
  onDownload?: (e: React.MouseEvent) => void;
  onRename: (id: string, name: string, e: React.MouseEvent) => void;
}) {
  const user = useAuthStore((state) => state.user)
  // Generar miniatura del JSON del diseño
  const content = template.content as any
  const elementCount = content?.schemas?.[0]?.length || content?.elements?.length || 0

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={`w-full relative flex flex-col p-4 rounded-[16px] bg-white border transition-all duration-200 cursor-pointer text-left
          ${isDefault ? 'border-emerald-500 ring-4 ring-emerald-500/10 shadow-soft' : 'border-[#eef2f7] hover:border-[#cbd5e1] hover:shadow-soft'}`}
      >
        {isDefault && (
          <div className="absolute -top-3 -right-2 z-10 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-3 py-1 rounded-[8px] border border-emerald-200 shadow-sm uppercase tracking-wider flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Predeterminado
          </div>
        )}
        
        {/* Miniatura del diseño */}
        <div className="w-full h-32 rounded-[12px] bg-[#f8fafc] border border-[#eef2f7] relative overflow-hidden mb-3">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-80">
            <MiniTemplatePreview template={template} />
          </div>
          {/* Badge de cantidad de elementos */}
          <div className="absolute bottom-2 left-2 bg-white/90 text-[#475569] text-[10px] font-semibold px-2 py-1 rounded-[6px] border border-[#eef2f7] backdrop-blur-md shadow-sm">
            {elementCount} variables
          </div>
        </div>

        <div className="flex flex-col gap-1 w-full">
          <h3 className="font-semibold text-[14px] text-[#111827] truncate pr-6 leading-tight">
            {template.name}
          </h3>
          <span className="text-[12px] font-medium text-[#9ca3af]">
            Actualizado el {new Date(template.createdAt).toLocaleDateString('es-ES')}
          </span>
        </div>
      </button>
      
      {/* Botones Flotantes (Aparecen en hover o si están activos) */}
      <div className="absolute bottom-[20px] right-[20px] flex items-center gap-1 z-20">
        {onDownload && (
          <button
            onClick={onDownload}
            className="flex items-center justify-center w-7 h-7 bg-white text-[#9ca3af] rounded-[8px] opacity-0 group-hover:opacity-100 hover:bg-slate-100 hover:text-[#111827] transition-all border border-[#eef2f7]"
            title="Descargar el diseño (JSON)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        )}
        <button
          onClick={onMakeDefault}
          className={`flex items-center justify-center w-7 h-7 rounded-[8px] transition-all
            ${isDefault ? 'bg-emerald-100 text-emerald-600 opacity-100' : 'bg-white text-[#9ca3af] opacity-0 group-hover:opacity-100 hover:text-emerald-600 hover:bg-emerald-50 border border-[#eef2f7]'}`}
          title={isDefault ? "Plantilla predeterminada" : "Establecer como predeterminada"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={isDefault ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
        </button>

        {(!isDefault || user?.role === 'ADMIN') && (
          <button
            onClick={(e) => onRename(template.id, template.name, e)}
            className="flex items-center justify-center w-7 h-7 bg-white text-[#9ca3af] rounded-[8px] opacity-0 group-hover:opacity-100 hover:bg-[#eff6ff] hover:text-[#3b82f6] transition-all border border-[#eef2f7]"
            title="Renombrar plantilla"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
        )}
        
        {(!isDefault || user?.role === 'ADMIN') && (
          <button
            onClick={(e) => onDelete(template.id, e)}
            className="flex items-center justify-center w-7 h-7 bg-white text-[#9ca3af] rounded-[8px] opacity-0 group-hover:opacity-100 hover:bg-[#fef2f2] hover:text-[#ef4444] transition-all border border-[#eef2f7]"
            title="Eliminar plantilla"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

function MiniTemplatePreview({ template }: { template: DocumentTemplate }) {
  const content = template.content as any;
  const rawBg = content?.background ? String(content.background) : '';
  // Si el fondo vive en MinIO, resolvemos su URL prefirmada; los antiguos
  // (/uploads, http, /templates) y los "blob:" corruptos se manejan aparte.
  const [resolvedBg, setResolvedBg] = useState<string | null>(
    rawBg && !rawBg.startsWith('templates/backgrounds/') && !rawBg.startsWith('blob:') ? rawBg : null
  );
  useEffect(() => {
    if (rawBg.startsWith('templates/backgrounds/')) {
      api.get('/document-templates/bg-url', { params: { key: rawBg } })
        .then((r) => setResolvedBg(r.data?.url || null))
        .catch(() => setResolvedBg(null));
    }
  }, [rawBg]);
  const [bgImage] = useImage(getAssetUrl(resolvedBg) || '');
  // Aumentar la escala para que se vea mucho más grande
  const scale = 0.16;
  const width = content?.width || 1123;
  const height = content?.height || 794;

  return (
    <Stage width={width * scale} height={height * scale}>
      <Layer>
        {bgImage && (
          <KonvaImage image={bgImage} width={width * scale} height={height * scale} />
        )}
        {(content?.elements || []).map((el: any, idx: number) => {
          if (el.type === 'text') {
            return (
              <KonvaText
                key={idx}
                text={el.content.replace(/<[^>]*>?/gm, '')} // remove html tags for preview
                x={el.x * scale}
                y={el.y * scale}
                fontSize={(el.fontSize || 16) * scale}
                fontFamily={el.fontFamily || 'Arial'}
                fill={el.color || '#000'}
                width={el.width ? el.width * scale : undefined}
                align={el.textAlign || 'left'}
                fontStyle={el.fontWeight === 'bold' ? 'bold' : 'normal'}
              />
            );
          }
          return null;
        })}
      </Layer>
    </Stage>
  );
}
