'use client'

import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, MoreHorizontal, Building2, CheckSquare, Printer } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface Practice {
  id: string
  studentId: string
  student: {
    firstName: string
    lastName: string
    dni: string
    user?: { email: string }
  }
  company?: {
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
  onUpdateStatus
}: EntityListProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ id: string, x: number, y: number } | null>(null)

  useEffect(() => {
    const closeMenu = () => setContextMenu(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [])

  const toggleGroup = (groupName: string) => {
    const next = new Set(collapsedGroups)
    if (next.has(groupName)) next.delete(groupName)
    else next.add(groupName)
    setCollapsedGroups(next)
  }

  const handleContextMenu = (e: React.MouseEvent, practiceId: string) => {
    e.preventDefault()
    setContextMenu({ id: practiceId, x: e.clientX, y: e.clientY })
  }

  const changeStatus = (id: string, status: string) => {
    if (onUpdateStatus) onUpdateStatus(id, status)
    setContextMenu(null)
  }

  return (
    <div className="flex flex-col gap-[24px]">
      {groups.map((group, gIdx) => {
        const isCollapsed = collapsedGroups.has(group.name)
        const groupSelectedCount = group.items.filter(p => selectedIds.has(p.id)).length
        const allGroupSelected = groupSelectedCount === group.items.length && group.items.length > 0

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
                </div>
              </div>
              
              {onGenerateSolicitud && groupSelectedCount > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onGenerateSolicitud(group.items.filter(p => selectedIds.has(p.id)))
                  }}
                  disabled={isGenerating}
                  className="opacity-0 group-hover/header:opacity-100 transition-opacity h-8 px-4 flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium shadow-soft shadow-blue-500/20 disabled:opacity-50"
                >
                  {isGenerating ? 'Generando...' : <><Printer className="w-4 h-4" /> Solicitud Grupal</>}
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

                    return (
                      <motion.div 
                        key={practice.id}
                        onClick={() => onSelectPractice?.(practice)}
                        onContextMenu={(e) => handleContextMenu(e as any, practice.id)}
                        whileHover={{ y: -1, boxShadow: "0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.03)" }}
                        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                        className={cn(
                          "relative flex items-center h-[72px] px-[18px] bg-white rounded-[16px] border cursor-pointer group transition-colors",
                          isActive ? "border-blue-300 ring-1 ring-blue-100 bg-blue-50/20" : "border-transparent"
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
                            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
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
                          <span className="text-[14px] font-semibold text-[#111827] truncate">
                            {practice.student.firstName} {practice.student.lastName}
                          </span>
                          <span className="text-[13px] font-medium text-[#6b7280] truncate">
                            {practice.academicLevel?.replace(' Nivel', '') || 'Carrera no disp.'}
                          </span>
                        </div>

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
                            "bg-[#fffaeb] text-[#b54708]"
                          )}>
                            {practice.status === 'COMPLETED' ? 'Finalizado' : practice.status === 'IN_PROGRESS' ? 'En curso' : practice.status === 'DELAYED' ? 'En Atrasado' : 'Pendiente'}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end w-[40px] shrink-0 ml-2">
                          <button 
                            className="p-1.5 text-[#9ca3af] hover:text-[#111827] transition-colors rounded-md hover:bg-[#f3f4f6]"
                            onClick={(e) => handleContextMenu(e, practice.id)}
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
          className="fixed z-50 min-w-[180px] bg-white rounded-[12px] border border-[#eef2f7] shadow-lg p-1 overflow-hidden"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
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
        </div>
      )}
    </div>
  )
}
