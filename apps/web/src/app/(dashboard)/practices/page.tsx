'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import React, { useState, useMemo } from 'react'
import { Search, Download, Printer, FileText, ChevronDown, CheckSquare, MoreVertical } from 'lucide-react'

export default function PracticesPage() {
  const [search, setSearch] = useState('')
  const [filterLevel, setFilterLevel] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<'none' | 'company' | 'tutor' | 'level'>('none')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isGenerating, setIsGenerating] = useState(false)

  // Fetch all records locally to allow instant filtering and grouping (limit 500 for thesis size)
  const { data: response, isLoading, error } = useQuery({
    queryKey: ['practices-all'],
    queryFn: async () => {
      const res = await api.get('/practices', {
        params: { page: 1, limit: 500 }
      })
      return res.data
    }
  })

  const rawPractices = response?.data || []

  // Derived state: Filtering
  const filteredPractices = useMemo(() => {
    return rawPractices.filter((p: any) => {
      // 1. Search term
      const searchStr = search.toLowerCase()
      const matchesSearch = !search || 
        p.student?.dni?.toLowerCase().includes(searchStr) ||
        p.student?.firstName?.toLowerCase().includes(searchStr) ||
        p.student?.lastName?.toLowerCase().includes(searchStr) ||
        p.company?.name?.toLowerCase().includes(searchStr) ||
        p.tutorName?.toLowerCase().includes(searchStr)

      // 2. Chip filters
      const matchesLevel = !filterLevel || p.academicLevel === filterLevel
      const matchesType = !filterType || p.practiceLevel === filterType

      return matchesSearch && matchesLevel && matchesType
    })
  }, [rawPractices, search, filterLevel, filterType])

  // Derived state: Grouping
  const groupedPractices = useMemo(() => {
    if (groupBy === 'none') return { 'Todos': filteredPractices }
    
    const groups: Record<string, any[]> = {}
    filteredPractices.forEach((p: any) => {
      let key = 'Sin Asignar'
      if (groupBy === 'company') key = p.company?.name || key
      if (groupBy === 'tutor') key = p.tutorName || key
      if (groupBy === 'level') key = p.academicLevel || key
      
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    })
    return groups
  }, [filteredPractices, groupBy])

  // Selection handlers
  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const toggleAll = () => {
    if (selectedIds.size === filteredPractices.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredPractices.map((p: any) => p.id)))
    }
  }

  const selectedCount = selectedIds.size
  const hasCompletedSelected = Array.from(selectedIds).some(id => {
    const p = rawPractices.find((p: any) => p.id === id)
    return p?.status === 'COMPLETED'
  })

  // Generador Rápido de Certificados
  const handleGenerateCertificates = async () => {
    setIsGenerating(true)
    try {
      // 1. Conseguir la plantilla predeterminada
      const templatesRes = await api.get('/document-templates')
      const defaultTemplate = templatesRes.data.find((t: any) => t.content?.isDefault === true || t.name === 'Certificado de Prácticas Oficial')
      
      if (!defaultTemplate) {
        alert('No se encontró una plantilla predeterminada. Por favor márcala con el corazón en la pestaña Documentos.')
        setIsGenerating(false)
        return
      }

      // 2. Filtrar solo los seleccionados que estén Completados
      const selectedPractices = rawPractices.filter((p: any) => selectedIds.has(p.id) && p.status === 'COMPLETED')
      
      if (selectedPractices.length === 0) {
        alert('No hay estudiantes con estado "Terminado" seleccionados.')
        setIsGenerating(false)
        return
      }

      // 3. Generar en lote por medio de proceso en segundo plano del backend
      await api.post('/generated-documents/generate-batch', {
        templateId: defaultTemplate.id,
        studentIds: selectedPractices.map((p: any) => p.studentId)
      })
      
      alert(`¡Generación iniciada! Se están procesando ${selectedPractices.length} certificados en segundo plano. Ya puedes seguir usando el sistema.`)
      setSelectedIds(new Set()) // Limpiar selección
    } catch (error) {
      console.error(error)
      alert('Error en la generación. Si son demasiados documentos, el motor de PDF podría estar saturado.')
    } finally {
      setIsGenerating(false)
    }
  }

  // Generador de Oficios (Solicitudes Grupales)
  const handleGenerateSolicitud = async (groupItems: any[]) => {
    if (!groupItems || groupItems.length === 0) return;

    // Validación de contactos de la empresa
    const company = groupItems[0].company;
    if (!company) {
      alert("Error: Los estudiantes no tienen empresa asignada.");
      return;
    }

    if (!company.contactName || !company.recipientName || !company.phone) {
      const confirm = window.confirm("Falta información de contactos de la empresa (Nombre del Contacto, Destinatario o Teléfono). El documento podría generarse con campos vacíos. ¿Deseas continuar de todos modos?");
      if (!confirm) return;
    }

    // Extraer IDs de estudiantes seleccionados de ESTE grupo
    const selectedStudentsInGroup = groupItems.filter(p => selectedIds.has(p.id));
    if (selectedStudentsInGroup.length === 0) {
      alert('Selecciona al menos un estudiante (usando el checkbox) dentro de esta empresa para generar el oficio.')
      return;
    }

    setIsGenerating(true)
    try {
      // 1. Conseguir la plantilla DOCX (tomaremos la última subida o una específica si hubiera bandera isDefault)
      const templatesRes = await api.get('/document-templates')
      const docxTemplates = templatesRes.data.filter((t: any) => t.type === 'DOCX')
      
      if (docxTemplates.length === 0) {
        alert('No se encontró ninguna plantilla DOCX subida. Por favor ve a Documentos y sube el archivo de Word.')
        setIsGenerating(false)
        return
      }
      
      const defaultDocxTemplate = docxTemplates[0];

      // 2. Mandar a generar
      const response = await api.post('/generated-documents/generate-solicitud', {
        templateId: defaultDocxTemplate.id,
        studentIds: selectedStudentsInGroup.map((p: any) => p.studentId)
      })
      
      alert(`¡Generación exitosa! Revisa la carpeta de descargas o el sistema.`)
      
      if (response.data?.fileUrl) {
        const fullUrl = process.env.NEXT_PUBLIC_API_URL 
          ? process.env.NEXT_PUBLIC_API_URL.replace('/api', '') + response.data.fileUrl
          : 'http://localhost:3000' + response.data.fileUrl;
        window.open(fullUrl, '_blank');
      }

      // Opcional: Deseleccionar solo los de este grupo
      // setSelectedIds(new Set()) 
    } catch (error) {
      console.error(error)
      alert('Error en la generación del Oficio.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <div className="flex flex-col gap-6 h-[calc(100vh-80px)] overflow-hidden">
        
        {/* TOP PANEL: Sticky Header & Dashboard Stats */}
        <div className="flex-none bg-white z-20 pb-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Registro de Prácticas</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Gestión avanzada de estudiantes, empresas y certificaciones.
              </p>
            </div>
            
            {/* Acciones Rápidas (Pro Features) */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="hidden md:flex gap-2 text-slate-600 hover:text-slate-900">
                <FileText className="w-4 h-4" /> Exportar PDF
              </Button>
              <Button variant="outline" size="sm" className="hidden md:flex gap-2 text-green-700 border-green-200 bg-green-50 hover:bg-green-100">
                <Download className="w-4 h-4" /> Exportar Excel
              </Button>
              <Button variant="outline" size="sm" className="hidden lg:flex gap-2">
                <Printer className="w-4 h-4" /> Imprimir
              </Button>
              
              {/* Botón de Generar Certificados */}
              {selectedCount > 0 && hasCompletedSelected && (
                <Button 
                  onClick={handleGenerateCertificates}
                  disabled={isGenerating}
                  className="ml-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 gap-2 animate-in fade-in zoom-in duration-200"
                >
                  {isGenerating ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></span>
                      Generando...
                    </span>
                  ) : (
                    <>
                      <CheckSquare className="w-4 h-4" /> 
                      Generar Certificados ({selectedCount})
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Buscador inteligente y Agrupación */}
          <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center bg-slate-50 p-3 rounded-lg border">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Buscar por estudiante, empresa, tutor, cédula..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-white border-slate-200 focus-visible:ring-blue-500 w-full"
              />
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500 font-medium">Agrupar por:</span>
              <div className="flex bg-white rounded-md border shadow-sm p-0.5">
                {[
                  { id: 'none', label: 'Ninguno' },
                  { id: 'company', label: 'Empresa' },
                  { id: 'tutor', label: 'Tutor' },
                  { id: 'level', label: 'Nivel' },
                ].map(g => (
                  <button
                    key={g.id}
                    onClick={() => setGroupBy(g.id as any)}
                    className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors ${
                      groupBy === g.id ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Filtros Rápidos (Chips) */}
          <div className="flex flex-wrap gap-2 mt-4 items-center">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">Filtros:</span>
            
            {/* Chips Nivel */}
            {['Séptimo Nivel', 'Octavo Nivel'].map(lvl => (
              <button key={lvl} onClick={() => setFilterLevel(filterLevel === lvl ? null : lvl)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
                  filterLevel === lvl ? 'bg-indigo-100 border-indigo-300 text-indigo-700 ring-1 ring-indigo-400' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {lvl}
              </button>
            ))}

            <div className="w-px h-4 bg-slate-300 mx-1"></div>

            {/* Chips Tipo Práctica */}
            {['Prácticas Laborales I', 'Prácticas Laborales II'].map(tipo => (
              <button key={tipo} onClick={() => setFilterType(filterType === tipo ? null : tipo)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
                  filterType === tipo ? 'bg-emerald-100 border-emerald-300 text-emerald-700 ring-1 ring-emerald-400' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tipo}
              </button>
            ))}

            <div className="ml-auto text-sm text-slate-500 font-medium">
              {filteredPractices.length} registros encontrados
            </div>
          </div>
        </div>

        {/* CONTENEDOR DE LA TABLA (Scrollable con Sticky Headers) */}
        <div className="flex-1 overflow-auto bg-white border rounded-xl shadow-sm relative">
          {isLoading ? (
            <div className="flex justify-center p-12"><span className="animate-pulse font-medium text-slate-500">Cargando base de datos...</span></div>
          ) : error ? (
            <div className="text-destructive p-8 text-center font-medium">Error cargando datos. Verifica la conexión.</div>
          ) : (
            <Table className="w-full relative">
              <TableHeader className="bg-slate-100/90 backdrop-blur-md sticky top-0 z-10 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[40px] text-center px-2">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={selectedCount === filteredPractices.length && filteredPractices.length > 0}
                      onChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead className="w-[50px] font-bold text-slate-700">N°</TableHead>
                  <TableHead className="font-bold text-slate-700">Estudiante</TableHead>
                  <TableHead className="font-bold text-slate-700">Empresa Receptora</TableHead>
                  <TableHead className="font-bold text-slate-700">Tutor Académico</TableHead>
                  <TableHead className="font-bold text-slate-700">Etiquetas</TableHead>
                  <TableHead className="text-center font-bold text-slate-700">Horas</TableHead>
                  <TableHead className="text-center font-bold text-slate-700">Estado</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              
              <TableBody>
                {Object.entries(groupedPractices).map(([groupName, groupItems], groupIdx) => (
                  <React.Fragment key={groupName}>
                    {/* Header del Grupo (Si está agrupado) */}
                    {groupBy !== 'none' && (
                      <TableRow className="bg-slate-800 hover:bg-slate-800/95 group sticky top-[45px] z-[5] shadow-sm">
                        <TableCell colSpan={9} className="py-2 px-4 border-none">
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2 text-white font-semibold text-sm">
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                              {groupName} 
                              <span className="text-slate-400 font-normal text-xs ml-1 bg-slate-700 px-2 py-0.5 rounded-full">
                                {groupItems.length} registros
                              </span>
                            </div>
                            {groupBy === 'company' && (
                              <button 
                                className="h-7 px-3 rounded text-xs bg-indigo-500 hover:bg-indigo-400 text-white font-medium transition-colors disabled:opacity-50"
                                onClick={(e) => { e.stopPropagation(); handleGenerateSolicitud(groupItems); }}
                                disabled={isGenerating}
                              >
                                {isGenerating ? 'Generando...' : 'Generar Solicitud (Word)'}
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}

                    {/* Filas de Datos */}
                    {groupItems.map((practice: any, idx: number) => {
                      const isSelected = selectedIds.has(practice.id)
                      return (
                        <TableRow 
                          key={practice.id} 
                          className={`
                            group cursor-default transition-colors border-b border-slate-100
                            even:bg-slate-50/50 hover:bg-blue-50/60
                            ${isSelected ? 'bg-blue-50/80 border-blue-200' : ''}
                          `}
                          onClick={() => toggleSelection(practice.id)}
                        >
                          {/* Checkbox */}
                          <TableCell className="text-center px-2" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox" 
                              className="rounded border-slate-300 w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              checked={isSelected}
                              onChange={() => toggleSelection(practice.id)}
                            />
                          </TableCell>
                          
                          <TableCell className="text-xs text-slate-400 font-medium">
                            {groupBy === 'none' ? idx + 1 : `${groupIdx + 1}.${idx + 1}`}
                          </TableCell>
                          
                          {/* Columna Estudiante Combinada */}
                          <TableCell>
                            <div className="font-bold text-sm text-slate-800 group-hover:text-blue-700 transition-colors">
                              {practice.student?.lastName} {practice.student?.firstName}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 border">
                                {practice.student?.dni}
                              </span>
                              <span className="text-[10px] text-slate-500 truncate max-w-[150px]" title={practice.student?.user?.email}>
                                {practice.student?.user?.email}
                              </span>
                            </div>
                          </TableCell>
                          
                          {/* Empresa Combinada */}
                          <TableCell>
                            <div className="font-semibold text-xs text-slate-700 max-w-[180px] truncate" title={practice.company?.name}>
                              {practice.company?.name}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-1 max-w-[180px] truncate" title={practice.company?.contactName}>
                              👤 {practice.company?.contactName || 'Sin tutor empresarial'}
                            </div>
                          </TableCell>
                          
                          {/* Tutor Académico */}
                          <TableCell className="text-xs font-medium text-slate-600">
                            {practice.tutorName || '—'}
                          </TableCell>
                          
                          {/* Etiquetas Visuales (Chips) */}
                          <TableCell>
                            <div className="flex flex-col gap-1.5 items-start">
                              {/* Nivel */}
                              <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-bold uppercase tracking-wider
                                ${practice.academicLevel?.includes('Octavo') ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'}
                              `}>
                                {practice.academicLevel?.replace(' Nivel', '') || 'Nivel N/A'}
                              </span>
                              {/* Tipo Práctica */}
                              <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-bold uppercase tracking-wider
                                ${practice.practiceLevel?.includes('II') ? 'bg-teal-100 text-teal-700' : 'bg-cyan-100 text-cyan-700'}
                              `}>
                                {practice.practiceLevel?.replace('Prácticas Laborales ', 'Prác. ') || 'Tipo N/A'}
                              </span>
                            </div>
                          </TableCell>
                          
                          {/* Horas */}
                          <TableCell className="text-center">
                            <span className="font-black text-sm bg-slate-100 px-2.5 py-1 rounded-md text-slate-700 border">
                              {practice.totalHours}
                            </span>
                          </TableCell>
                          
                          {/* Estado Monday.com style */}
                          <TableCell className="text-center">
                            <div className={`inline-flex items-center justify-center px-2.5 py-1 text-[10px] font-bold rounded-sm uppercase tracking-wide
                              ${practice.status === 'COMPLETED' 
                                ? 'bg-[#00c875] text-white shadow-[0_2px_4px_rgba(0,200,117,0.3)]' 
                                : practice.status === 'IN_PROGRESS'
                                ? 'bg-[#fdab3d] text-white shadow-[0_2px_4px_rgba(253,171,61,0.3)]'
                                : 'bg-[#e2445c] text-white shadow-[0_2px_4px_rgba(226,68,92,0.3)]'
                              }`}
                            >
                              {practice.status === 'COMPLETED' ? 'Terminado' : practice.status === 'IN_PROGRESS' ? 'En Proceso' : 'Pendiente'}
                            </div>
                          </TableCell>

                          {/* Menú de Acciones */}
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </React.Fragment>
                ))}

                {filteredPractices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-16">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <Search className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-lg font-medium text-slate-500">No se encontraron resultados</p>
                        <p className="text-sm">Intenta ajustar los filtros de búsqueda</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </RoleGate>
  )
}
