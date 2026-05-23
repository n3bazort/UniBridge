'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { Filter, ChevronDown, Download, Printer, FileText, CheckSquare } from 'lucide-react'
import { EntityList, type Group, type Practice } from '@/components/practices/EntityList'
import { RightDetailPanel } from '@/components/practices/RightDetailPanel'
import { RoleGate } from '@/components/shared/role-gate'
import { Button } from '@/components/ui/button'
import { useSearchStore } from '@/store/search'
import { toast } from 'sonner'

export default function PracticesPage() {
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

  // Generation Logic
  const handleGenerateCertificates = async () => {
    setIsGenerating(true)
    try {
      const templatesRes = await api.get('/document-templates')
      const defaultTemplate = templatesRes.data.find((t: any) => t.content?.isDefault === true || t.name === 'Certificado de Prácticas Oficial')
      
      if (!defaultTemplate) {
        toast.error('No se encontró una plantilla predeterminada. Por favor márcala en Documentos.')
        setIsGenerating(false)
        return
      }

      const selectedPractices = rawPractices.filter((p: any) => selectedIds.has(p.id) && p.status === 'COMPLETED')
      if (selectedPractices.length === 0) {
        toast.error('No hay estudiantes con estado "Finalizado" seleccionados.')
        setIsGenerating(false)
        return
      }

      await api.post('/generated-documents/generate-batch', {
        templateId: defaultTemplate.id,
        studentIds: selectedPractices.map((p: any) => p.studentId)
      })
      toast.success(`Se están procesando ${selectedPractices.length} certificados en segundo plano`, {
        action: {
          label: 'Ver certificados',
          onClick: () => router.push('/certificates')
        }
      })
      setSelectedIds(new Set())
    } catch (err: any) {
      console.error(err)
      toast.error('Error en la generación de certificados.')
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
          : 'http://localhost:3001' + response.data.fileUrl;
        
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
            
            {/* Filter Chips Bar (Moved inside left column) */}
            <div className="flex flex-wrap items-center gap-3 w-full">
              
              {/* Chip: Periodo */}
              <div className="relative group z-[60]">
                <div className={`flex flex-col justify-center rounded-[12px] border px-3.5 py-1.5 cursor-pointer shadow-sm transition-colors min-w-[120px] ${filterPeriod ? 'bg-[#f0f9ff] border-[#bae6fd]' : 'bg-white border-[#eef2f7] hover:bg-[#f8fafc]'}`}>
                  <span className={`text-[11px] font-medium ${filterPeriod ? 'text-[#0284c7]' : 'text-[#9ca3af]'}`}>Periodo</span>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className={`text-[13px] font-semibold ${filterPeriod ? 'text-[#0369a1]' : 'text-[#374151]'}`}>{filterPeriod || 'Todos'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 ${filterPeriod ? 'text-[#0284c7]' : 'text-[#9ca3af]'}`} />
                  </div>
                </div>
                {/* Dropdown Menu */}
                <div className="absolute left-0 top-[calc(100%+8px)] w-[160px] bg-white rounded-[12px] border border-[#eef2f7] shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all p-1.5">
                   <div onClick={() => setFilterPeriod(null)} className="px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer text-[13px] font-medium text-[#374151]">Todos</div>
                   {periods.map(p => (
                     <div key={p as string} onClick={() => setFilterPeriod(p as string)} className="px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer text-[13px] font-medium text-[#374151]">{p as string}</div>
                   ))}
                </div>
              </div>

              {/* Chip: Estado */}
              <div className="relative group z-[60]">
                <div className={`flex flex-col justify-center rounded-[12px] border px-3.5 py-1.5 cursor-pointer shadow-sm transition-colors min-w-[120px] ${filterStatus ? 'bg-[#f0f9ff] border-[#bae6fd]' : 'bg-white border-[#eef2f7] hover:bg-[#f8fafc]'}`}>
                  <span className={`text-[11px] font-medium ${filterStatus ? 'text-[#0284c7]' : 'text-[#9ca3af]'}`}>Estado</span>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className={`text-[13px] font-semibold ${filterStatus ? 'text-[#0369a1]' : 'text-[#374151]'}`}>{
                      filterStatus === 'COMPLETED' ? 'Finalizado' : filterStatus === 'PENDING' ? 'Pendiente' : filterStatus === 'DELAYED' ? 'En Atrasado' : filterStatus === 'IN_PROGRESS' ? 'En Curso' : 'Todos'
                    }</span>
                    <ChevronDown className={`w-3.5 h-3.5 ${filterStatus ? 'text-[#0284c7]' : 'text-[#9ca3af]'}`} />
                  </div>
                </div>
                {/* Dropdown Menu */}
                <div className="absolute left-0 top-[calc(100%+8px)] w-[160px] bg-white rounded-[12px] border border-[#eef2f7] shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all p-1.5">
                   <div onClick={() => setFilterStatus(null)} className="px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer text-[13px] font-medium text-[#374151]">Todos</div>
                   <div onClick={() => setFilterStatus('PENDING')} className="px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer text-[13px] font-medium text-[#374151]">Pendiente</div>
                   <div onClick={() => setFilterStatus('IN_PROGRESS')} className="px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer text-[13px] font-medium text-[#374151]">En Curso</div>
                   <div onClick={() => setFilterStatus('DELAYED')} className="px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer text-[13px] font-medium text-[#374151]">En Atrasado</div>
                   <div onClick={() => setFilterStatus('COMPLETED')} className="px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer text-[13px] font-medium text-[#374151]">Finalizado</div>
                </div>
              </div>

              {/* Chip: Facultad */}
              <div className="relative group hidden md:block z-[60]">
                <div className={`flex flex-col justify-center rounded-[12px] border px-3.5 py-1.5 cursor-pointer shadow-sm transition-colors min-w-[140px] max-w-[200px] ${filterFaculty ? 'bg-[#f0f9ff] border-[#bae6fd]' : 'bg-white border-[#eef2f7] hover:bg-[#f8fafc]'}`}>
                  <span className={`text-[11px] font-medium ${filterFaculty ? 'text-[#0284c7]' : 'text-[#9ca3af]'}`}>Facultad</span>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className={`text-[13px] font-semibold truncate ${filterFaculty ? 'text-[#0369a1]' : 'text-[#374151]'}`}>{filterFaculty ? 'FCVT' : 'Todas'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${filterFaculty ? 'text-[#0284c7]' : 'text-[#9ca3af]'}`} />
                  </div>
                </div>
                <div className="absolute left-0 top-[calc(100%+8px)] min-w-[200px] bg-white rounded-[12px] border border-[#eef2f7] shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all p-1.5">
                   <div onClick={() => setFilterFaculty(null)} className="px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer text-[13px] font-medium text-[#374151]">Todas</div>
                   {faculties.map(f => (
                     <div key={f as string} onClick={() => setFilterFaculty(f as string)} className="px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer text-[13px] font-medium text-[#374151]">{f as string}</div>
                   ))}
                </div>
              </div>

              {/* Chip: Carrera */}
              <div className="relative group hidden lg:block z-[60]">
                <div className={`flex flex-col justify-center rounded-[12px] border px-3.5 py-1.5 cursor-pointer shadow-sm transition-colors min-w-[140px] max-w-[200px] ${filterProgram ? 'bg-[#f0f9ff] border-[#bae6fd]' : 'bg-white border-[#eef2f7] hover:bg-[#f8fafc]'}`}>
                  <span className={`text-[11px] font-medium ${filterProgram ? 'text-[#0284c7]' : 'text-[#9ca3af]'}`}>Carrera</span>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className={`text-[13px] font-semibold truncate ${filterProgram ? 'text-[#0369a1]' : 'text-[#374151]'}`}>{filterProgram ? 'TI' : 'Todas'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${filterProgram ? 'text-[#0284c7]' : 'text-[#9ca3af]'}`} />
                  </div>
                </div>
                <div className="absolute left-0 top-[calc(100%+8px)] min-w-[200px] bg-white rounded-[12px] border border-[#eef2f7] shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all p-1.5">
                   <div onClick={() => setFilterProgram(null)} className="px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer text-[13px] font-medium text-[#374151]">Todas</div>
                   {programs.map(p => (
                     <div key={p as string} onClick={() => setFilterProgram(p as string)} className="px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer text-[13px] font-medium text-[#374151]">{p as string}</div>
                   ))}
                </div>
              </div>
              
              <div className="w-[1px] h-[24px] bg-[#e5e7eb] mx-1" />
              
              {/* Agrupar */}
              <div 
                onClick={() => setGroupBy(groupBy === 'company' ? 'none' : 'company')}
                className={`hidden sm:flex flex-col justify-center rounded-[12px] border px-3.5 py-1.5 cursor-pointer shadow-sm transition-colors min-w-[120px]
                ${groupBy === 'company' ? 'bg-[#f0f9ff] border-[#bae6fd]' : 'bg-white border-[#eef2f7] hover:bg-[#f8fafc]'}`}
              >
                <span className={`text-[11px] font-medium ${groupBy === 'company' ? 'text-[#0284c7]' : 'text-[#9ca3af]'}`}>Agrupar por</span>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className={`text-[13px] font-semibold ${groupBy === 'company' ? 'text-[#0369a1]' : 'text-[#374151]'}`}>Empresa</span>
                  <ChevronDown className={`w-3.5 h-3.5 ${groupBy === 'company' ? 'text-[#0284c7]' : 'text-[#9ca3af]'}`} />
                </div>
              </div>

              {/* Filtros Dropdown Button */}
              <div className="relative group">
                <button className="flex items-center gap-2 h-[48px] px-4 bg-white rounded-[12px] border border-[#eef2f7] text-[13px] font-semibold text-[#374151] hover:bg-[#f8fafc] transition-colors shadow-sm">
                  <Filter className="w-4 h-4 text-[#6b7280]" />
                  Filtros
                </button>
                {/* Responsive missing filters */}
                <div className="absolute left-0 top-full mt-2 w-[220px] bg-white rounded-[16px] border border-[#eef2f7] shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-2 lg:hidden">
                   <div onClick={() => setFilterFaculty(filterFaculty ? null : 'Ciencias de la Vida y Tecnología')} className="md:hidden flex flex-col px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer mb-1">
                     <span className="text-[11px] font-medium text-[#9ca3af]">Facultad</span>
                     <span className={`text-[13px] font-semibold ${filterFaculty ? 'text-[#0369a1]' : 'text-[#374151]'}`}>{filterFaculty ? 'FCVT' : 'Todas'}</span>
                   </div>
                   <div onClick={() => setFilterProgram(filterProgram ? null : 'Tecnologías de la Información')} className="lg:hidden flex flex-col px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer">
                     <span className="text-[11px] font-medium text-[#9ca3af]">Carrera</span>
                     <span className={`text-[13px] font-semibold ${filterProgram ? 'text-[#0369a1]' : 'text-[#374151]'}`}>{filterProgram ? 'TI' : 'Todas'}</span>
                   </div>
                </div>
              </div>
            </div>

            {/* Entity List */}
            {isLoading ? (
              <div className="flex justify-center p-12 text-[#6b7280] animate-pulse font-medium">Cargando base de datos...</div>
            ) : error ? (
              <div className="text-[#ef4444] p-8 text-center font-medium">Error cargando datos.</div>
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
      </div>
    </RoleGate>
  )
}
