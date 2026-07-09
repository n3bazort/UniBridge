'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { Filter, ChevronDown, Download, Printer, FileText, CheckSquare, FolderSearch, XCircle } from 'lucide-react'
import { FilterChip } from '@/components/ui/filter-chip'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { EntityList, type Group, type Practice } from '@/components/practices/EntityList'
import { RightDetailPanel } from '@/components/practices/RightDetailPanel'
import { RoleGate } from '@/components/shared/role-gate'
import { Button } from '@/components/ui/button'
import { useSearchStore } from '@/store/search'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export default function PracticesPage() {
  const router = useRouter()
  const { searchQuery } = useSearchStore()
  const queryClient = useQueryClient()
  
  const [filterPeriod, setFilterPeriod] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [filterFaculty, setFilterFaculty] = useState<string | null>(null)
  const [filterProgram, setFilterProgram] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<'none' | 'company' | 'tutor' | 'level'>('company')
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activePracticeId, setActivePracticeId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  // Estados para la barra de progreso circular de generación de certificados
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [generationTotal, setGenerationTotal] = useState(0)
  const [generationCurrent, setGenerationCurrent] = useState(0)
  const [generationCurrentName, setGenerationCurrentName] = useState('')
  const [generationResults, setGenerationResults] = useState<Array<{ studentName: string, success: boolean, fileUrl?: string, error?: string }>>([])
  const [isGenerationFinished, setIsGenerationFinished] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedIds(new Set())
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 1. Fetch real data
  const { data: response, isLoading, error } = useQuery({
    queryKey: ['practices-all'],
    queryFn: async () => {
      const res = await api.get('/practices', { params: { page: 1, limit: 500 } })
      return res.data
    }
  })

  const rawPractices: Practice[] = response?.data || []

  // Dynamic filter options based on raw data
  const periods = useMemo(() => Array.from(new Set((rawPractices as any[]).map(p => p.academicPeriod || '2024-1'))).sort(), [rawPractices])
  const faculties = useMemo(() => Array.from(new Set((rawPractices as any[]).map(p => p.faculty?.name || 'Ciencias de la Vida y Tecnología'))).sort(), [rawPractices])
  const programs = useMemo(() => Array.from(new Set((rawPractices as any[]).map(p => p.student?.program?.name || 'Tecnologías de la Información'))).sort(), [rawPractices])

  // 2. Filter & Sort data
  const filteredPractices = useMemo(() => {
    let result = rawPractices.filter((p: any) => {
      const searchStr = searchQuery.toLowerCase()
      const matchesSearch = !searchQuery || 
        p.student?.dni?.toLowerCase().includes(searchStr) ||
        p.student?.firstName?.toLowerCase().includes(searchStr) ||
        p.student?.lastName?.toLowerCase().includes(searchStr) ||
        p.company?.name?.toLowerCase().includes(searchStr) ||
        p.tutorName?.toLowerCase().includes(searchStr)

      const matchesPeriod = !filterPeriod || p.academicPeriod === filterPeriod
      const matchesStatus = !filterStatus || p.status === filterStatus
      const pFaculty = p.faculty?.name || 'Ciencias de la Vida y Tecnología'
      const matchesFaculty = !filterFaculty || pFaculty === filterFaculty
      const pProgram = p.student?.program?.name || 'Tecnologías de la Información'
      const matchesProgram = !filterProgram || pProgram === filterProgram

      return matchesSearch && matchesPeriod && matchesStatus && matchesFaculty && matchesProgram
    })

    // Sort A-Z by student name
    return result.sort((a, b) => {
      const nameA = `${a.student.firstName} ${a.student.lastName}`.toLowerCase()
      const nameB = `${b.student.firstName} ${b.student.lastName}`.toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [rawPractices, searchQuery, filterPeriod, filterStatus, filterFaculty, filterProgram])

  // 3. Group data to match UI Group[] structure
  const groups = useMemo<Group[]>(() => {
    if (groupBy === 'none') {
      return [{
        name: 'Todos los registros',
        count: filteredPractices.length,
        hours: filteredPractices.reduce((acc, p) => acc + (p.totalHours || 0), 0),
        items: filteredPractices
      }]
    }
    
    const groupsRecord: Record<string, Practice[]> = {}
    filteredPractices.forEach(p => {
      let key = 'Sin Asignar'
      if (groupBy === 'company') key = p.company?.name || key
      if (groupBy === 'tutor') key = p.tutorName || key
      if (groupBy === 'level') key = p.academicLevel || key
      
      if (!groupsRecord[key]) groupsRecord[key] = []
      groupsRecord[key].push(p)
    })
    
    // Sort groups A-Z
    const sortedEntries = Object.entries(groupsRecord).sort((a, b) => a[0].localeCompare(b[0]))
    
    return sortedEntries.map(([name, items]) => ({
      name,
      count: items.length,
      hours: items.reduce((acc, p) => acc + (p.totalHours || 0), 0),
      items
    }))
  }, [filteredPractices, groupBy])

  // Handlers
  const handleToggleSelection = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const handleToggleAll = (groupId: string, items: Practice[]) => {
    const next = new Set(selectedIds)
    const itemsInGroupSelected = items.filter(p => next.has(p.id)).length
    
    if (itemsInGroupSelected === items.length && items.length > 0) {
      items.forEach(p => next.delete(p.id))
    } else {
      items.forEach(p => next.add(p.id))
    }
    setSelectedIds(next)
  }

  const handleSelectPractice = (p: Practice) => {
    setActivePracticeId(p.id)
  }

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/practices/${id}`, { status: newStatus })
      queryClient.invalidateQueries({ queryKey: ['practices-all'] })
      toast.success("Estado actualizado exitosamente")
    } catch (error) {
      console.error(error)
      toast.error("Error al actualizar el estado")
    }
  }
  const handleGenerateCertificates = async () => {
    try {
      const templatesRes = await api.get('/document-templates')
      const defaultTemplate = templatesRes.data.find((t: any) => t.content?.isDefault === true || t.name === 'Certificado de Prácticas Oficial')
      
      if (!defaultTemplate) {
        toast.error('No se encontró una plantilla predeterminada. Por favor márcala en Documentos.')
        return
      }

      const selectedPractices = rawPractices.filter((p: any) => selectedIds.has(p.id) && p.status === 'COMPLETED')
      if (selectedPractices.length === 0) {
        toast.error('No hay estudiantes con estado "Finalizado" seleccionados.')
        return
      }

      // Initialize progress states
      setGenerationTotal(selectedPractices.length)
      setGenerationCurrent(0)
      setGenerationProgress(0)
      setGenerationCurrentName('')
      setGenerationResults([])
      setIsGenerationFinished(false)
      setIsProgressModalOpen(true)
      setIsGenerating(true)

      const results = []
      let index = 0

      for (const practice of selectedPractices) {
        const studentName = `${practice.student.firstName} ${practice.student.lastName}`
        setGenerationCurrent(index + 1)
        setGenerationCurrentName(studentName)
        setGenerationProgress(Math.round(((index) / selectedPractices.length) * 100))

        try {
          const res = await api.post('/generated-documents/generate', {
            templateId: defaultTemplate.id,
            studentId: practice.studentId
          })
          results.push({
            studentName,
            success: true,
            fileUrl: res.data.fileUrl
          })
        } catch (error: any) {
          console.error(error)
          results.push({
            studentName,
            success: false,
            error: error.response?.data?.message || 'Error de comunicación'
          })
        }
        
        index++
        setGenerationProgress(Math.round((index / selectedPractices.length) * 100))
      }

      setGenerationResults(results)
      setIsGenerationFinished(true)
      const successCount = results.filter(r => r.success).length
      toast.success(`¡Generación completada! ${successCount} certificados listos.`)
      setSelectedIds(new Set())
    } catch (err: any) {
      console.error(err)
      toast.error('Error al iniciar la generación de certificados.')
      setIsProgressModalOpen(false)
    } finally {
      setIsGenerating(false)
    }
  }
  const handleGenerateSolicitud = async (groupItems: Practice[]) => {
    if (!groupItems || groupItems.length === 0) return

    const company = groupItems[0].company
    if (!company) {
      toast.error("Error: Los estudiantes no tienen empresa asignada.")
      return
    }

    if (!company.contactName) {
      const confirm = window.confirm("Falta información de contacto de la empresa. ¿Deseas continuar?")
      if (!confirm) return
    }

    setIsGenerating(true)
    try {
      const templatesRes = await api.get('/document-templates')
      const docxTemplates = templatesRes.data.filter((t: any) => t.type === 'DOCX')
      if (docxTemplates.length === 0) {
        toast.error('No se encontró ninguna plantilla DOCX subida.')
        setIsGenerating(false)
        return
      }
      const defaultDocxTemplate = docxTemplates[0]

      const response = await api.post('/generated-documents/generate-solicitud', {
        templateId: defaultDocxTemplate.id,
        studentIds: groupItems.map((p: any) => p.studentId)
      })
      
      toast.success(`¡Generación exitosa! Revisa la carpeta de descargas o el sistema.`)
      
      if (response.data?.fileUrl) {
        const fullUrl = process.env.NEXT_PUBLIC_API_URL 
          ? process.env.NEXT_PUBLIC_API_URL.replace('/api/v1', '') + response.data.fileUrl
          : response.data.fileUrl;
        
        // Create an invisible anchor element to trigger download without opening a new tab
        const a = document.createElement('a');
        a.href = fullUrl;
        a.download = response.data.fileUrl.split('/').pop() || 'documento';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error(error)
      toast.error('Error en la generación del Oficio.')
    } finally {
      setIsGenerating(false)
    }
  }

  const selectedCount = selectedIds.size
  const hasCompletedSelected = Array.from(selectedIds).some(id => rawPractices.find(p => p.id === id)?.status === 'COMPLETED')
  const activePractice = useMemo(() => rawPractices.find(p => p.id === activePracticeId) || null, [rawPractices, activePracticeId])

  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const containerRect = document.getElementById('main-grid-container')?.getBoundingClientRect();
      if (containerRect) {
        let newWidth = containerRect.right - e.clientX - 12; // 12px for gap
        const maxAllowedWidth = containerRect.width * 0.40; // Max 40% (leaves 60% for left)
        const minAllowedWidth = 320; // Min 320px
        
        if (newWidth > maxAllowedWidth) newWidth = maxAllowedWidth;
        if (newWidth < minAllowedWidth) newWidth = minAllowedWidth;
        
        setRightPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <div className="flex flex-col w-full min-h-[calc(100vh-72px)] bg-[#f7f7f8] pt-6 pb-12 px-4 lg:px-8">
        
        {/* Top Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-end gap-4 mb-6 w-full max-w-[1600px] mx-auto">
          <div className="flex items-center gap-2">
            {/* Top actions removed as per user request, functionality moved elsewhere */}
          </div>
        </div>

        {/* Main Grid: Entity List + Right Panel */}
        <div 
          id="main-grid-container"
          className="flex flex-col xl:flex-row gap-[24px] items-stretch w-full max-w-[1600px] mx-auto relative mt-2"
        >
          
          {/* Left Column: Entity List + Filters */}
          <div className="w-full xl:flex-1 flex flex-col gap-6 min-w-0">
            
            {/* Filter Chips Bar */}
            <div className="flex flex-wrap items-center gap-3 w-full">
              <FilterChip 
                label="Periodo" 
                value={filterPeriod} 
                onChange={setFilterPeriod}
                options={[
                  { value: null, label: 'Todos' },
                  ...periods.map(p => ({ value: p as string, label: p as string }))
                ]} 
              />
              
              <FilterChip 
                label="Estado" 
                value={filterStatus} 
                onChange={setFilterStatus}
                options={[
                  { value: null, label: 'Todos' },
                  { value: 'PENDING', label: 'Pendiente' },
                  { value: 'IN_PROGRESS', label: 'En Curso' },
                  { value: 'DELAYED', label: 'En Atrasado' },
                  { value: 'COMPLETED', label: 'Finalizado' },
                ]} 
              />
              
              <FilterChip 
                label="Facultad" 
                className="hidden md:block"
                value={filterFaculty} 
                onChange={setFilterFaculty}
                options={[
                  { value: null, label: 'Todas' },
                  ...faculties.map(f => ({ value: f as string, label: f as string === 'Ciencias de la Vida y Tecnología' ? 'FCVT' : f as string }))
                ]} 
              />
              
              <FilterChip 
                label="Carrera" 
                className="hidden lg:block"
                value={filterProgram} 
                onChange={setFilterProgram}
                options={[
                  { value: null, label: 'Todas' },
                  ...programs.map(p => ({ value: p as string, label: p as string === 'Tecnologías de la Información' ? 'TI' : p as string }))
                ]} 
              />
              
              <div className="w-[1px] h-[24px] bg-[#e5e7eb] mx-1 hidden sm:block" />
              
              <FilterChip 
                label="Agrupar por" 
                className="hidden sm:block"
                value={groupBy} 
                onChange={(val) => setGroupBy((val as any) || 'none')}
                options={[
                  { value: 'none', label: 'Ninguno' },
                  { value: 'company', label: 'Empresa' },
                  { value: 'tutor', label: 'Tutor' },
                  { value: 'level', label: 'Nivel' },
                ]} 
              />

              {/* Filtros Mobile Fallback */}
              <div className="relative group lg:hidden z-[60]">
                <button className="flex items-center gap-2 h-[48px] px-4 bg-white rounded-[12px] border border-[#eef2f7] text-[13px] font-semibold text-[#374151] hover:bg-[#f8fafc] transition-colors shadow-sm">
                  <Filter className="w-4 h-4 text-[#6b7280]" />
                  Más
                </button>
                <div className="absolute left-0 top-full mt-2 w-[220px] bg-white rounded-[16px] border border-[#eef2f7] shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-2">
                   <div onClick={() => setFilterFaculty(filterFaculty ? null : 'Ciencias de la Vida y Tecnología')} className="md:hidden flex flex-col px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer mb-1">
                     <span className="text-[11px] font-medium text-[#9ca3af]">Facultad</span>
                     <span className={`text-[13px] font-semibold ${filterFaculty ? 'text-[#0369a1]' : 'text-[#374151]'}`}>{filterFaculty ? 'FCVT' : 'Todas'}</span>
                   </div>
                   <div onClick={() => setFilterProgram(filterProgram ? null : 'Tecnologías de la Información')} className="flex flex-col px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer">
                     <span className="text-[11px] font-medium text-[#9ca3af]">Carrera</span>
                     <span className={`text-[13px] font-semibold ${filterProgram ? 'text-[#0369a1]' : 'text-[#374151]'}`}>{filterProgram ? 'TI' : 'Todas'}</span>
                   </div>
                </div>
              </div>
            </div>

            {/* Entity List */}
            {isLoading ? (
              <div className="flex flex-col gap-3 mt-2">
                {[1,2,3,4,5].map(i => (
                  <Skeleton key={i} className="h-16 w-full rounded-[16px] bg-white border border-[#eef2f7]" />
                ))}
              </div>
            ) : error ? (
              <div className="mt-4">
                <EmptyState 
                  icon={XCircle} 
                  title="Error cargando datos" 
                  description="Ocurrió un problema al intentar conectarse al servidor." 
                  actionLabel="Reintentar"
                  onAction={() => queryClient.invalidateQueries({ queryKey: ['practices-all'] })}
                />
              </div>
            ) : filteredPractices.length === 0 ? (
              <div className="mt-4">
                <EmptyState 
                  icon={FolderSearch} 
                  title="No hay resultados" 
                  description="No se encontraron prácticas que coincidan con los filtros actuales o la búsqueda." 
                  actionLabel="Limpiar Filtros"
                  onAction={() => {
                    setFilterPeriod(null)
                    setFilterStatus(null)
                    setFilterFaculty(null)
                    setFilterProgram(null)
                  }}
                />
              </div>
            ) : (
              <EntityList 
                groups={groups} 
                selectedIds={selectedIds}
                onToggleSelection={handleToggleSelection}
                onToggleAll={handleToggleAll}
                onGenerateSolicitud={groupBy === 'company' ? handleGenerateSolicitud : undefined}
                isGenerating={isGenerating}
                onSelectPractice={handleSelectPractice}
                activePracticeId={activePracticeId}
                isGrouped={groupBy !== 'none'}
                onUpdateStatus={handleUpdateStatus}
              />
            )}
          </div>

          {/* Right Column: Detail Panel */}
          <div 
            className="hidden xl:block relative shrink-0"
            style={{ width: rightPanelWidth }}
          >
            {/* Resizer Handle */}
            <div 
              className="sticky top-[96px] float-left -ml-[16px] w-[8px] h-[calc(100vh-120px)] cursor-col-resize hover:bg-blue-500/20 active:bg-blue-500/40 rounded-full transition-colors z-[80]"
              onMouseDown={handleMouseDown}
            />
            <RightDetailPanel 
              selectedCount={selectedCount}
              selectedPractice={activePractice}
              onClearSelection={() => setActivePracticeId(null)}
              onGenerateCertificate={() => handleGenerateCertificates()}
            />
          </div>
          
        </div>
        
        {/* Indicador de Progreso Circular Flotante (Bottom-Right, No Intrusivo, Pequeño) */}
        {isProgressModalOpen && (
          <div className="fixed bottom-6 right-6 z-[200] bg-white rounded-xl shadow-xl border border-slate-100 p-3.5 animate-in slide-in-from-bottom-5 duration-300">
            {!isGenerationFinished ? (
              <div className="flex items-center gap-3 w-[260px]">
                {/* Progreso Circular SVG Pequeño */}
                <div className="relative flex items-center justify-center w-10 h-10 shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      className="text-slate-100"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="transparent"
                      r="16"
                      cx="20"
                      cy="20"
                    />
                    <circle
                      className="text-blue-600 transition-all duration-300"
                      strokeWidth="3.5"
                      strokeDasharray={2 * Math.PI * 16}
                      strokeDashoffset={2 * Math.PI * 16 - (generationProgress / 100) * (2 * Math.PI * 16)}
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="transparent"
                      r="16"
                      cx="20"
                      cy="20"
                    />
                  </svg>
                  <div className="absolute flex items-center justify-center">
                    <span className="text-[10px] font-bold text-[#111827] leading-none">{generationProgress}%</span>
                  </div>
                </div>

                <div className="flex flex-col min-w-0 flex-1">
                  <h4 className="text-[12px] font-bold text-[#111827] leading-tight">Generando Certificados</h4>
                  <span className="text-[10px] text-[#475569] mt-0.5 truncate animate-pulse font-medium">
                    {generationCurrentName || 'Preparando...'}
                  </span>
                  <span className="text-[9px] text-[#9ca3af] font-medium mt-0.5">
                    Procesando {generationCurrent} de {generationTotal}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 w-[280px]">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[12px] font-bold text-[#111827] leading-tight">¡Completado!</span>
                    <span className="text-[10px] text-slate-500 leading-tight mt-0.5">{generationTotal} listos</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setIsProgressModalOpen(false)
                      router.push('/certificates')
                    }}
                    className="h-[28px] px-2.5 bg-[#111827] hover:bg-[#1f2937] text-white text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center"
                  >
                    Historial
                  </button>
                  <button
                    onClick={() => setIsProgressModalOpen(false)}
                    className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </RoleGate>
  )
}
