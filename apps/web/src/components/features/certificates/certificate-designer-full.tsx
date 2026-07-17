'use client'

import React, { useState, useRef, useCallback } from 'react'
import { Stage, Layer, Text as KonvaText, Image as KonvaImage, Transformer, Rect } from 'react-konva'
import useImage from 'use-image'
import { api } from '@/lib/axios'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth-store'

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
  const user = useAuthStore((state) => state.user)

  const [elements, setElements] = useState<TemplateElement[]>([])
  const [selectedId, selectShape] = useState<string | null>(null)
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null)
  // Key durable en MinIO (lo que se persiste); bgImageUrl es la URL para mostrar
  const [bgImageKey, setBgImageKey] = useState<string | null>(null)
  const bgFileInputRef = useRef<HTMLInputElement>(null)
  const [templateName, setTemplateName] = useState('')
  const [saving, setSaving] = useState(false)
  const [isDefaultTemplate, setIsDefaultTemplate] = useState(false)
  const [image] = useImage(bgImageUrl || '')
  const stageRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [stageScale, setStageScale] = useState(1)

  const CANVAS_W = 1123
  const CANVAS_H = 794

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    setStageScale(newScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  // Centrar el canvas inicialmente
  React.useEffect(() => {
    if (containerRef.current) {
      const containerW = containerRef.current.clientWidth;
      const containerH = containerRef.current.clientHeight;
      // Calcular escala inicial para que quepa en el contenedor (con margen)
      const scale = Math.min(
        (containerW - 40) / CANVAS_W,
        (containerH - 40) / CANVAS_H
      );
      setStageScale(scale);
      setStagePos({
        x: (containerW - CANVAS_W * scale) / 2,
        y: (containerH - CANVAS_H * scale) / 2,
      });
    }
  }, []);

  // Si viene con templateId, cargar el template existente
  useQuery({
    queryKey: ['template', templateId],
    queryFn: async () => {
      if (!templateId) return null
      const res = await api.get(`/document-templates/${templateId}`)
      const tmpl = res.data
      setTemplateName(tmpl.name || '')
      const content = tmpl.content as any
      const bg = content?.background ? String(content.background) : ''
      if (bg.startsWith('blob:')) {
        // Fondos "blob:" corruptos de la versión anterior: se ignoran.
      } else if (bg.startsWith('templates/backgrounds/')) {
        // Fondo en MinIO: pedimos una URL prefirmada para mostrarlo.
        setBgImageKey(bg)
        api.get('/document-templates/bg-url', { params: { key: bg } })
          .then((r) => setBgImageUrl(r.data?.url || null))
          .catch(() => setBgImageUrl(null))
      } else if (bg) {
        // Fondos antiguos: /uploads/..., http..., /templates/... → uso directo.
        setBgImageUrl(bg)
      }
      if (content?.elements) setElements(content.elements.map((el: any, i: number) => ({
        ...el, id: el.id || `loaded-${i}-${Date.now()}`
      })))
      
      const isDefault = tmpl.name === 'Certificado de Prácticas Oficial' || content?.isDefault === true
      setIsDefaultTemplate(isDefault)
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

    // Validación de tamaño (evita PNG enormes que ralentizan o rompen el guardado)
    const MAX_MB = 8
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`La imagen supera ${MAX_MB} MB. Usa una más liviana (idealmente < 2 MB).`)
      e.target.value = ''
      return
    }

    const formData = new FormData()
    formData.append('image', file)
    try {
      const response = await api.post('/document-templates/upload-image', formData)
      const serverUrl = response.data?.url
      const serverKey = response.data?.key
      if (!serverUrl || typeof serverUrl !== 'string') {
        throw new Error('Respuesta inválida del servidor')
      }
      setBgImageUrl(serverUrl)          // URL prefirmada para vista previa
      setBgImageKey(serverKey || null)  // key durable que se guardará
      toast.success('Imagen de fondo cargada')
    } catch (err) {
      // IMPORTANTE: NO usar URL.createObjectURL como respaldo. Esa URL "blob:"
      // solo vive en esta sesión; si se guardara, al recargar el diseño
      // aparecería en blanco. Mejor avisar y conservar el fondo anterior.
      toast.error('No se pudo subir la imagen. Verifica que el servidor esté activo e inténtalo de nuevo.')
      console.error('Error subiendo imagen de fondo:', err)
    } finally {
      e.target.value = ''
    }
  }

  const handleSave = async () => {
    if (!templateName.trim()) {
      alert('Escribe un nombre para la plantilla')
      return
    }
    // Nunca persistir una URL temporal "blob:" (quedaría en blanco al recargar)
    if (bgImageUrl && bgImageUrl.startsWith('blob:')) {
      toast.error('La imagen de fondo no se subió correctamente. Vuelve a cargarla antes de guardar.')
      return
    }
    setSaving(true)
    const payload = {
      name: templateName,
      content: {
        width: CANVAS_W,
        height: CANVAS_H,
        // Se guarda la key de MinIO (durable). Si es un fondo antiguo sin key,
        // se conserva su URL tal cual para no romper plantillas existentes.
        background: bgImageKey || bgImageUrl,
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

        {/* Fondo: zona clickeable evidente — con miniatura y acciones cuando ya hay imagen */}
        <div className="p-4 border-b space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Imagen de Fondo</label>
          <input
            ref={bgFileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUploadBackground}
            className="hidden"
          />
          {bgImageUrl ? (
            <div className="relative group/bg rounded-lg overflow-hidden border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bgImageUrl} alt="Fondo actual" className="w-full h-[86px] object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover/bg:bg-black/45 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover/bg:opacity-100">
                <button
                  onClick={() => bgFileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-white text-[12px] font-semibold text-slate-800 rounded-md shadow hover:bg-slate-100"
                >
                  Cambiar fondo
                </button>
                <button
                  onClick={() => { setBgImageUrl(null); setBgImageKey(null) }}
                  className="px-3 py-1.5 bg-red-500 text-[12px] font-semibold text-white rounded-md shadow hover:bg-red-600"
                >
                  Quitar
                </button>
              </div>
              <span className="absolute bottom-1 left-1.5 text-[9.5px] font-semibold text-white bg-black/50 px-1.5 py-0.5 rounded pointer-events-none group-hover/bg:opacity-0 transition-opacity">
                Pasa el mouse para cambiar o quitar
              </span>
            </div>
          ) : (
            <button
              onClick={() => bgFileInputRef.current?.click()}
              className="w-full h-[86px] border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/50 rounded-lg flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-blue-600 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              <span className="text-[12px] font-semibold">Haz click para subir el fondo</span>
              <span className="text-[10px]">PNG o JPG, tamaño carta</span>
            </button>
          )}
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
            disabled={saving || (isDefaultTemplate && user?.role === 'COORDINATOR')}
            className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-md shadow-md transition-colors"
          >
            {saving 
              ? 'Guardando...' 
              : (isDefaultTemplate && user?.role === 'COORDINATOR' ? '🔒 Solo Lectura' : '💾 Guardar Diseño Final')
            }
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
        ref={containerRef}
        className="flex-1 bg-slate-200 overflow-hidden relative"
      >
        <Stage 
          width={typeof window !== 'undefined' ? window.innerWidth - 320 : CANVAS_W} 
          height={typeof window !== 'undefined' ? window.innerHeight - 80 : CANVAS_H} 
          ref={stageRef}
          onWheel={handleWheel}
          draggable
          x={stagePos.x}
          y={stagePos.y}
          scaleX={stageScale}
          scaleY={stageScale}
          onDragEnd={(e) => {
            // Solo actualizar pos del stage si lo que se arrastra es el stage
            if (e.target === stageRef.current) {
              setStagePos({ x: e.target.x(), y: e.target.y() });
            }
          }}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) selectShape(null)
          }}
        >
          <Layer>
            {/* Sombra y Fondo blanco base simulando el papel */}
            <Rect 
              x={0} y={0} 
              width={CANVAS_W} height={CANVAS_H} 
              fill="#ffffff" 
              shadowColor="black"
              shadowBlur={10}
              shadowOpacity={0.2}
              shadowOffset={{ x: 5, y: 5 }}
            />

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
                onDragStart={(e) => {
                  e.cancelBubble = true; // Evitar arrastrar el stage
                }}
                onDragEnd={(e) => {
                  e.cancelBubble = true;
                  handleDragEnd(e, el.id);
                }}
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
        
        {/* Controles de Zoom Overlay */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-white rounded-lg shadow-md p-1 border border-gray-200">
          <button 
            onClick={() => {
              const newScale = stageScale / 1.2;
              setStageScale(newScale);
            }} 
            className="p-2 hover:bg-gray-100 rounded text-gray-700 font-bold"
            title="Alejar"
          >
            -
          </button>
          <span className="text-xs font-semibold px-2 min-w-[3rem] text-center">{Math.round(stageScale * 100)}%</span>
          <button 
            onClick={() => {
              const newScale = stageScale * 1.2;
              setStageScale(newScale);
            }} 
            className="p-2 hover:bg-gray-100 rounded text-gray-700 font-bold"
            title="Acercar"
          >
            +
          </button>
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
