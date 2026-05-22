'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Stage, Layer, Text as KonvaText, Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface DocumentTemplate {
  id: string
  name: string
  type: string
  content: any
  createdAt: string
}

// Global variable for default name
const DEFAULT_TEMPLATE_NAME = 'Certificado de Prácticas Oficial'

export default function DocumentsPage() {
  const router = useRouter()

  const { data: templates, isLoading } = useQuery({
    queryKey: ['document-templates'],
    queryFn: async () => {
      const res = await api.get<DocumentTemplate[]>('/document-templates')
      return res.data
    }
  })

  const queryClient = useQueryClient()
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, template: DocumentTemplate } | null>(null)
  const [deleteModal, setDeleteModal] = useState<{ show: boolean, templateId: string | null }>({ show: false, templateId: null })
  const [renameModal, setRenameModal] = useState<{ show: boolean, templateId: string | null, currentName: string }>({ show: false, templateId: null, currentName: '' })
  const [newName, setNewName] = useState('')
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

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

  const handleMakeDefault = async (template: DocumentTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!templates) return
    
    try {
      // Find current default and remove its default status
      const currentDefault = templates.find(t => t.content?.isDefault === true || t.name === DEFAULT_TEMPLATE_NAME)
      if (currentDefault && currentDefault.id !== template.id) {
        await api.post(`/document-templates/pdf/${currentDefault.id}`, {
          name: currentDefault.name, // Keep its original name
          content: { ...currentDefault.content, isDefault: false }
        })
      }
      
      // Set new default
      await api.post(`/document-templates/pdf/${template.id}`, {
        name: template.name, // Keep its original name
        content: { ...template.content, isDefault: true }
      })
      
      queryClient.invalidateQueries({ queryKey: ['document-templates'] })
    } catch (error) {
      console.error('Error updating default template:', error)
      alert('Error al actualizar la plantilla predeterminada')
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
      // facultyId will be taken from token in backend

      await api.post('/document-templates/docx', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      queryClient.invalidateQueries({ queryKey: ['document-templates'] })
      alert('Plantilla DOCX subida exitosamente')
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
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documentos y Plantillas</h1>
          <p className="text-muted-foreground mt-1">Gestiona los diseños de certificados PDF y plantillas de oficios DOCX.</p>
        </div>

        {/* Sección de Certificados PDF */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold">Certificados PDF (Diseños Visuales)</h2>
            <a 
              href="/templates/Certificado Real.png" 
              download="Certificado Real.png"
              title="Descargar &#34;plantilla para certificado&#34;"
              className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors inline-flex"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </a>
          </div>
          
          {isLoading ? (
            <div className="flex justify-center p-8"><span className="animate-pulse">Cargando diseños...</span></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              
              {/* Tarjeta: Crear Nuevo Diseño (siempre visible) */}
              <button
                onClick={() => router.push('/documents/designer')}
                className="group flex flex-col items-center justify-center gap-3 min-h-[220px] rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-100/70 hover:border-blue-500 transition-all duration-200 cursor-pointer"
              >
                <div className="w-14 h-14 rounded-full bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </div>
                <span className="font-semibold text-blue-700 text-sm">Crear Nuevo Diseño</span>
                <span className="text-xs text-blue-500">Abre el diseñador visual de Konva</span>
              </button>

              {/* Tarjetas de Diseños Guardados */}
              {pdfTemplates.map((template) => {
                const isDefault = template.content?.isDefault === true || template.name === DEFAULT_TEMPLATE_NAME;
                return (
                  <TemplateCard 
                    key={template.id} 
                    template={template}
                    isDefault={isDefault}
                    onClick={() => router.push(`/documents/designer?templateId=${template.id}`)} 
                    onDelete={handleDelete}
                    onMakeDefault={(e) => handleMakeDefault(template, e)}
                    onRename={handleRenameClick}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Sección de Oficios DOCX */}
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">Oficios y Solicitudes (DOCX)</h2>
              <a 
                href="/templates/Plantilla Solicitud de prácticas Oficio No.docx" 
                download="Plantilla Solicitud de prácticas Oficio No.docx"
                title="Descargar &#34;plantilla para solicitud de prácticas&#34;"
                className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors inline-flex"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </a>
            </div>
            
            <div>
              <input 
                type="file" 
                accept=".docx" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleDocxUpload} 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors disabled:opacity-50"
              >
                {isUploading ? 'Subiendo...' : 'Subir Plantilla Word'}
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {docxTemplates.length === 0 && !isLoading && (
              <div className="col-span-full text-center py-8 text-muted-foreground border rounded-xl bg-card">
                Aún no hay plantillas DOCX cargadas. Haz clic en "Subir Plantilla Word" para agregar una.
              </div>
            )}
            {docxTemplates.map((template) => (
              <div key={template.id} className="flex flex-col gap-2 p-4 rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow">
                <div className="w-full h-32 rounded-lg bg-gradient-to-br from-indigo-100 to-indigo-50 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <h3 className="font-semibold text-sm truncate flex-1">{template.name}</h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRenameClick(template.id, template.name)
                      }}
                      className="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                      title="Renombrar plantilla"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(template.id)
                      }}
                      className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Eliminar plantilla"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  Creado el {new Date(template.createdAt).toLocaleDateString('es-ES')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Modal de Confirmación de Borrado */}
        {deleteModal.show && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDeleteModal({ show: false, templateId: null })}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 transform transition-all" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Eliminar Diseño</h3>
              <p className="text-slate-500 mb-6">
                ¿Estás completamente seguro de que deseas eliminar este diseño? Esta acción no se puede deshacer y el diseño se perderá para siempre.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button 
                  onClick={() => setDeleteModal({ show: false, templateId: null })}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmDelete}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm shadow-red-500/20 flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  Sí, Eliminar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Renombrar Plantilla */}
        {renameModal.show && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setRenameModal({ show: false, templateId: null, currentName: '' })}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 transform transition-all" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Renombrar Plantilla</h3>
              <p className="text-slate-500 text-sm mb-4">
                Ingresa el nuevo nombre para la plantilla:
              </p>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 mb-6 text-slate-900"
                placeholder="Nombre de la plantilla"
              />
              <div className="flex items-center justify-end gap-3">
                <button 
                  onClick={() => setRenameModal({ show: false, templateId: null, currentName: '' })}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmRename}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm shadow-blue-500/20 flex items-center gap-2"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

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
  onRename 
}: { 
  template: DocumentTemplate; 
  isDefault?: boolean; 
  onClick: () => void; 
  onDelete: (id: string, e: React.MouseEvent) => void; 
  onMakeDefault: (e: React.MouseEvent) => void;
  onRename: (id: string, name: string, e: React.MouseEvent) => void;
}) {
  // Generar miniatura del JSON del diseño
  const content = template.content as any
  const elementCount = content?.schemas?.[0]?.length || content?.elements?.length || 0

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={`w-full relative flex flex-col gap-2 p-4 rounded-xl border bg-card shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer text-left
          ${isDefault ? 'border-green-500 ring-2 ring-green-500/20 shadow-green-500/10' : 'hover:border-blue-300'}`}
      >
        {isDefault && (
          <div className="absolute -top-3 -right-3 z-10 bg-green-500 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-md uppercase tracking-wide flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Predeterminado
          </div>
        )}
        
        {/* Miniatura del diseño */}
        <div className="w-full h-40 rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 border relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <MiniTemplatePreview template={template} />
          </div>
          {/* Badge de cantidad de elementos */}
          <div className="absolute bottom-2 left-2 bg-blue-100/80 text-blue-800 text-[10px] px-2 py-0.5 rounded-md font-medium backdrop-blur-sm">
            {elementCount} variables
          </div>
        </div>

        <h3 className={`font-bold text-sm truncate transition-colors pr-6 ${isDefault ? 'text-green-700' : 'group-hover:text-blue-600'}`}>
          {template.name}
        </h3>
        <span className="text-xs text-muted-foreground">
          Creado el {new Date(template.createdAt).toLocaleDateString('es-ES')}
        </span>
      </button>
      
      {/* Botones Flotantes (Aparecen en hover o si están activos) */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 z-20">
        <button
          onClick={onMakeDefault}
          className={`p-2 rounded-lg transition-all shadow-sm
            ${isDefault ? 'bg-green-100 text-green-600 opacity-100' : 'bg-white text-gray-400 opacity-0 group-hover:opacity-100 hover:text-green-500 hover:bg-green-50'}`}
          title={isDefault ? "Plantilla predeterminada" : "Establecer como predeterminada"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={isDefault ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
        </button>

        <button
          onClick={(e) => onRename(template.id, template.name, e)}
          className="p-2 bg-white text-blue-500 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-blue-100 hover:text-blue-600 transition-all shadow-sm"
          title="Renombrar plantilla"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        
        {!isDefault && (
          <button
            onClick={(e) => onDelete(template.id, e)}
            className="p-2 bg-white text-red-500 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 transition-all shadow-sm"
            title="Eliminar plantilla"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  const bgUrl = content?.background ?? null;
  const [bgImage] = useImage(bgUrl);
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
