'use client'

import React, { useState, useRef, useCallback } from 'react'
import { Stage, Layer, Text as KonvaText, Image as KonvaImage, Transformer, Rect } from 'react-konva'
import useImage from 'use-image'
import { api } from '@/lib/axios'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

/* ───────────── Tipos ───────────── */
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

/* ───────────── Variables disponibles del backend ───────────── */
const SYSTEM_VARIABLES = [
  { label: 'Nombre Estudiante', value: '{{studentName}}' },
  { label: 'Cédula', value: '{{studentDni}}' },
  { label: 'Carrera', value: '{{programName}}' },
  { label: 'Facultad', value: '{{facultyName}}' },
  { label: 'Empresa', value: '{{companyName}}' },
  { label: 'Total Horas', value: '{{totalHours}}' },
  { label: 'Tutor', value: '{{tutorName}}' },
  { label: 'Nivel Práctica', value: '{{practiceLevel}}' },
  { label: 'Periodo Académico', value: '{{academicPeriod}}' },
  { label: 'Fecha Actual', value: '{{currentDate}}' },
]

/* ───────────── Componente Principal ───────────── */
export function CertificateDesignerFull() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const templateId = searchParams.get('templateId')
  const queryClient = useQueryClient()

  const [elements, setElements] = useState<TemplateElement[]>([])
  const [selectedId, selectShape] = useState<string | null>(null)
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [saving, setSaving] = useState(false)
  const [image] = useImage(bgImageUrl || '')
  const stageRef = useRef<any>(null)

  const CANVAS_W = 1123
  const CANVAS_H = 794

  // Si viene con templateId, cargar el template existente
  useQuery({
    queryKey: ['template', templateId],
    queryFn: async () => {
      if (!templateId) return null
      const res = await api.get(`/document-templates/${templateId}`)
      const tmpl = res.data
      setTemplateName(tmpl.name || '')
      const content = tmpl.content as any
      if (content?.background) setBgImageUrl(content.background)
      if (content?.elements) setElements(content.elements.map((el: any, i: number) => ({
        ...el, id: el.id || `loaded-${i}-${Date.now()}`
      })))
      return tmpl
    },
    enabled: !!templateId
  })

  /* ─── Funciones ─── */
  const addTextBox = useCallback((text: string = 'Escribe aquí...') => {
    const newEl: TemplateElement = {
      id: `el-${Date.now()}`,
      type: 'text',
      content: text,
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      fontSize: 20,
      fontFamily: 'Arial',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      color: '#000000',
      width: 400,
    }
    setElements(prev => [...prev, newEl])
    selectShape(newEl.id)
  }, [])

  const addVariable = useCallback((varText: string) => {
    addTextBox(varText)
  }, [addTextBox])

  const updateElement = useCallback((id: string, updates: Partial<TemplateElement>) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el))
  }, [])

  const deleteElement = useCallback((id: string) => {
    setElements(prev => prev.filter(el => el.id !== id))
    selectShape(null)
  }, [])

  const handleUploadBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('image', file)
    try {
      const response = await api.post('/document-templates/upload-image', formData)
      const serverUrl = `http://localhost:3001${response.data.url}`
      setBgImageUrl(serverUrl)
    } catch {
      setBgImageUrl(URL.createObjectURL(file))
    }
  }

  const handleSave = async () => {
    if (!templateName.trim()) {
      alert('Escribe un nombre para la plantilla')
      return
    }
    setSaving(true)
    const payload = {
      name: templateName,
      content: {
        width: CANVAS_W,
        height: CANVAS_H,
        background: bgImageUrl,
        elements: elements.map(({ id, ...rest }) => rest),
      }
    }
    try {
      if (templateId) {
        await api.post(`/document-templates/pdf/${templateId}`, payload)
      } else {
        await api.post('/document-templates/pdf', payload)
      }
      toast.success('Diseño guardado exitosamente')
      queryClient.invalidateQueries({ queryKey: ['document-templates'] })
      router.push('/documents')
    } catch (err) {
      toast.error('Error guardando el diseño')
    } finally {
      setSaving(false)
    }
  }

  const handleDragEnd = (e: any, id: string) => {
    updateElement(id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) })
  }

  const selectedElement = elements.find(el => el.id === selectedId)

  return (
    <div className="flex gap-0 h-[calc(100vh-80px)]">
      {/* ═══════ PANEL IZQUIERDO ═══════ */}
      <div className="w-80 bg-white border-r flex flex-col overflow-y-auto shrink-0">
        {/* Header */}
        <div className="p-4 border-b">
          <h2 className="font-bold text-lg">Diseñador de Certificados</h2>
          <p className="text-xs text-gray-500 mt-1">Sube un fondo, arrastra variables y texto</p>
        </div>

        {/* Nombre */}
        <div className="p-4 border-b space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Nombre del Diseño</label>
          <input
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Ej: Certificado de Aprobación"
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Fondo */}
        <div className="p-4 border-b space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Imagen de Fondo</label>
          <input type="file" accept="image/*" onChange={handleUploadBackground} className="w-full text-xs" />
          {bgImageUrl && <p className="text-[10px] text-green-600 truncate">✓ Imagen cargada</p>}
        </div>

        {/* Variables */}
        <div className="p-4 border-b space-y-3">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Variables del Sistema</label>
          <div className="grid grid-cols-2 gap-1.5">
            {SYSTEM_VARIABLES.map(v => (
              <button
                key={v.value}
                onClick={() => addVariable(v.value)}
                className="text-[11px] px-2 py-1.5 border rounded-md hover:bg-blue-50 hover:border-blue-300 text-left truncate transition-colors"
                title={v.value}
              >
                + {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Texto constante */}
        <div className="p-4 border-b">
          <button
            onClick={() => addTextBox('Escribe aquí...')}
            className="w-full px-4 py-2.5 bg-slate-800 text-white rounded-md hover:bg-slate-700 text-sm font-medium transition-colors"
          >
            + Nuevo Cuadro de Texto
          </button>
        </div>

        {/* ═══════ PROPIEDADES DEL ELEMENTO ═══════ */}
        {selectedElement && (
          <div className="p-4 border-b space-y-4 bg-blue-50/50">
            <label className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Propiedades</label>

            {/* Contenido */}
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[70px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={selectedElement.content}
              onChange={(e) => updateElement(selectedId!, { content: e.target.value })}
              placeholder="Texto o variable..."
            />

            {/* Tamaño y Color */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500">Tamaño</label>
                <input
                  type="number"
                  value={selectedElement.fontSize || 20}
                  onChange={(e) => updateElement(selectedId!, { fontSize: Number(e.target.value) })}
                  className="w-full border rounded-md px-2 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500">Color</label>
                <input
                  type="color"
                  value={selectedElement.color || '#000000'}
                  onChange={(e) => updateElement(selectedId!, { color: e.target.value })}
                  className="w-full h-[34px] border rounded-md cursor-pointer"
                />
              </div>
            </div>

            {/* Alineación */}
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500">Alineación</label>
              <div className="flex gap-1">
                {(['left', 'center', 'right', 'justify'] as const).map(align => (
                  <button
                    key={align}
                    onClick={() => updateElement(selectedId!, { textAlign: align })}
                    className={`flex-1 text-xs py-1.5 rounded-md border transition-colors ${
                      selectedElement.textAlign === align ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'
                    }`}
                  >
                    {align === 'left' ? '◁' : align === 'center' ? '≡' : align === 'right' ? '▷' : '⊞'}
                  </button>
                ))}
              </div>
            </div>

            {/* Negrita / Cursiva */}
            <div className="flex gap-2">
              <button
                onClick={() => updateElement(selectedId!, { fontWeight: selectedElement.fontWeight === 'bold' ? 'normal' : 'bold' })}
                className={`flex-1 py-2 text-sm font-bold rounded-md border transition-colors ${
                  selectedElement.fontWeight === 'bold' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'
                }`}
              >
                N
              </button>
              <button
                onClick={() => updateElement(selectedId!, { fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic' })}
                className={`flex-1 py-2 text-sm italic rounded-md border transition-colors ${
                  selectedElement.fontStyle === 'italic' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'
                }`}
              >
                C
              </button>
            </div>

            {/* Ancho del cuadro */}
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500">Ancho del cuadro (px)</label>
              <input
                type="number"
                value={selectedElement.width || 400}
                onChange={(e) => updateElement(selectedId!, { width: Number(e.target.value) })}
                className="w-full border rounded-md px-2 py-1.5 text-sm"
              />
            </div>

            {/* Fuente */}
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500">Fuente</label>
              <select
                value={selectedElement.fontFamily || 'Arial'}
                onChange={(e) => updateElement(selectedId!, { fontFamily: e.target.value })}
                className="w-full border rounded-md px-2 py-1.5 text-sm bg-white"
              >
                <option value="Arial">Arial</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Georgia">Georgia</option>
                <option value="Courier New">Courier New</option>
                <option value="Verdana">Verdana</option>
              </select>
            </div>

            <button
              onClick={() => deleteElement(selectedId!)}
              className="w-full py-2 text-sm text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
            >
              Eliminar Elemento
            </button>
          </div>
        )}

        {/* Botones de Acción */}
        <div className="p-4 mt-auto border-t flex flex-col gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-md shadow-md transition-colors"
          >
            {saving ? 'Guardando...' : '💾 Guardar Diseño Final'}
          </button>
          <button
            onClick={() => router.push('/documents')}
            className="w-full py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold rounded-md transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>

      {/* ═══════ CANVAS CENTRAL ═══════ */}
      <div 
        className="flex-1 bg-slate-200 overflow-auto flex items-center justify-center p-8"
        onClick={(e) => {
          if (e.target === e.currentTarget) selectShape(null)
        }}
      >
        <div style={{ 
          width: CANVAS_W, 
          height: CANVAS_H, 
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          background: 'white'
        }}>
          <Stage 
            width={CANVAS_W} 
            height={CANVAS_H} 
            ref={stageRef}
            onMouseDown={(e) => {
              if (e.target === e.target.getStage()) selectShape(null)
            }}
          >
            <Layer>
              {/* Fondo blanco base */}
              <Rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="#ffffff" />

              {/* Imagen de fondo */}
              {image && <KonvaImage image={image} width={CANVAS_W} height={CANVAS_H} />}

              {/* Elementos de texto */}
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
                  align={el.textAlign as any || 'left'}
                  fill={el.color || '#000'}
                  width={el.width || 400}
                  draggable
                  onDragEnd={(e) => handleDragEnd(e, el.id)}
                  onClick={() => selectShape(el.id)}
                  onTap={() => selectShape(el.id)}
                  onTransformEnd={(e) => {
                    const node = e.target
                    updateElement(el.id, {
                      x: Math.round(node.x()),
                      y: Math.round(node.y()),
                      width: Math.max(50, Math.round(node.width() * node.scaleX())),
                    })
                    node.scaleX(1)
                    node.scaleY(1)
                  }}
                />
              ))}

              {/* Transformer del elemento seleccionado */}
              {selectedId && (
                <TransformerComponent selectedId={selectedId} stageRef={stageRef} />
              )}
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  )
}

/* ─── Componente Transformer separado ─── */
function TransformerComponent({ selectedId, stageRef }: { selectedId: string; stageRef: React.RefObject<any> }) {
  const trRef = useRef<any>(null)

  React.useEffect(() => {
    if (trRef.current && stageRef.current) {
      const selectedNode = stageRef.current.findOne(`#${selectedId}`)
      if (selectedNode) {
        trRef.current.nodes([selectedNode])
        trRef.current.getLayer()?.batchDraw()
      }
    }
  }, [selectedId, stageRef])

  return (
    <Transformer
      ref={trRef}
      enabledAnchors={['middle-left', 'middle-right']}
      boundBoxFunc={(oldBox, newBox) => {
        if (newBox.width < 50) return oldBox
        return newBox
      }}
    />
  )
}
