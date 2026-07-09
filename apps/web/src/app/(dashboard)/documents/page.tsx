'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Stage, Layer, Text as KonvaText, Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth-store'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText } from 'lucide-react'

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
      <div className="flex flex-col w-full min-h-[calc(100vh-72px)] bg-[#f7f7f8] pt-6 pb-12 px-4 lg:px-8">
        <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-8">
          
          <div>
            <p className="text-[#6b7280] mt-1 text-[15px] font-medium">Gestiona los diseños de certificados PDF y plantillas de oficios DOCX.</p>
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
          <div className="flex flex-col gap-4 mt-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <h2 className="text-[20px] font-semibold text-[#111827]">Oficios y Solicitudes (DOCX)</h2>
                <a 
                  href="/templates/Plantilla Solicitud de prácticas Oficio No.docx" 
                  download="Plantilla Solicitud de prácticas Oficio No.docx"
                  title="Descargar plantilla de ejemplo"
                  className="flex items-center justify-center w-8 h-8 rounded-[10px] text-[#9ca3af] hover:text-[#111827] hover:bg-white border border-transparent hover:border-[#eef2f7] hover:shadow-sm transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
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
                  className="flex items-center gap-2 h-[40px] px-4 rounded-[12px] bg-[#111827] hover:bg-[#1f2937] text-white text-[14px] font-medium shadow-soft hover:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
                >
                  {isUploading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Subiendo...
                    </span>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                      Subir Plantilla DOCX
                    </>
                  )}
                </button>
              </div>
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
              {docxTemplates.map((template) => (
                <div key={template.id} className="group flex flex-col p-4 rounded-[16px] border border-[#eef2f7] bg-white shadow-sm hover:shadow-soft transition-all">
                  <div className="w-full h-32 rounded-[12px] bg-[#f8fafc] border border-[#eef2f7] flex items-center justify-center mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#3b82f6]">
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
                  </div>
                </div>
              ))}
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
  onRename 
}: { 
  template: DocumentTemplate; 
  isDefault?: boolean; 
  onClick: () => void; 
  onDelete: (id: string, e: React.MouseEvent) => void; 
  onMakeDefault: (e: React.MouseEvent) => void;
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
