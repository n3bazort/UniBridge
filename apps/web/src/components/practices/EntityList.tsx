'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, MoreHorizontal, Building2, CheckSquare, Printer, AlertCircle, FileText, ArrowLeftRight, Loader2, Check } from 'lucide-react'
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
  /** Conservado por compatibilidad; la selección ahora es solo por grupo (empresa) */
  onToggleSelection?: (id: string) => void
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

/** Estado efectivo del certificado (PDF) de un estudiante. */
function getPdfState(docs: GeneratedDoc[]) {
  const pdf = docs.filter(d => d.template.type === 'PDF')
  const valid = pdf.find(d => (d.status ?? 'VALID') === 'VALID')
  if (valid) return { state: 'valid' as const, doc: valid }
  const stale = pdf.find(d => d.status === 'SUPERSEDED' || d.status === 'INVALIDATED')
  if (stale) return { state: 'stale' as const, doc: stale }
  return { state: 'none' as const, doc: undefined }
}

type SolicitudAction =
  | { kind: 'none' }                        // nada que hacer: no se ofrece botón
  | { kind: 'create' }                      // nadie la tiene aún
  | { kind: 'update'; missing: number }     // el grupo creció: faltan estudiantes en el oficio
  | { kind: 'regenerate' }                  // quedó invalidada (p.ej. reasignación)

/**
 * Qué acción de solicitud tiene sentido ofrecer para una empresa.
 * Solo se ofrece cuando hay algo real que hacer: si todos los estudiantes
 * ya están cubiertos por un oficio vigente, no se muestra nada.
 */
function getSolicitudAction(items: Practice[]): SolicitudAction {
  const states = items.map(p => getDocxState(p.student.generatedDocs || []).state)
  const validCount = states.filter(s => s === 'valid').length
  const staleCount = states.filter(s => s === 'stale').length

  if (validCount === items.length) return { kind: 'none' }        // todos cubiertos
  if (validCount > 0) return { kind: 'update', missing: items.length - validCount }
  if (staleCount > 0) return { kind: 'regenerate' }               // invalidada, ninguna vigente
  return { kind: 'create' }
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

        // Solo se ofrece la acción de solicitud si hay algo real que hacer:
        // si el grupo entero ya tiene un oficio vigente, no se muestra nada.
        const solicitudAction = getSolicitudAction(group.items)
        const needsAttention = solicitudAction.kind === 'regenerate' || solicitudAction.kind === 'update'

        // Campos que TODO el grupo comparte se dicen UNA vez en la cabecera;
        // las filas solo muestran lo que varía entre estudiantes.
        const uniq = (vals: (string | number | null | undefined)[]) => {
          const s = new Set(vals.map(v => String(v ?? '')))
          return s.size === 1 && group.items.length > 1 ? vals[0] : null
        }
        const sharedTutor = isGrouped ? (uniq(group.items.map(p => p.tutorName)) as string | null) : null
        const sharedHours = isGrouped ? (uniq(group.items.map(p => p.totalHours || 0)) as number | null) : null
        const sharedLevel = isGrouped ? (uniq(group.items.map(p => p.academicLevel)) as string | null) : null
        const sharedParts = [
          sharedLevel ? String(sharedLevel).replace(' Nivel', '') : null,
          sharedHours !== null ? `${sharedHours} h` : null,
          sharedTutor || null,
        ].filter(Boolean)

        return (
          <div key={gIdx} className="flex flex-col gap-[12px]">
            {/* Cabecera de empresa: seleccionarla es lo que habilita la acción */}
            <div
              className={cn(
                "flex items-center justify-between px-[20px] py-[14px] bg-white rounded-[16px] border shadow-soft cursor-pointer transition-colors group/header",
                allGroupSelected ? "border-[#111827]/15 bg-[#111827]/[0.02]" : "border-transparent hover:bg-slate-50"
              )}
              onClick={() => toggleGroup(group.name)}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className="flex items-center justify-center w-[24px] h-[36px] shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleAll(group.name, group.items)
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allGroupSelected}
                    readOnly
                    className="w-[18px] h-[18px] rounded border-slate-300 text-[#111827] focus:ring-[#111827]/20 cursor-pointer"
                  />
                </div>

                <div className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors",
                  allGroupSelected ? "bg-[#111827] text-white" : "bg-slate-100 text-slate-500"
                )}>
                  {isGrouped ? <Building2 className="w-4 h-4" /> : (isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                </div>

                <div className="flex flex-col min-w-0 gap-0.5">
                  <div className="flex items-baseline gap-2.5 min-w-0">
                  <h3 className="text-[15px] font-semibold text-[#111827] truncate">{group.name}</h3>
                  <span className="text-[13px] text-[#9ca3af] shrink-0">{group.count}</span>
                  {solicitudAction.kind === 'regenerate' && (
                    <span className="flex items-center gap-1 text-amber-600 text-[12px] font-medium shrink-0">
                      <AlertCircle className="w-3.5 h-3.5" />
                      solicitud desactualizada
                    </span>
                  )}
                  {solicitudAction.kind === 'update' && (
                    <span className="flex items-center gap-1 text-amber-600 text-[12px] font-medium shrink-0">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {solicitudAction.missing} sin incluir en el oficio
                    </span>
                  )}
                  </div>
                  {/* Lo que todo el grupo comparte se dice UNA sola vez aquí */}
                  {sharedParts.length > 0 && (
                    <span
                      className="text-[11.5px] text-[#9ca3af] truncate"
                      title="Datos comunes a todos los estudiantes del grupo"
                    >
                      Todos: {sharedParts.join(' · ')}
                    </span>
                  )}
                </div>
              </div>

              {/* Solo se ofrece la acción si hay algo que hacer. Si el grupo ya
                  tiene su oficio vigente, se informa y no se invita a rehacerlo. */}
              {onGenerateSolicitud && solicitudAction.kind === 'none' ? (
                <span
                  className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-600 shrink-0 pr-1"
                  title="Todos los estudiantes de esta empresa ya están incluidos en un oficio vigente"
                >
                  <Check className="w-3.5 h-3.5" />
                  Solicitud vigente
                </span>
              ) : onGenerateSolicitud ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onGenerateSolicitud(group.items)
                  }}
                  disabled={isGenerating}
                  className={cn(
                    "h-8 flex items-center gap-1.5 rounded-lg text-[12.5px] font-medium transition-all disabled:opacity-50 shrink-0",
                    allGroupSelected
                      // Seleccionada: acción principal, sólida y evidente
                      ? needsAttention
                        ? "px-3.5 bg-amber-500 hover:bg-amber-600 text-white shadow-soft shadow-amber-500/20"
                        : "px-3.5 bg-[#111827] hover:bg-[#1f2937] text-white shadow-soft"
                      // En reposo: apenas un apunte, sin competir por la atención
                      : needsAttention
                        ? "px-2.5 text-amber-600 hover:bg-amber-50"
                        : "px-2.5 text-[#9ca3af] hover:text-[#111827] hover:bg-slate-100 opacity-0 group-hover/header:opacity-100"
                  )}
                  title={
                    solicitudAction.kind === 'update'
                      ? `El oficio actual no incluye a ${solicitudAction.missing} estudiante(s). Se rehará con el grupo completo.`
                      : solicitudAction.kind === 'regenerate'
                        ? 'La solicitud quedó invalidada. Se generará una nueva para el grupo.'
                        : `Genera un único oficio para los ${group.count} estudiantes de ${group.name}`
                  }
                >
                  {isGenerating ? 'Generando…' : (
                    <>
                      <Printer className="w-3.5 h-3.5" />
                      {solicitudAction.kind === 'update'
                        ? `Actualizar oficio · incluir ${solicitudAction.missing}`
                        : solicitudAction.kind === 'regenerate'
                          ? 'Regenerar solicitud'
                          : 'Generar solicitud'}
                    </>
                  )}
                </button>
              ) : null}
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
                          "relative flex items-center h-[60px] px-[16px] bg-white rounded-[14px] border cursor-pointer group transition-colors",
                          isActive ? "border-[#111827]/20 ring-1 ring-[#111827]/5 bg-slate-50/50" : "border-transparent",
                          // La selección es por EMPRESA (checkbox del grupo). La fila solo
                          // señala si este estudiante quedará fuera de la emisión.
                          isSelected && blocksCertificate && "bg-amber-50/40"
                        )}
                        title={isSelected && blocksCertificate ? 'Se omitirá al emitir certificados: aún no tiene solicitud vigente' : undefined}
                      >
                        {/* Indicador de selección del grupo */}
                        <div className="w-[10px] shrink-0 mr-2.5 flex items-center justify-center">
                          {isSelected && (
                            <span className={cn("w-[3px] h-7 rounded-full", blocksCertificate ? "bg-amber-400" : "bg-[#111827]")} />
                          )}
                        </div>

                        {/* Nombre + datos secundarios en una sola línea discreta */}
                        <div className="flex flex-col flex-1 min-w-[180px] truncate pr-4">
                          <span className="text-[13.5px] font-semibold text-[#111827] truncate flex items-center gap-1.5">
                            {practice.student.firstName} {practice.student.lastName}
                            {!practice.student.phone && (
                              <span
                                className="relative flex items-center"
                                onMouseEnter={(e) => {
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                  setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top })
                                  setHoveredPhoneAlert(practice.id)
                                }}
                                onMouseLeave={() => setHoveredPhoneAlert(null)}
                              >
                                <AlertCircle className="w-3.5 h-3.5 text-red-500 cursor-pointer shrink-0" onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingPhoneStudentId({ id: practice.studentId, phone: '' })
                                }} />
                              </span>
                            )}
                          </span>
                          {/* Solo lo que VARÍA entre compañeros; lo común vive en
                              la cabecera. Si nada varía, la cédula da identidad. */}
                          <span className="text-[12px] text-[#9ca3af] truncate">
                            {(() => {
                              const parts: string[] = []
                              if (sharedLevel === null && practice.academicLevel) parts.push(practice.academicLevel.replace(' Nivel', ''))
                              if (sharedHours === null) parts.push(`${practice.totalHours || 0} h`)
                              if (sharedTutor === null && practice.tutorName) parts.push(practice.tutorName)
                              return parts.length > 0 ? parts.join(' · ') : `CI ${practice.student.dni}`
                            })()}
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
                            className="w-[26px] h-[26px] mr-2 rounded-[7px] flex items-center justify-center shrink-0 text-[#d1d5db] opacity-0 group-hover:opacity-100 hover:bg-slate-100 hover:text-[#111827] transition-all"
                            title="Reasignar a otra empresa"
                          >
                            <ArrowLeftRight className="w-4 h-4" />
                          </button>
                        )}

                        {/* Estado: punto de color + texto, sin la píldora que gritaba */}
                        <div className="flex items-center gap-2 w-[100px] shrink-0">
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            practice.status === 'COMPLETED' ? "bg-emerald-500" :
                            practice.status === 'IN_PROGRESS' ? "bg-blue-500" :
                            practice.status === 'DELAYED' ? "bg-rose-500" :
                            practice.status === 'CANCELED' || practice.status === 'REJECTED' ? "bg-slate-300" :
                            "bg-amber-400"
                          )} />
                          <span className={cn(
                            "text-[12px] font-medium truncate",
                            practice.status === 'COMPLETED' ? "text-emerald-700" :
                            practice.status === 'IN_PROGRESS' ? "text-blue-700" :
                            practice.status === 'DELAYED' ? "text-rose-700" :
                            practice.status === 'CANCELED' || practice.status === 'REJECTED' ? "text-slate-400" :
                            "text-amber-700"
                          )}>
                            {practice.status === 'COMPLETED' ? 'Finalizado'
                              : practice.status === 'IN_PROGRESS' ? 'En curso'
                              : practice.status === 'DELAYED' ? 'Atrasado'
                              : practice.status === 'CANCELED' ? 'Cancelado'
                              : practice.status === 'REJECTED' ? 'Rechazado'
                              : 'Pendiente'}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end w-[32px] shrink-0 ml-1">
                          <button
                            className="p-1.5 text-[#d1d5db] hover:text-[#111827] transition-colors rounded-md hover:bg-[#f3f4f6] opacity-0 group-hover:opacity-100"
                            onClick={(e) => handleContextMenu(e, practice)}
                          >
                            <MoreHorizontal className="w-4 h-4" />
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
