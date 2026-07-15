'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, MoreHorizontal, Building2, CheckSquare, Printer, AlertCircle, FileText, ArrowLeftRight, Loader2 } from 'lucide-react'
import { api } from '@/lib/axios'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface GeneratedDoc {
  id: string
  status?: 'VALID' | 'SUPERSEDED' | 'INVALIDATED'
  documentCode?: string
  documentType?: string
  invalidReason?: string
  template: { type: string, name: string }
}

export interface Practice {
  id: string
  studentId: string
  companyId?: string
  student: {
    firstName: string
    lastName: string
    dni: string
    phone?: string
    user?: { email: string }
    generatedDocs?: GeneratedDoc[]
  }
  company?: {
    id?: string
    name: string
    contactName: string
  }
  tutorName: string
  academicLevel: string
  practiceLevel: string
  status: string
  totalHours: number
}

export interface Group {
  name: string
  count: number
  hours: number
  items: Practice[]
}

interface EntityListProps {
  groups: Group[]
  selectedIds: Set<string>
  onToggleSelection: (id: string) => void
  onToggleAll: (groupId: string, items: Practice[]) => void
  onGenerateSolicitud?: (items: Practice[]) => void
  isGenerating?: boolean
  onSelectPractice?: (p: Practice) => void
  activePracticeId?: string | null
  isGrouped?: boolean
  onUpdateStatus?: (id: string, newStatus: string) => void
  onEditPhone?: (studentId: string, phone: string) => void
  /** Abre el buscador de reasignación de empresa para esta práctica */
  onReassign?: (p: Practice) => void
  /** Docs recién invalidados por una reasignación: disparan la animación de "quiebre" */
  recentlyInvalidatedDocIds?: Set<string>
  /** Click en un mini-ícono de documento: navega a su instancia en /certificates */
  onDocumentClick?: (docId: string) => void
}

/** Estado efectivo del ícono de solicitud (DOCX) de un estudiante. */
function getDocxState(docs: GeneratedDoc[]) {
  const docx = docs.filter(d => d.template.type === 'DOCX')
  const valid = docx.find(d => (d.status ?? 'VALID') === 'VALID')
  if (valid) return { state: 'valid' as const, doc: valid }
  const stale = docx.find(d => d.status === 'SUPERSEDED' || d.status === 'INVALIDATED')
  if (stale) return { state: 'stale' as const, doc: stale }
  return { state: 'none' as const, doc: undefined }
}

export function EntityList({ 
  groups, 
  selectedIds, 
  onToggleSelection, 
  onToggleAll, 
  onGenerateSolicitud, 
  isGenerating,
  onSelectPractice,
  activePracticeId,
  isGrouped,
  onUpdateStatus,
  onEditPhone,
  onReassign,
  recentlyInvalidatedDocIds,
  onDocumentClick
}: EntityListProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ id: string, studentId: string, currentPhone: string, x: number, y: number } | null>(null)
  const [editingPhoneStudentId, setEditingPhoneStudentId] = useState<{id: string, phone: string} | null>(null)
  const [hoveredPhoneAlert, setHoveredPhoneAlert] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{x: number, y: number}>({x:0,y:0})

  useEffect(() => {
    const closeMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Don't close if clicking inside the context menu itself
      if (target.closest('[data-context-menu]')) return
      setContextMenu(null)
    }
    window.addEventListener('mousedown', closeMenu)
    return () => window.removeEventListener('mousedown', closeMenu)
  }, [])

  const toggleGroup = (groupName: string) => {
    const next = new Set(collapsedGroups)
    if (next.has(groupName)) next.delete(groupName)
    else next.add(groupName)
    setCollapsedGroups(next)
  }

  const handleContextMenu = (e: React.MouseEvent, practice: Practice) => {
    e.preventDefault()
    e.stopPropagation()
    // Toggle: if already open for this practice, close it
    if (contextMenu && contextMenu.id === practice.id) {
      setContextMenu(null)
      return
    }
    setContextMenu({ id: practice.id, studentId: practice.studentId, currentPhone: practice.student.phone || '', x: e.clientX, y: e.clientY })
  }

  const changeStatus = (id: string, status: string) => {
    if (onUpdateStatus) onUpdateStatus(id, status)
    setContextMenu(null)
  }

  return (
    <>
    <div className="flex flex-col gap-[24px]">
      {groups.map((group, gIdx) => {
        const isCollapsed = collapsedGroups.has(group.name)
        const groupSelectedCount = group.items.filter(p => selectedIds.has(p.id)).length
        const allGroupSelected = groupSelectedCount === group.items.length && group.items.length > 0

        // Grupo con solicitud desactualizada: algún estudiante tiene su oficio
        // invalidado (p.ej. por reasignación de empresa) y ninguno vigente.
        const hasStaleSolicitud = isGrouped && group.items.some(
          p => getDocxState(p.student.generatedDocs || []).state === 'stale'
        )
        const groupHasSolicitud = group.items.some(
          p => getDocxState(p.student.generatedDocs || []).state === 'valid'
        )
        // Estudiantes del grupo sin solicitud vigente: no pueden certificarse
        const missingSolicitudCount = group.items.filter(
          p => getDocxState(p.student.generatedDocs || []).state !== 'valid'
        ).length

        return (
          <div key={gIdx} className="flex flex-col gap-[12px]">
            {/* Group Header */}
            <div 
              className="flex items-center justify-between px-[20px] py-[16px] bg-white rounded-[16px] border border-transparent shadow-soft cursor-pointer hover:bg-slate-50 transition-colors group/header"
              onClick={() => toggleGroup(group.name)}
            >
              <div className="flex items-center gap-4">
                <div 
                  className="flex items-center justify-center w-[36px] h-[36px] shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleAll(group.name, group.items)
                  }}
                >
                  <input 
                    type="checkbox"
                    checked={allGroupSelected}
                    readOnly
                    className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </div>
                
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                  {isGrouped ? <Building2 className="w-5 h-5" /> : (isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />)}
                </div>
                
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <h3 className="text-[16px] font-semibold text-[#111827]">{group.name}</h3>
                  <span className="text-[14px] font-medium text-[#6b7280]">{group.count} registros</span>
                  {!isGrouped && (
                    <>
                      <div className="hidden sm:block w-1 h-1 rounded-full bg-[#e5e7eb]" />
                      <span className="hidden sm:block text-[14px] font-medium text-[#6b7280]">{group.hours} horas</span>
                    </>
                  )}
                  {hasStaleSolicitud && (
                    <span className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-semibold px-2.5 py-1 rounded-full">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Solicitud desactualizada
                    </span>
                  )}
                </div>
              </div>

              {/* La solicitud es SIEMPRE del grupo completo: el oficio lista a
                  todo el equipo de la empresa, así que no existe la variante
                  individual (ni la tentación de seleccionar unos pocos). */}
              {onGenerateSolicitud && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onGenerateSolicitud(group.items)
                  }}
                  disabled={isGenerating}
                  className={cn(
                    "h-8 px-4 flex items-center gap-2 rounded-lg text-white text-[13px] font-medium shadow-soft disabled:opacity-50 shrink-0",
                    hasStaleSolicitud
                      ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20"
                      : groupHasSolicitud
                        ? "bg-white !text-slate-600 border border-slate-200 hover:bg-slate-50 shadow-none"
                        : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                  )}
                  title={`Genera un único oficio para los ${group.count} estudiantes de ${group.name}`}
                >
                  {isGenerating ? 'Generando...' : (
                    <>
                      <Printer className="w-4 h-4" />
                      {hasStaleSolicitud ? 'Regenerar Solicitud' : groupHasSolicitud ? 'Regenerar' : `Solicitud Grupal (${group.count})`}
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Student Cards */}
            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn("flex flex-col gap-[8px] overflow-hidden", isGrouped ? "pl-6" : "")}
                >
                  {group.items.map((practice) => {
                    const isSelected = selectedIds.has(practice.id)
                    const isActive = activePracticeId === practice.id
                    // Sin solicitud vigente = no certificable. Se marca en la
                    // fila para que se entienda por qué bloquea la selección.
                    const blocksCertificate = getDocxState(practice.student.generatedDocs || []).state !== 'valid'

                    return (
                      <motion.div
                        key={practice.id}
                        onClick={() => onSelectPractice?.(practice)}
                        onContextMenu={(e) => handleContextMenu(e as any, practice)}
                        whileHover={{ y: -1, boxShadow: "0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.03)" }}
                        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                        className={cn(
                          "relative flex items-center h-[72px] px-[18px] bg-white rounded-[16px] border cursor-pointer group transition-colors",
                          isActive ? "border-blue-300 ring-1 ring-blue-100 bg-blue-50/20" : "border-transparent",
                          isSelected && blocksCertificate && "border-amber-200 bg-amber-50/30"
                        )}
                      >
                        {/* Checkbox */}
                        <div
                          className="w-[40px] flex items-center justify-center shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            onToggleSelection(practice.id)
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className={cn(
                              "w-5 h-5 rounded border-slate-300 focus:ring-blue-500 cursor-pointer",
                              isSelected && blocksCertificate ? "text-amber-500" : "text-blue-600"
                            )}
                          />
                        </div>

                        {/* Avatar */}
                        <div className="flex items-center shrink-0 mr-4">
                          <img 
                            src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${practice.student.firstName}${practice.student.lastName}`} 
                            alt="Avatar" 
                            className="w-[36px] h-[36px] rounded-full bg-[#f8fafc] border border-slate-100" 
                          />
                        </div>

                        {/* Name & Role */}
                        <div className="flex flex-col flex-1 min-w-[180px] truncate pr-4">
                          <span className="text-[14px] font-semibold text-[#111827] truncate flex items-center gap-2">
                            {practice.student.firstName} {practice.student.lastName}
                            {!practice.student.phone && (
                              <div 
                                className="relative flex items-center"
                                onMouseEnter={(e) => {
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                  setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top })
                                  setHoveredPhoneAlert(practice.id)
                                }}
                                onMouseLeave={() => setHoveredPhoneAlert(null)}
                              >
                                <AlertCircle className="w-4 h-4 text-red-500 cursor-pointer" onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingPhoneStudentId({ id: practice.studentId, phone: '' })
                                }} />
                              </div>
                            )}
                          </span>
                          <span className="text-[13px] font-medium text-[#6b7280] truncate">
                            {practice.academicLevel?.replace(' Nivel', '') || 'Carrera no disp.'}
                          </span>
                        </div>

                        {/* Document Icons */}
                        <div className="flex items-center gap-2 w-[80px] shrink-0">
                          {(() => {
                            const docs = practice.student.generatedDocs || []
                            const docxState = getDocxState(docs)
                            const pdf = docs.find(d => d.template.type === 'PDF' && (d.status ?? 'VALID') === 'VALID')

                            // El ícono no abre el archivo: lleva a la ficha del
                            // documento en /certificates, donde se ve su estado
                            // en el circuito de firma y se puede visualizar.
                            const handleDocClick = (e: React.MouseEvent, docId: string) => {
                              e.stopPropagation()
                              onDocumentClick?.(docId)
                            }

                            // Animación de "quiebre" cuando este doc acaba de invalidarse por reasignación
                            const justInvalidated = docxState.doc && recentlyInvalidatedDocIds?.has(docxState.doc.id)

                            const docxTitle = docxState.state === 'valid'
                              ? `Solicitud ${docxState.doc?.documentCode || ''} — ver en Certificados`
                              : docxState.state === 'stale'
                                ? `Solicitud invalidada: ${docxState.doc?.invalidReason || 'requiere regenerarse'}`
                                : 'Sin solicitud — requisito para el certificado'

                            return (
                              <>
                                <motion.button
                                  animate={justInvalidated ? { x: [0, -4, 4, -3, 3, -1, 0], rotate: [0, -6, 6, -4, 4, 0] } : {}}
                                  transition={{ duration: 0.5, ease: 'easeOut' }}
                                  onClick={(e) => docxState.doc ? handleDocClick(e, docxState.doc.id) : e.stopPropagation()}
                                  className={cn(
                                    "relative w-[28px] h-[28px] rounded-[8px] flex items-center justify-center transition-all",
                                    (isGenerating && isSelected) ? "bg-blue-50 text-blue-500 cursor-wait" :
                                    docxState.state === 'valid' ? "bg-blue-50 hover:bg-blue-100 text-blue-500 cursor-pointer" :
                                    docxState.state === 'stale' ? "bg-amber-50 hover:bg-amber-100 text-amber-500 cursor-pointer" :
                                    "bg-slate-50 text-slate-300 cursor-default",
                                  )}
                                  title={docxTitle}
                                >
                                  {(isGenerating && isSelected) ? (
                                    <div className="relative w-4 h-4">
                                      <svg className="w-4 h-4 -rotate-90 animate-spin" viewBox="0 0 24 24">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="transparent" strokeDasharray="45" strokeDashoffset="15" />
                                      </svg>
                                    </div>
                                  ) : (
                                    <FileText className="w-4 h-4" />
                                  )}
                                  {docxState.state === 'stale' && !(isGenerating && isSelected) && (
                                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">!</span>
                                  )}
                                </motion.button>
                                <button
                                  onClick={(e) => pdf ? handleDocClick(e, pdf.id) : e.stopPropagation()}
                                  className={cn("w-[28px] h-[28px] rounded-[8px] flex items-center justify-center transition-all", pdf ? "bg-rose-50 hover:bg-rose-100 text-rose-500 cursor-pointer" : "bg-slate-50 text-slate-300 cursor-default")}
                                  title={pdf ? `Certificado ${pdf.documentCode || ''} — ver en Certificados` : 'Sin certificado emitido'}
                                >
                                  <FileText className="w-4 h-4" />
                                </button>
                              </>
                            )
                          })()}
                        </div>

                        {/* Reasignar empresa (visible al pasar el mouse) */}
                        {onReassign && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onReassign(practice)
                            }}
                            className="w-[28px] h-[28px] mr-2 rounded-[8px] flex items-center justify-center shrink-0 bg-slate-50 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-indigo-50 hover:text-indigo-500 transition-all"
                            title="Reasignar a otra empresa"
                          >
                            <ArrowLeftRight className="w-4 h-4" />
                          </button>
                        )}

                        {/* Tutor */}
                        <div className="flex flex-col w-[200px] hidden lg:flex shrink-0 truncate pr-4">
                          <span className="text-[14px] font-medium text-[#374151] truncate">
                            {practice.tutorName || 'Sin tutor'}
                          </span>
                          <span className="text-[13px] font-medium text-[#9ca3af] truncate">
                            Tutor Institucional
                          </span>
                        </div>

                        {/* Hours */}
                        <div className="flex items-center justify-end w-[60px] shrink-0 mr-4">
                          <span className="text-[13px] font-medium text-[#374151]">
                            {practice.totalHours || 0} h
                          </span>
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center justify-center w-[110px] shrink-0">
                          <span className={cn(
                            "flex items-center h-[28px] px-[10px] rounded-full text-[12px] font-medium",
                            practice.status === 'COMPLETED' ? "bg-[#ecfdf3] text-[#027a48]" : 
                            practice.status === 'IN_PROGRESS' ? "bg-[#eff6ff] text-[#1d4ed8]" : 
                            practice.status === 'DELAYED' ? "bg-[#fff1f2] text-[#be123c]" :
                            practice.status === 'CANCELED' ? "bg-gray-100 text-gray-600" :
                            "bg-[#fffaeb] text-[#b54708]"
                          )}>
                            {practice.status === 'COMPLETED' ? 'Finalizado' : practice.status === 'IN_PROGRESS' ? 'En curso' : practice.status === 'DELAYED' ? 'En Atrasado' : practice.status === 'CANCELED' ? 'Cancelado' : 'Pendiente'}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end w-[40px] shrink-0 ml-2">
                          <button 
                            className="p-1.5 text-[#9ca3af] hover:text-[#111827] transition-colors rounded-md hover:bg-[#f3f4f6]"
                            onClick={(e) => handleContextMenu(e, practice)}
                          >
                            <MoreHorizontal className="w-5 h-5" />
                          </button>
                        </div>
                      </motion.div>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
      
      {groups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[16px] shadow-sm">
          <p className="text-[#6b7280] font-medium">No se encontraron registros de prácticas.</p>
        </div>
      )}

      {/* Context Menu Overlay */}
      {contextMenu && (
        <div 
          data-context-menu
          className="fixed z-50 min-w-[180px] bg-white rounded-[12px] border border-[#eef2f7] shadow-lg p-1 overflow-hidden"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[11px] font-medium text-[#9ca3af] px-3 py-1.5 uppercase tracking-wider">Acciones</div>
          <button 
            onClick={() => {
              setEditingPhoneStudentId({ id: contextMenu.studentId, phone: contextMenu.currentPhone })
              setContextMenu(null)
            }}
            className="w-full text-left px-3 py-2 text-[13px] font-medium text-[#374151] hover:bg-[#f8fafc] hover:text-blue-600 rounded-md transition-colors"
          >
            Editar Celular
          </button>
          
          <div className="h-[1px] bg-gray-100 my-1 w-full" />
          
          <div className="text-[11px] font-medium text-[#9ca3af] px-3 py-1.5 uppercase tracking-wider">Cambiar Estado</div>
          <button 
            onClick={() => changeStatus(contextMenu.id, 'PENDING')}
            className="w-full text-left px-3 py-2 text-[13px] font-medium text-[#374151] hover:bg-[#f8fafc] hover:text-[#b54708] rounded-md transition-colors"
          >
            Pendiente
          </button>
          <button 
            onClick={() => changeStatus(contextMenu.id, 'IN_PROGRESS')}
            className="w-full text-left px-3 py-2 text-[13px] font-medium text-[#374151] hover:bg-[#f8fafc] hover:text-[#1d4ed8] rounded-md transition-colors"
          >
            En Curso
          </button>
          <button 
            onClick={() => changeStatus(contextMenu.id, 'DELAYED')}
            className="w-full text-left px-3 py-2 text-[13px] font-medium text-[#374151] hover:bg-[#f8fafc] hover:text-[#be123c] rounded-md transition-colors"
          >
            En Atrasado
          </button>
          <button 
            onClick={() => changeStatus(contextMenu.id, 'COMPLETED')}
            className="w-full text-left px-3 py-2 text-[13px] font-medium text-[#374151] hover:bg-[#f8fafc] hover:text-[#027a48] rounded-md transition-colors"
          >
            Finalizado
          </button>
          
          <div className="h-[1px] bg-gray-100 my-1 w-full" />
          
          <button 
            onClick={() => {
              if(window.confirm('¿Estás seguro de que deseas cancelar/desvincular esta práctica? El historial se mantendrá pero ya no estará activa.')) {
                changeStatus(contextMenu.id, 'CANCELED')
              }
            }}
            className="w-full text-left px-3 py-2 text-[13px] font-semibold text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            Cancelar Práctica
          </button>
        </div>
      )}

      {/* Phone Edit Modal */}
      {editingPhoneStudentId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#111827]/20 backdrop-blur-sm" onClick={() => setEditingPhoneStudentId(null)}>
          <div className="bg-white rounded-[16px] shadow-2xl w-[340px] p-6 border border-slate-100" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-[#111827] mb-2">Editar Celular</h3>
            <p className="text-[13px] text-gray-500 mb-5 leading-relaxed">
              Ingresa el número de celular del estudiante para poder generar las solicitudes grupales de manera correcta.
            </p>
            <input 
              autoFocus
              type="text" 
              className="w-full h-11 px-4 rounded-[10px] border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-[14px] font-medium text-gray-900 transition-all"
              placeholder="Ej: 0991234567"
              value={editingPhoneStudentId.phone}
              onChange={(e) => setEditingPhoneStudentId({ ...editingPhoneStudentId, phone: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && onEditPhone) {
                  onEditPhone(editingPhoneStudentId.id, editingPhoneStudentId.phone)
                  setEditingPhoneStudentId(null)
                } else if (e.key === 'Escape') {
                  setEditingPhoneStudentId(null)
                }
              }}
            />
            <div className="flex items-center justify-end gap-3 mt-6">
              <button 
                onClick={() => setEditingPhoneStudentId(null)} 
                className="px-4 py-2 text-[13px] font-semibold text-gray-600 hover:bg-gray-100 rounded-[10px] transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  if (onEditPhone) onEditPhone(editingPhoneStudentId.id, editingPhoneStudentId.phone)
                  setEditingPhoneStudentId(null)
                }}
                className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-[10px] shadow-sm shadow-blue-600/20 transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

      {/* Phone Alert Tooltip - rendered via Portal to avoid overflow clipping */}
      {hoveredPhoneAlert && typeof document !== 'undefined' && createPortal(
        <div 
          className="flex flex-col items-center w-max pointer-events-auto"
          style={{ 
            position: 'fixed', 
            left: tooltipPos.x, 
            top: tooltipPos.y - 8,
            transform: 'translate(-50%, -100%)',
            zIndex: 99999 
          }}
          onMouseEnter={() => {}} 
          onMouseLeave={() => setHoveredPhoneAlert(null)}
        >
          <div className="bg-[#1e293b] text-white text-[12px] px-3.5 py-2.5 rounded-lg shadow-2xl max-w-[230px] text-center leading-snug">
            <span className="font-semibold">⚠ Falta número de celular</span>
            <br />
            <button 
              className="text-blue-300 hover:text-blue-100 underline mt-1.5 font-semibold cursor-pointer text-[12px]"
              onClick={(e) => {
                e.stopPropagation()
                const practiceWithAlert = groups.flatMap(g => g.items).find(p => p.id === hoveredPhoneAlert)
                if (practiceWithAlert) {
                  setEditingPhoneStudentId({ id: practiceWithAlert.studentId, phone: '' })
                }
                setHoveredPhoneAlert(null)
              }}
            >
              Editarlo aquí →
            </button>
          </div>
          <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-[#1e293b]" />
        </div>,
        document.body
      )}
    </>
  )
}
