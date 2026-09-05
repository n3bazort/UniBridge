'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Stage, Layer, Text as KonvaText, Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth-store'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, Hash, Download, Pencil, Trash2, Star, Plus, Eye } from 'lucide-react'
import { getAssetUrl } from '@/lib/utils'
import { DocxPreviewModal } from '@/components/shared/DocxPreviewModal'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { usePeriodStore } from '@/store/period'

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
    titulo: 'Solicitud de Vacantes',
    descripcion: 'Pide a la empresa la apertura de vacantes para el grupo de estudiantes.',
    // El archivo tiene que existir en `apps/web/public/templates/`: el enlace
    // apunta ahí directamente. Antes nombraba «Solicitud de Prácticas
    // Oficial.docx», que nunca estuvo en el repositorio, así que «Ver ejemplo»
    // devolvía un 404 silencioso. Se usa la variante sin imágenes a propósito:
    // las que llevan firma y sello incrustan la rúbrica del Responsable, y esa
    // no se publica como descarga.
    ejemplo: 'Solicitud de Pra. 2026(1) sin_img.docx',
    patron: '{YYYY}-{PROGRAM}-{SEQ:3}',
    color: 'blue',
  },
  DESIGNACION: {
    titulo: 'Designación de Tutores',
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

/** Encabezado de sección — mismo patrón (título + descripción opcional +
 *  acción a la derecha) en las 3 secciones de la página, antes escrito a
 *  mano 3 veces con tamaños de texto ligeramente distintos cada vez. */
function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/** Botón de ícono para las acciones secundarias de una tarjeta: oculto hasta
 *  hover para no competir con el contenido, siempre con foco visible por
 *  teclado. Antes la tarjeta de oficios DOCX mostraba las 4 acciones todo
 *  el tiempo mientras que la de diseños PDF sí las ocultaba — misma
 *  pantalla, dos comportamientos distintos para el mismo patrón. */
function CardIconButton({
  onClick,
  title,
  active,
  activeClassName,
  children,
}: {
  onClick: (e: React.MouseEvent) => void
  title: string
  active?: boolean
  activeClassName?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        'flex items-center justify-center w-7 h-7 rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? cn('opacity-100 border-transparent', activeClassName)
          : 'opacity-0 group-hover:opacity-100 bg-white text-muted-foreground border-border hover:text-foreground hover:bg-accent',
      )}
    >
      {children}
    </button>
  )
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
          <Input
            type="number"
            min="1"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="w-24 font-mono"
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || parseInt(val, 10) === currentNext}
            className={`h-9 px-3 text-[12px] rounded-[10px] gap-1.5 ${
              // Mismo azul/violeta que ya usa el resto de esta tarjeta para
              // distinguir SOLICITUD de DESIGNACION (antes este botón solo
              // rompía el patrón con negro).
              kind === 'SOLICITUD' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-violet-600 hover:bg-violet-700'
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
  // El periodo del workspace (topbar) manda: la numeración es POR periodo,
  // así que mostrar la del "periodo activo" mientras el usuario está parado
  // en otro le enseñaba correlativos que no son los que va a usar.
  const { selectedPeriod } = usePeriodStore()

  const { data: templates, isLoading } = useQuery({
    queryKey: ['document-templates'],
    queryFn: async () => {
      const res = await api.get<DocumentTemplate[]>('/document-templates')
      return res.data
    }
  })

  const { data: sequences = [] } = useQuery<DocumentSequenceItem[]>({
    queryKey: ['document-sequences', selectedPeriod],
    queryFn: async () => (await api.get('/document-templates/sequences', {
      params: { periodCode: selectedPeriod || undefined },
    })).data,
    enabled: !!selectedPeriod,
  })

  const handleSaveSequence = async (type: OficioKind, nextNum: number) => {
    await api.patch('/document-templates/sequences', { type, nextNumber: nextNum, periodCode: selectedPeriod || undefined })
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
      <div className="flex flex-col w-full flex-1">
        <PageContainer variant="reading" className="flex flex-col gap-16">

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Gestión de Plantillas y Documentos</h1>
            <p className="text-muted-foreground mt-1.5 text-sm max-w-2xl">Gestiona los diseños de certificados PDF, las plantillas de oficios DOCX y su correlativo de numeración.</p>
          </div>

          {/* Sección: Configuración */}
          <section className="flex flex-col gap-6">
            <SectionHeader
              title="Control de Numeración y Retoma de Secuencia"
              description="Configura el número correlativo desde el cual se continuará numerando cada oficio en el periodo académico actual."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
          </section>

          {/* Sección: Diseños */}
          <section className="flex flex-col gap-6">
            <SectionHeader
              title="Certificados PDF (Diseños Visuales)"
              action={
                <a
                  href="/templates/Certificado Real.png"
                  download="Certificado Real.png"
                  title="Descargar plantilla de ejemplo"
                  className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Plantilla de ejemplo
                </a>
              }
            />

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <Skeleton key={i} className="min-h-[220px] rounded-xl bg-white border border-border" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

                {/* Tarjeta: Crear Nuevo Diseño */}
                <button
                  onClick={() => router.push('/documents/designer')}
                  className="group flex flex-col items-center justify-center gap-3 min-h-[220px] rounded-xl border border-dashed border-border bg-white/50 hover:bg-white hover:border-muted-foreground hover:shadow-sm transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="w-12 h-12 rounded-full bg-muted group-hover:bg-accent flex items-center justify-center transition-colors">
                    <Plus className="w-6 h-6 text-muted-foreground group-hover:text-foreground" />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-semibold text-foreground text-sm">Crear Nuevo Diseño</span>
                    <span className="text-xs font-medium text-muted-foreground">Editor visual interactivo</span>
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
        </section>

          {/* Sección: Plantillas */}
          <section className="flex flex-col gap-6">
            <SectionHeader
              title="Oficios en Word"
              description="La Facultad emite dos formatos: uno pide las vacantes y el otro designa al estudiante con su tutor."
            />
            <input
              type="file"
              accept=".docx"
              ref={fileInputRef}
              className="hidden"
              onChange={handleDocxUpload}
            />

            {/* Columnas por tipo de oficio */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {(Object.keys(OFICIOS) as OficioKind[]).map((kind) => {
                const info = OFICIOS[kind]
                const propias = docxTemplates.filter((t) => kindOf(t) === kind)
                const tienePredeterminada = propias.some(
                  (t) => typeof t.content === 'object' && t.content?.isDefault === true
                )
                
                return (
                  <div key={kind} className="flex flex-col gap-4">
                    {/* El header / cajón informativo */}
                    <div
                      className="relative overflow-hidden flex flex-col gap-3 p-5 rounded-[20px] bg-white border border-slate-100 shadow-sm"
                    >
                      <div className={`absolute top-0 left-0 w-full h-1 ${kind === 'SOLICITUD' ? 'bg-blue-500' : 'bg-violet-500'}`}></div>
                      <div className="flex items-start justify-between gap-3 mt-1">
                        <div>
                          <h3 className="text-base font-semibold tracking-tight text-foreground">{info.titulo}</h3>
                          <p className="text-sm text-muted-foreground mt-1 leading-snug">{info.descripcion}</p>
                        </div>
                        <span
                          className={`shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider ${
                            kind === 'SOLICITUD' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'
                          }`}
                          title={`Patrón de numeración: ${info.patron}`}
                        >
                          {propias.length} {propias.length === 1 ? 'PLANTILLA' : 'PLANTILLAS'}
                        </span>
                      </div>

                      {/* La línea "Numeración: {patrón}" que vivía aquí era
                          jerga técnica compitiendo con lo importante — y
                          cada tarjeta de abajo ya muestra el resultado
                          legible ("Oficio No. 2026-TI-022"). Queda como
                          tooltip en el conteo, no como texto permanente. */}
                      {!tienePredeterminada && (
                        <p className="text-sm font-medium text-warning bg-warning/10 border border-warning/30 rounded-xl px-3 py-2.5 mt-1 leading-snug">
                          {propias.length === 0
                            ? 'No hay plantilla subida: este oficio todavía no se puede emitir.'
                            : 'Ninguna está marcada como predeterminada: se usará la primera de la lista.'}
                        </p>
                      )}

                      <div className="flex items-center gap-3 mt-3">
                        {/* Sólido, no degradado — el gradiente azul es justo
                            la huella visual más reconocible de "hecho por IA"
                            (redesign-existing-projects). La sombra sigue
                            teñida del mismo tono, eso sí se conserva. */}
                        <Button
                          onClick={() => { setUploadKind(kind); fileInputRef.current?.click() }}
                          disabled={isUploading}
                          className={`h-10 gap-2 text-sm rounded-xl shadow-lg transition-all hover:-translate-y-0.5 disabled:hover:translate-y-0 ${
                            kind === 'SOLICITUD' ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/30' : 'bg-violet-600 hover:bg-violet-500 shadow-violet-500/30'
                          }`}
                        >
                          {isUploading && uploadKind === kind ? 'Subiendo…' : 'Subir formato'}
                        </Button>
                        <a
                          href={`/templates/${encodeURIComponent(info.ejemplo)}`}
                          download={info.ejemplo}
                          title="Descarga el formato de ejemplo"
                          className="flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground bg-muted hover:bg-accent border border-border transition-all"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Ver ejemplo
                        </a>
                      </div>
                    </div>

                    {/* Lista de plantillas de este tipo */}
                    {isLoading ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[1, 2].map(i => <Skeleton key={i} className="min-h-[120px] rounded-xl bg-white border border-border" />)}
                      </div>
                    ) : propias.length === 0 ? (
                      <EmptyState
                        icon={FileText}
                        title="No hay plantillas DOCX"
                        description={`Sube una plantilla para emitir ${info.titulo.toLowerCase()}.`}
                      />
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {propias.map((template) => (
                          <OficioTemplateCard
                            key={template.id}
                            template={template}
                            kind={kind}
                            sequenceNext={sequences.find(s => s.type === kind)?.nextNumber || 17}
                            onPreview={(e) => handlePreviewTemplate(template, e)}
                            onDownload={(e) => handleDownloadTemplate(template, e)}
                            onMakeDefault={(e) => handleMakeDefault(template, e)}
                            onRename={(e) => { e.stopPropagation(); handleRenameClick(template.id, template.name) }}
                            onDelete={(e) => { e.stopPropagation(); handleDelete(template.id) }}
                            onEditNumbering={() => openCodeModal(template)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

        {/* Modal de Confirmación de Borrado */}
          {deleteModal.show && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setDeleteModal({ show: false, templateId: null })}>
              <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-[400px] overflow-hidden transform transition-all border border-slate-100" onClick={e => e.stopPropagation()}>
                <div className="bg-blue-600 h-2 w-full"></div>
                <div className="p-6">
                  <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                      <path d="M3 6h18"></path>
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    </svg>
                  </div>
                  <h3 className="text-[18px] font-bold text-slate-800 mb-2 tracking-tight">Eliminar Diseño</h3>
                  <p className="text-[14px] text-slate-500 mb-8 leading-relaxed">
                    ¿Estás seguro de que deseas eliminar este diseño? Esta acción no se puede deshacer.
                  </p>
                  <div className="flex items-center justify-end gap-3">
                    <Button variant="secondary" onClick={() => setDeleteModal({ show: false, templateId: null })} className="text-[14px] rounded-xl">
                      Cancelar
                    </Button>
                    <Button variant="destructive" onClick={confirmDelete} className="text-[14px] rounded-xl shadow-sm">
                      Eliminar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Renombrar Plantilla */}
          {renameModal.show && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setRenameModal({ show: false, templateId: null, currentName: '' })}>
              <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-[400px] overflow-hidden transform transition-all border border-slate-100" onClick={e => e.stopPropagation()}>
                <div className="bg-blue-600 h-2 w-full"></div>
                <div className="p-6">
                  <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </div>
                  <h3 className="text-[18px] font-bold text-slate-800 mb-2 tracking-tight">Renombrar Documento</h3>
                  <p className="text-[14px] text-slate-500 mb-5">
                    Ingresa el nuevo nombre para este diseño:
                  </p>
                  <Input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full mb-8"
                    placeholder="Nombre de la plantilla"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmRename();
                    }}
                  />
                  <div className="flex items-center justify-end gap-3">
                    <Button variant="secondary" onClick={() => setRenameModal({ show: false, templateId: null, currentName: '' })} className="text-[14px] rounded-xl">
                      Cancelar
                    </Button>
                    <Button onClick={confirmRename} className="text-[14px] rounded-xl shadow-sm">
                      Guardar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Numeración del Oficio */}
          {codeModal.show && codeModal.template && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setCodeModal({ show: false, template: null })}>
              <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-[520px] overflow-hidden border border-slate-100" onClick={e => e.stopPropagation()}>
                <div className="bg-blue-600 h-2 w-full"></div>
                <div className="p-6">
                  <h3 className="text-[18px] font-bold text-slate-800 mb-1 tracking-tight">
                    Configuración de la {kindOf(codeModal.template) === 'DESIGNACION' ? 'designación' : 'solicitud'}
                  </h3>
                  <p className="text-[13.5px] text-slate-500 mb-6 font-medium">
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
                        <span className="text-[13px] font-bold text-slate-800">{ALCANCES[sc].titulo}</span>
                        <span className="text-[11px] text-slate-500 leading-snug">{ALCANCES[sc].detalle}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11.5px] text-slate-400 mb-6">
                    El cuerpo del oficio se adapta solo: si ampara a uno habla en singular y si ampara a
                    varios, en plural.
                  </p>

                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                    Patrón de numeración
                  </label>
                  <p className="text-[12.5px] text-slate-500 mb-3">
                    Lo que va entre llaves lo rellena el sistema; el resto sale tal cual.{' '}
                    <span className="font-semibold text-slate-700">{'{SEQ}'}</span> es obligatorio: es el secuencial que
                    impide que dos oficios se repitan.
                  </p>

                  <Input
                  type="text"
                  value={codePattern}
                  onChange={(e) => setCodePattern(e.target.value)}
                  placeholder={OFICIOS[kindOf(codeModal.template)].patron}
                  className="w-full mb-1 font-mono"
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
                    <Input
                      type="text"
                      value={docTypeAbbr}
                      onChange={(e) => setDocTypeAbbr(e.target.value.toUpperCase())}
                      placeholder="SPP"
                      className="w-[70px] font-mono text-center"
                    />
                  </div>
                )}

                <div className="mb-6 px-3 py-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg">
                  <span className="font-semibold text-slate-700">ℹ️ Nota:</span> las abreviaturas de carrera y facultad
                  se toman del programa del estudiante. Configúralas en Gestión de Carreras.
                </div>

                <div className="flex items-center justify-end gap-3 mt-8">
                  <Button variant="secondary" onClick={() => setCodeModal({ show: false, template: null })} className="text-[14px] rounded-xl">
                    Cancelar
                  </Button>
                  <Button onClick={saveCodeConfig} className="text-[14px] rounded-xl shadow-sm">
                    Guardar configuración
                  </Button>
                </div>
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
        </PageContainer>
      </div>
    </RoleGate>
  )
}

/** Una plantilla DOCX (Solicitud o Designación) dentro de su columna.
 *  Antes vivía inline en el .map() de la página (120 líneas, SVGs a mano);
 *  separarla la hace legible y reutilizable, y de paso unifica sus íconos
 *  de acción con el mismo CardIconButton que ya usa TemplateCard. */
function OficioTemplateCard({
  template,
  kind,
  sequenceNext,
  onPreview,
  onDownload,
  onMakeDefault,
  onRename,
  onDelete,
  onEditNumbering,
}: {
  template: DocumentTemplate
  kind: OficioKind
  sequenceNext: number
  onPreview: (e: React.MouseEvent) => void
  onDownload: (e: React.MouseEvent) => void
  onMakeDefault: (e: React.MouseEvent) => void
  onRename: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  onEditNumbering: () => void
}) {
  const isDefault = typeof template.content === 'object' && template.content?.isDefault === true
  const cfg = typeof template.content === 'object' && template.content !== null ? template.content : {}
  const esDesignacion = kind === 'DESIGNACION'
  const accent = esDesignacion ? 'violet' : 'blue'

  return (
    <div className={cn(
      'group relative flex flex-col p-3 rounded-xl bg-white border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
      isDefault ? 'border-transparent ring-2 ring-success/40' : 'border-border',
    )}>
      <span className={cn(
        'absolute -top-2 left-3 z-10 text-[9.5px] font-bold px-2 py-0.5 rounded-full shadow-sm uppercase tracking-wide text-white',
        accent === 'violet' ? 'bg-violet-600' : 'bg-blue-600',
      )}>
        {esDesignacion ? 'Designación' : 'Solicitud'}
      </span>

      {/* La banda de previsualización era de 128 px de alto para mostrar un
          solo icono: ocupaba más que todo el texto de la tarjeta junta y
          obligaba a desplazarse para comparar dos plantillas. Con 64 px sigue
          siendo un objetivo de clic cómodo y la tarjeta cabe entera en pantalla. */}
      <div
        onClick={onPreview}
        className={cn(
          'w-full h-16 rounded-lg border flex items-center justify-center mb-2 cursor-pointer transition-colors',
          accent === 'violet' ? 'bg-violet-50/50 border-violet-100 hover:bg-violet-100/50' : 'bg-blue-50/40 border-blue-100 hover:bg-blue-100/40',
        )}
        title="Clic para previsualizar la plantilla"
      >
        <FileText className={cn('w-7 h-7', accent === 'violet' ? 'text-violet-500' : 'text-blue-500')} strokeWidth={1.5} />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-foreground text-sm leading-tight line-clamp-2" title={template.name}>
            {template.name}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            <CardIconButton onClick={onDownload} title="Descargar la plantilla Word original">
              <Download className="w-3.5 h-3.5" />
            </CardIconButton>
            <CardIconButton
              onClick={onMakeDefault}
              title={isDefault ? 'Plantilla predeterminada' : 'Establecer como predeterminada'}
              active={isDefault}
              activeClassName="bg-success/10 text-success"
            >
              <Star className="w-3.5 h-3.5" fill={isDefault ? 'currentColor' : 'none'} />
            </CardIconButton>
            <CardIconButton onClick={onRename} title="Renombrar plantilla">
              <Pencil className="w-3.5 h-3.5" />
            </CardIconButton>
            <CardIconButton onClick={onDelete} title="Eliminar plantilla">
              <Trash2 className="w-3.5 h-3.5" />
            </CardIconButton>
          </div>
        </div>
        {/* Fecha y alcance comparten fila: son dos datos cortos, y apilarlos
            añadía una línea entera a cada tarjeta sin ganar legibilidad. */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium text-muted-foreground">
            {new Date(template.createdAt).toLocaleDateString('es-ES')}
          </span>
          <span
            className={cn(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
              scopeOf(template) === 'ESTUDIANTE' ? 'text-warning bg-warning/10 border border-warning/30' : 'bg-muted text-muted-foreground',
            )}
            title={ALCANCES[scopeOf(template)].detalle}
          >
            {ALCANCES[scopeOf(template)].titulo}
          </span>
        </div>
        {/* Numeración del oficio: patrón configurable por plantilla */}
        <button
          onClick={onEditNumbering}
          className="mt-1.5 flex items-center gap-1.5 text-left text-[11px] font-mono text-muted-foreground bg-muted hover:bg-accent hover:text-foreground border border-border rounded-lg px-2 py-1 transition-colors truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Editar el alcance y la numeración del oficio"
        >
          <Pencil className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">
            Oficio No.{' '}
            <span className={accent === 'violet' ? 'text-violet-600 font-bold' : 'text-blue-600 font-bold'}>
              {vistaPreviaCodigo(cfg.codePattern || OFICIOS[kind].patron, cfg.docTypeAbbr || 'SPP', sequenceNext)}
            </span>
          </span>
        </button>
      </div>
    </div>
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

  const canManage = !isDefault || user?.role === 'ADMIN'

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={cn(
          'w-full relative flex flex-col p-3 rounded-xl bg-white border transition-all duration-200 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isDefault ? 'border-transparent ring-2 ring-success/40 shadow-sm' : 'border-border hover:border-muted-foreground/40 hover:shadow-sm',
        )}
      >
        {/* Miniatura del diseño. Aquí sí hay algo que ver —el certificado
            real—, así que se recorta menos que en las tarjetas de oficio. */}
        <div className="w-full h-24 rounded-lg bg-slate-50 border border-border relative overflow-hidden mb-2">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-80">
            <MiniTemplatePreview template={template} />
          </div>
          <div className="absolute bottom-1.5 left-1.5 bg-white/90 text-muted-foreground text-[9.5px] font-semibold px-1.5 py-0.5 rounded-md border border-border backdrop-blur-md shadow-sm">
            {elementCount} variables
          </div>
        </div>

        <div className="flex flex-col gap-0.5 w-full">
          <h3 className="font-semibold text-sm text-foreground truncate pr-6 leading-tight">
            {template.name}
          </h3>
          <span className="text-[11px] font-medium text-muted-foreground">
            {new Date(template.createdAt).toLocaleDateString('es-ES')}
          </span>
        </div>
      </button>

      {/* Acciones — ocultas hasta hover, igual que en las tarjetas de oficios */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 z-20">
        {onDownload && (
          <CardIconButton onClick={onDownload} title="Descargar el diseño (JSON)">
            <Download className="w-3.5 h-3.5" />
          </CardIconButton>
        )}
        <CardIconButton
          onClick={onMakeDefault}
          title={isDefault ? 'Plantilla predeterminada' : 'Establecer como predeterminada'}
          active={isDefault}
          activeClassName="bg-success/10 text-success"
        >
          <Star className="w-3.5 h-3.5" fill={isDefault ? 'currentColor' : 'none'} />
        </CardIconButton>
        {canManage && (
          <CardIconButton onClick={(e) => onRename(template.id, template.name, e)} title="Renombrar plantilla">
            <Pencil className="w-3.5 h-3.5" />
          </CardIconButton>
        )}
        {canManage && (
          <CardIconButton onClick={(e) => onDelete(template.id, e)} title="Eliminar plantilla">
            <Trash2 className="w-3.5 h-3.5" />
          </CardIconButton>
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
  // Ajustada a la altura de la miniatura (96 px): 794 × 0.12 ≈ 95 px, así el
  // diseño entra entero en la caja en vez de quedar recortado por arriba.
  const scale = 0.12;
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
