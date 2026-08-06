'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Stage, Layer, Text as KonvaText, Image as KonvaImage, Transformer, Rect } from 'react-konva'
import useImage from 'use-image'
import { api } from '@/lib/axios'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth-store'
import { getAssetUrl } from '@/lib/utils'
import {
  Plus, Trash2, AlignLeft, AlignCenter, AlignRight,
  Type, Image as ImageIcon, Save, Settings, Layers, X
} from 'lucide-react'

/* ─── Types ─── */
export interface TemplateElement {
  id: string
  type: 'text' | 'image'
  content: string
  x: number
  y: number
  fontSize?: number
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  textAlign?: string
  color?: string
  width?: number
}

/* ─── System variables from backend ─── */
const SYSTEM_VARIABLES = [
  { label: 'Nombre Estudiante', value: '{{studentName}}' },
  { label: 'Cédula', value: '{{studentDni}}' },
  { label: 'Carrera', value: '{{programName}}' },
  { label: 'Facultad', value: '{{facultyName}}' },
  { label: 'Empresa', value: '{{companyName}}' },
  { label: 'Total Horas', value: '{{totalHours}}' },
  { label: 'Tutor Académico', value: '{{tutorName}}' },
  { label: 'Nivel Práctica', value: '{{practiceLevel}}' },
  { label: 'Periodo Académico', value: '{{academicPeriod}}' },
  { label: 'Fecha Actual', value: '{{currentDate}}' },
  { label: 'Nombre Decano(a)', value: '{{deanName}}' },
  { label: 'Responsable Prácticas', value: '{{responsableName}}' },
]

/* ─── Document size (A4 landscape in px) ─── */
const DOC_W = 1123
const DOC_H = 794

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export function CertificateDesignerFull() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const templateId = searchParams.get('templateId')
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)

  /* ── State ── */
  const [elements, setElements] = useState<TemplateElement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null)
  const [bgImageKey, setBgImageKey] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [saving, setSaving] = useState(false)
  const [isDefaultTemplate, setIsDefaultTemplate] = useState(false)

  /* ── Canvas auto-fit ── */
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<any>(null)
  const bgFileRef = useRef<HTMLInputElement>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600, scale: 0.6 })
  const [bgImage] = useImage(getAssetUrl(bgImageUrl) || '')

  /* ─────────────────────────────────────────────
     AUTO-FIT: document always fills available space
     ───────────────────────────────────────────── */
  const fitCanvas = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const cw = el.clientWidth
    const ch = el.clientHeight
    if (cw <= 0 || ch <= 0) return

    const pad = 32
    const scale = Math.min((cw - pad * 2) / DOC_W, (ch - pad * 2) / DOC_H, 1)
    setCanvasSize({ w: cw, h: ch, scale: Math.max(0.05, scale) })
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(fitCanvas)
    ro.observe(el)
    window.addEventListener('resize', fitCanvas)
    fitCanvas()
    return () => { ro.disconnect(); window.removeEventListener('resize', fitCanvas) }
  }, [fitCanvas])

  /* Computed position to center the doc */
  const docX = (canvasSize.w - DOC_W * canvasSize.scale) / 2
  const docY = (canvasSize.h - DOC_H * canvasSize.scale) / 2

  /* ─────────────────────────────────────────────
     LOAD TEMPLATE DATA
     ───────────────────────────────────────────── */
  const { data: templateData } = useQuery({
    queryKey: ['template', templateId],
    queryFn: async () => {
      if (!templateId) return null
      const res = await api.get(`/document-templates/${templateId}`)
      return res.data
    },
    enabled: !!templateId,
  })

  useEffect(() => {
    if (!templateData) return
    setTemplateName(templateData.name || '')

    let content = templateData.content
    if (typeof content === 'string') {
      try { content = JSON.parse(content) } catch { /* noop */ }
    }
    if (!content || typeof content !== 'object') return

    // Background
    const bg = content.background ? String(content.background) : ''
    if (bg && !bg.startsWith('blob:')) {
      if (bg.startsWith('templates/backgrounds/')) {
        setBgImageKey(bg)
        api.get('/document-templates/bg-url', { params: { key: bg } })
          .then((r) => setBgImageUrl(r.data?.url || null))
          .catch(() => setBgImageUrl(null))
      } else {
        setBgImageUrl(bg)
      }
    }

    // Elements
    if (Array.isArray(content.elements)) {
      setElements(
        content.elements.map((el: any, i: number) => ({
          ...el,
          id: el.id || `el-${i}-${Date.now()}`,
        }))
      )
    }

    setIsDefaultTemplate(
      templateData.name === 'Certificado de Prácticas Oficial' || content.isDefault === true
    )
  }, [templateData])

  /* ─────────────────────────────────────────────
     ELEMENT ACTIONS
     ───────────────────────────────────────────── */
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const addTextBox = useCallback((text = 'Nuevo texto...') => {
    const newEl: TemplateElement = {
      id: `el-${Date.now()}`,
      type: 'text',
      content: text,
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      fontSize: 24,
      fontFamily: 'Arial',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'center',
      color: '#000000',
      width: 400,
    }
    setElements((prev) => [...prev, newEl])
    setSelectedId(newEl.id)
  }, [])

  const updateElement = useCallback((id: string, u: Partial<TemplateElement>) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...u } : el)))
  }, [])

  const deleteElement = useCallback((id: string) => {
    setElements((prev) => prev.filter((el) => el.id !== id))
    setSelectedId(null)
  }, [])

  const selectedElement = elements.find((el) => el.id === selectedId)

  /* Insertar variable en la posición del cursor o al final del campo seleccionado */
  const handleInsertVariable = useCallback((varValue: string) => {
    if (selectedId && selectedElement) {
      const textarea = textareaRef.current
      let newContent = ''
      if (textarea) {
        const start = textarea.selectionStart ?? selectedElement.content.length
        const end = textarea.selectionEnd ?? selectedElement.content.length
        const before = selectedElement.content.substring(0, start)
        const after = selectedElement.content.substring(end)
        newContent = before + varValue + after

        updateElement(selectedId, { content: newContent })

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus()
            const newPos = start + varValue.length
            textareaRef.current.setSelectionRange(newPos, newPos)
          }
        }, 10)
      } else {
        newContent = selectedElement.content + ' ' + varValue
        updateElement(selectedId, { content: newContent })
      }
      toast.success(`Variable ${varValue} insertada`)
    } else {
      addTextBox(varValue)
    }
  }, [selectedId, selectedElement, updateElement, addTextBox])

  /* ─────────────────────────────────────────────
     BACKGROUND UPLOAD
     ───────────────────────────────────────────── */
  const handleUploadBg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 8 * 1024 * 1024) {
      toast.error('La imagen supera 8 MB. Usa una más liviana.')
      e.target.value = ''
      return
    }
    const fd = new FormData()
    fd.append('image', file)
    try {
      const res = await api.post('/document-templates/upload-image', fd)
      if (!res.data?.url) throw new Error('Bad response')
      setBgImageUrl(res.data.url)
      setBgImageKey(res.data.key || null)
      toast.success('Fondo cargado')
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'No se pudo subir la imagen.'
      toast.error(typeof msg === 'string' ? msg : 'No se pudo subir la imagen.')
    } finally {
      e.target.value = ''
    }
  }

  /* ─────────────────────────────────────────────
     SAVE
     ───────────────────────────────────────────── */
  const handleSave = async () => {
    if (!templateName.trim()) { toast.error('Escribe un nombre para la plantilla'); return }
    if (bgImageUrl?.startsWith('blob:')) { toast.error('Fondo inválido. Vuelve a cargarlo.'); return }
    setSaving(true)
    try {
      const payload = {
        name: templateName,
        content: {
          width: DOC_W, height: DOC_H,
          background: bgImageKey || bgImageUrl,
          elements: elements.map(({ id, ...rest }) => rest),
          isDefault: isDefaultTemplate,
        },
      }
      if (templateId) {
        await api.post(`/document-templates/pdf/${templateId}`, payload)
      } else {
        await api.post('/document-templates/pdf', payload)
      }
      toast.success('Diseño guardado exitosamente')
      queryClient.invalidateQueries({ queryKey: ['document-templates'] })
      router.push('/documents')
    } catch {
      toast.error('Error guardando el diseño')
    } finally {
      setSaving(false)
    }
  }

  const isReadOnly = isDefaultTemplate && user?.role === 'COORDINATOR'

  /** Abandona el editor descartando lo que no se haya guardado. */
  const handleCancel = () => {
    const hayTrabajo = elements.length > 0 || !!bgImageUrl || !!templateName.trim()
    if (hayTrabajo && !confirm('¿Salir sin guardar? Se perderán los cambios que no hayas guardado.')) return
    router.push('/documents')
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div className="h-[calc(100dvh-56px)] overflow-hidden bg-[#f1f5f9] flex items-center justify-center p-4">

      {/* Centered wrapper: canvas + sidebar together */}
      <div className="flex w-full max-w-[1400px] h-full gap-4">

      {/* ────────── LEFT: Canvas ────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative rounded-2xl bg-white/40 border border-gray-200/60 overflow-hidden">

        {/* Salir sin guardar: devuelve al listado descartando los cambios */}
        <button
          onClick={handleCancel}
          title="Salir sin guardar"
          aria-label="Salir del editor sin guardar"
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-lg bg-white border border-gray-200 shadow-sm text-gray-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 flex items-center justify-center transition-colors"
        >
          <X size={16} />
        </button>

        {/* Floating action: Change background */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex gap-1.5">
          <input ref={bgFileRef} type="file" accept="image/*" onChange={handleUploadBg} className="hidden" />
          <button
            onClick={() => bgFileRef.current?.click()}
            className="bg-white border border-gray-200 shadow-sm rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 transition-colors"
          >
            <ImageIcon size={14} />
            {bgImageUrl ? 'Cambiar Fondo' : 'Subir Fondo'}
          </button>
          {bgImageUrl && (
            <button
              onClick={() => { setBgImageUrl(null); setBgImageKey(null) }}
              className="bg-white border border-gray-200 shadow-sm rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Quitar fondo"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {/* Canvas area — auto-fit, no zoom, no drag */}
        <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden">
          <Stage
            width={canvasSize.w}
            height={canvasSize.h}
            ref={stageRef}
            x={docX}
            y={docY}
            scaleX={canvasSize.scale}
            scaleY={canvasSize.scale}
            /* Block all zoom / scroll / drag on the stage itself */
            draggable={false}
            onWheel={(e) => e.evt.preventDefault()}
            onMouseDown={(e) => { if (e.target === e.target.getStage()) setSelectedId(null) }}
            onTouchStart={(e) => { if (e.target === e.target.getStage()) setSelectedId(null) }}
          >
            <Layer>
              {/* White page */}
              <Rect
                x={0} y={0}
                width={DOC_W} height={DOC_H}
                fill="#ffffff"
                shadowColor="rgba(0,0,0,0.08)"
                shadowBlur={24}
                shadowOffset={{ x: 0, y: 4 }}
              />
              {/* Background image */}
              {bgImage && <KonvaImage image={bgImage} width={DOC_W} height={DOC_H} />}
              {/* Text elements */}
              {elements.map((el) => (
                <KonvaText
                  key={el.id}
                  id={el.id}
                  text={el.content}
                  x={el.x}
                  y={el.y}
                  fontSize={el.fontSize || 20}
                  fontFamily={el.fontFamily || 'Arial'}
                  fontStyle={
                    `${el.fontWeight === 'bold' ? 'bold ' : ''}${el.fontStyle === 'italic' ? 'italic' : ''}`.trim() || 'normal'
                  }
                  align={(el.textAlign as any) || 'left'}
                  fill={el.color || '#000'}
                  width={el.width || 400}
                  draggable
                  onDragStart={(e) => { e.cancelBubble = true }}
                  onDragEnd={(e) => {
                    e.cancelBubble = true
                    updateElement(el.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) })
                  }}
                  onClick={(e) => { e.cancelBubble = true; setSelectedId(el.id) }}
                  onTap={(e) => { e.cancelBubble = true; setSelectedId(el.id) }}
                  onTransformEnd={(e) => {
                    const n = e.target
                    updateElement(el.id, {
                      x: Math.round(n.x()),
                      y: Math.round(n.y()),
                      width: Math.max(50, Math.round(n.width() * n.scaleX())),
                    })
                    n.scaleX(1); n.scaleY(1)
                  }}
                />
              ))}
              {selectedId && <TransformerComponent selectedId={selectedId} stageRef={stageRef} />}
            </Layer>
          </Stage>
        </div>
      </div>

      {/* ────────── RIGHT: Sidebar ────────── */}
      <aside className="w-[280px] xl:w-[300px] shrink-0 bg-white border border-gray-200/60 rounded-2xl flex flex-col overflow-hidden shadow-sm">

        {/* Template name */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <input
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Nombre de la plantilla..."
            className="w-full text-[15px] font-semibold text-gray-900 placeholder-gray-400 bg-transparent border-none outline-none"
          />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Fields section ── */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-900 flex items-center gap-1.5 uppercase tracking-wide">
                <Layers size={14} className="text-gray-400" />
                Campos
              </h3>
              <button
                onClick={() => addTextBox()}
                className="text-[11px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-0.5 transition-colors"
              >
                <Plus size={13} /> Añadir
              </button>
            </div>

            <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
              {elements.map((el, i) => (
                <button
                  key={el.id}
                  onClick={() => setSelectedId(el.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all ${
                    selectedId === el.id
                      ? 'border-gray-900 bg-gray-900 text-white shadow-sm'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[10px] ${
                    selectedId === el.id ? 'bg-gray-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <Type size={12} />
                  </span>
                  <span className="text-xs font-medium truncate">{el.content || `Campo ${i + 1}`}</span>
                </button>
              ))}
              {elements.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                  <Type size={20} className="mx-auto mb-1.5 text-gray-300" />
                  <p className="text-[11px] text-gray-400">Sin campos aún. Haz clic en "Añadir".</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Field Properties (shows when selected) ── */}
          {selectedElement && (
            <div className="px-5 py-4 border-t border-gray-100 bg-slate-50/50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-900 flex items-center gap-1.5 uppercase tracking-wide">
                  <Settings size={14} className="text-gray-400" />
                  Propiedades del Campo
                </h3>
                <button
                  onClick={() => deleteElement(selectedId!)}
                  className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                  title="Eliminar campo"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="space-y-3">
                {/* Multi-line Textarea */}
                <Field label="Texto / Párrafo (admite varias líneas y variables)">
                  <textarea
                    ref={textareaRef}
                    rows={4}
                    value={selectedElement.content}
                    onChange={(e) => updateElement(selectedId!, { content: e.target.value })}
                    className="input-field font-sans text-xs leading-relaxed resize-y min-h-[90px] w-full p-2.5 bg-white border border-gray-200 rounded-lg text-gray-900 focus:border-blue-500 transition-all"
                    placeholder="Escribe el texto o selecciona variables abajo para insertar..."
                  />
                </Field>

                {/* Micro-chips for variable insertion inside current textarea */}
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">
                    ⚡ Insertar variable en la posición del cursor:
                  </label>
                  <div className="flex flex-wrap gap-1 max-h-[85px] overflow-y-auto pr-1">
                    {SYSTEM_VARIABLES.map((v) => (
                      <button
                        key={v.value}
                        onClick={() => handleInsertVariable(v.value)}
                        className="text-[9.5px] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-mono hover:bg-blue-100 hover:border-blue-300 transition-all active:scale-95 shrink-0"
                        title={`Insertar ${v.value}`}
                      >
                        + {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Family */}
                <Field label="Fuente">
                  <select
                    value={selectedElement.fontFamily || 'Arial'}
                    onChange={(e) => updateElement(selectedId!, { fontFamily: e.target.value })}
                    className="input-field"
                  >
                    <option value="Arial">Arial</option>
                    <option value="Helvetica">Helvetica</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Courier New">Courier New</option>
                    <option value="Verdana">Verdana</option>
                  </select>
                </Field>

                {/* Font Size + Weight */}
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Tamaño (px)">
                    <input
                      type="number"
                      value={selectedElement.fontSize || 24}
                      onChange={(e) => updateElement(selectedId!, { fontSize: Number(e.target.value) })}
                      className="input-field"
                    />
                  </Field>
                  <Field label="Estilo">
                    <select
                      value={selectedElement.fontWeight || 'normal'}
                      onChange={(e) => updateElement(selectedId!, { fontWeight: e.target.value })}
                      className="input-field"
                    >
                      <option value="normal">Normal</option>
                      <option value="bold">Negrita (Bold)</option>
                    </select>
                  </Field>
                </div>

                {/* Color + Alignment */}
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Color">
                    <div className="flex items-center gap-2 input-field !py-1">
                      <input
                        type="color"
                        value={selectedElement.color || '#000000'}
                        onChange={(e) => updateElement(selectedId!, { color: e.target.value })}
                        className="w-5 h-5 rounded border-none cursor-pointer bg-transparent p-0"
                      />
                      <span className="text-[10px] text-gray-500 font-mono">{selectedElement.color || '#000000'}</span>
                    </div>
                  </Field>
                  <Field label="Alineación">
                    <select
                      value={selectedElement.textAlign || 'center'}
                      onChange={(e) => updateElement(selectedId!, { textAlign: e.target.value })}
                      className="input-field"
                    >
                      <option value="left">Izquierda</option>
                      <option value="center">Centrado</option>
                      <option value="right">Derecha</option>
                    </select>
                  </Field>
                </div>

                {/* Block Width Control */}
                <Field label="Ancho del bloque (px)">
                  <input
                    type="number"
                    value={selectedElement.width || 400}
                    onChange={(e) => updateElement(selectedId!, { width: Number(e.target.value) })}
                    className="input-field"
                    placeholder="Ej: 800"
                  />
                </Field>

                {/* X / Y */}
                <div className="flex items-center gap-4 pt-1 text-[10px] text-gray-400">
                  <span>Posición X: {selectedElement.x}px</span>
                  <span>Posición Y: {selectedElement.y}px</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Variables ── */}
          <div className="px-5 py-4 border-t border-gray-100">
            <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-1">Variables Disponibles</h3>
            <p className="text-[10.5px] text-gray-500 mb-2">
              {selectedId ? 'Haz clic en una variable para insertarla en el campo seleccionado.' : 'Haz clic para crear un nuevo campo con la variable.'}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {SYSTEM_VARIABLES.map((v) => (
                <button
                  key={v.value}
                  onClick={() => handleInsertVariable(v.value)}
                  className="text-[10px] px-2 py-1.5 rounded border border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50 text-left truncate transition-colors active:scale-95"
                  title={`Insertar ${v.value}`}
                >
                  + {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Save button (sticky bottom) ── */}
        <div className="px-5 py-4 border-t border-gray-200 bg-white">
          <button
            onClick={handleSave}
            disabled={saving || isReadOnly}
            className={`w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              saving
                ? 'bg-gray-300 text-white cursor-wait'
                : isReadOnly
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.98] shadow-sm'
            }`}
          >
            {saving ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isReadOnly ? (
              '🔒 Solo Lectura'
            ) : (
              <><Save size={14} /> Guardar Diseño Final</>
            )}
          </button>
        </div>
      </aside>

      </div>{/* end centered wrapper */}

      {/* Inline utility styles */}
      <style jsx global>{`
        .input-field {
          width: 100%;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 6px 10px;
          font-size: 12px;
          color: #1f2937;
          background: #fff;
          outline: none;
          transition: border-color 0.15s;
        }
        .input-field:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59,130,246,.1);
        }
      `}</style>
    </div>
  )
}

/* ─── Transformer ─── */
function TransformerComponent({ selectedId, stageRef }: { selectedId: string; stageRef: React.RefObject<any> }) {
  const trRef = useRef<any>(null)

  useEffect(() => {
    if (trRef.current && stageRef.current) {
      const node = stageRef.current.findOne(`#${selectedId}`)
      if (node) {
        trRef.current.nodes([node])
        trRef.current.getLayer()?.batchDraw()
      }
    }
  }, [selectedId, stageRef])

  return (
    <Transformer
      ref={trRef}
      enabledAnchors={['middle-left', 'middle-right']}
      boundBoxFunc={(oldBox, newBox) => (newBox.width < 50 ? oldBox : newBox)}
      borderStroke="#3b82f6"
      borderDash={[4, 4]}
      anchorStroke="#3b82f6"
      anchorFill="#fff"
      anchorSize={8}
      anchorCornerRadius={4}
    />
  )
}

/* ─── Tiny label wrapper ─── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
