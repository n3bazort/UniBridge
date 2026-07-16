'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { Filter, ChevronDown, Download, Printer, FileText, CheckSquare, FolderSearch, XCircle, Loader2 } from 'lucide-react'
import { FilterChip } from '@/components/ui/filter-chip'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { EntityList, type Group, type Practice } from '@/components/practices/EntityList'
import { ReassignCompanyModal, rememberRecentCompany, type ReassignImpact } from '@/components/practices/ReassignCompanyModal'
import { FloatingActionBar } from '@/components/practices/FloatingActionBar'
import { ConfirmCertificatesModal } from '@/components/practices/ConfirmCertificatesModal'
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
  
  const [filterPeriod, setFilterPeriodState] = useState<string | null>(null)
  const [filterStatus, setFilterStatusState] = useState<string | null>(null)
  const [filterFaculty, setFilterFacultyState] = useState<string | null>(null)
  const [filterProgram, setFilterProgramState] = useState<string | null>(null)

  useEffect(() => {
    const savedPeriod = localStorage.getItem('practices-filter-period')
    if (savedPeriod) setFilterPeriodState(savedPeriod)
    
    const savedStatus = localStorage.getItem('practices-filter-status')
    if (savedStatus) setFilterStatusState(savedStatus)
      
    const savedFaculty = localStorage.getItem('practices-filter-faculty')
    if (savedFaculty) setFilterFacultyState(savedFaculty)
      
    const savedProgram = localStorage.getItem('practices-filter-program')
    if (savedProgram) setFilterProgramState(savedProgram)
  }, [])

  const setFilterPeriod = (val: string | null) => {
    setFilterPeriodState(val)
    if (val) localStorage.setItem('practices-filter-period', val)
    else localStorage.removeItem('practices-filter-period')
  }
  const setFilterStatus = (val: string | null) => {
    setFilterStatusState(val)
    if (val) localStorage.setItem('practices-filter-status', val)
    else localStorage.removeItem('practices-filter-status')
  }
  const setFilterFaculty = (val: string | null) => {
    setFilterFacultyState(val)
    if (val) localStorage.setItem('practices-filter-faculty', val)
    else localStorage.removeItem('practices-filter-faculty')
  }
  const setFilterProgram = (val: string | null) => {
    setFilterProgramState(val)
    if (val) localStorage.setItem('practices-filter-program', val)
    else localStorage.removeItem('practices-filter-program')
  }
  const [groupBy, setGroupBy] = useState<'none' | 'company' | 'tutor' | 'level'>('company')
  
  const [activeTab, setActiveTab] = useState<'assigned' | 'unassigned'>('assigned')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activePracticeId, setActivePracticeId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  // Reasignación de empresa
  const [reassignPractice, setReassignPractice] = useState<Practice | null>(null)
  const [isReassigning, setIsReassigning] = useState(false)
  const [recentlyInvalidatedDocIds, setRecentlyInvalidatedDocIds] = useState<Set<string>>(new Set())

  // Confirmación de emisión de certificados (con palomita de auto-firma)
  const [showConfirmCerts, setShowConfirmCerts] = useState(false)

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
  const { data: response, isLoading: isLoadingPractices, error } = useQuery({
    queryKey: ['practices-all'],
    queryFn: async () => {
      const res = await api.get('/practices', { params: { page: 1, limit: 500 } })
      return res.data
    }
  })

  const { data: responseUnassigned, isLoading: isLoadingUnassigned } = useQuery({
    queryKey: ['students-unassigned'],
    queryFn: async () => {
      const res = await api.get('/students', { params: { page: 1, limit: 500, unassignedOnly: true } })
      return res.data
    }
  })

  // Mapear los estudiantes a formato "Practice" falso para usar EntityList
  const unassignedPractices = useMemo(() => {
    if (!responseUnassigned?.data) return []
    return responseUnassigned.data.map((student: any) => ({
      id: `unassigned-${student.id}`,
      studentId: student.id,
      student,
      company: { name: 'Sin Empresa Asignada', contactName: '' },
      tutorName: 'Sin Tutor',
      academicLevel: 'N/A',
      practiceLevel: 'N/A',
      status: 'Sin Asignar',
      totalHours: 0,
      createdAt: new Date().toISOString()
    }))
  }, [responseUnassigned])

  const rawPractices: Practice[] = activeTab === 'assigned' ? (response?.data || []) : unassignedPractices
  const isLoading = activeTab === 'assigned' ? isLoadingPractices : isLoadingUnassigned

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

  // ── Elegibilidad para emitir certificados ──
  // La selección es POR EMPRESA (checkbox del grupo). Solo se emite a quien
  // realmente lo necesita: tiene solicitud vigente y AÚN NO tiene certificado.
  // Los demás se omiten solos, sin pasos extra para el usuario.
  const hasValidSolicitud = (p: Practice) =>
    (p.student.generatedDocs || []).some(d => d.template.type === 'DOCX' && (d.status ?? 'VALID') === 'VALID')

  const hasValidCertificate = (p: Practice) =>
    (p.student.generatedDocs || []).some(d => d.template.type === 'PDF' && (d.status ?? 'VALID') === 'VALID')

  const certEligibility = useMemo(() => {
    const selected = rawPractices.filter(p => selectedIds.has(p.id))
    // Ya tiene certificado vigente: no hay nada que emitir
    const alreadyCertified = selected.filter(p => hasValidCertificate(p))
    const eligible = selected.filter(p =>
      hasValidSolicitud(p) && !hasValidCertificate(p) && p.status !== 'CANCELED' && p.status !== 'REJECTED'
    )
    const omitted = selected.length - eligible.length - alreadyCertified.length
    const companies = new Set(selected.map(p => p.company?.name || 'Sin empresa')).size

    // Nada que emitir: o ya están todos certificados, o ninguno tiene solicitud
    let blockedReason: string | null = null
    if (selected.length > 0 && eligible.length === 0) {
      blockedReason = alreadyCertified.length === selected.length
        ? 'Todos ya tienen su certificado emitido.'
        : 'Ninguno puede certificarse aún: falta su solicitud vigente.'
    }

    return { selected, eligible, alreadyCertified, omitted, companies, blockedReason }
  }, [rawPractices, selectedIds])

  /** El ícono de documento lleva a su ficha en Certificados (no abre el archivo). */
  const handleDocumentClick = (docId: string) => {
    router.push(`/certificates?highlight=${docId}`)
  }

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/practices/${id}`, { status: newStatus })
      queryClient.invalidateQueries({ queryKey: ['practices-all'] })
      toast.success("Estado actualizado exitosamente")
    } catch (error: any) {
      console.error(error)
      toast.error(error.response?.data?.message || "Error al actualizar el estado")
    }
  }

  const handleEditPhone = async (studentId: string, phone: string) => {
    try {
      await api.patch(`/students/${studentId}`, { phone })
      queryClient.invalidateQueries({ queryKey: ['practices-all'] })
      toast.success("Celular actualizado exitosamente")
    } catch (error: any) {
      console.error(error)
      toast.error("Error al actualizar el celular del estudiante")
    }
  }

  // ── Reasignación de empresa ──
  // Impacto mostrado en el modal: la solicitud es grupal, así que mover a un
  // estudiante invalida el oficio de TODOS los que comparten el documentCode.
  const reassignImpact = useMemo<ReassignImpact | null>(() => {
    if (!reassignPractice) return null
    const validDocx = (reassignPractice.student.generatedDocs || []).find(
      d => d.template.type === 'DOCX' && (d.status ?? 'VALID') === 'VALID'
    )
    if (!validDocx?.documentCode) return null
    const otherStudents = rawPractices.filter(p =>
      p.studentId !== reassignPractice.studentId &&
      (p.student.generatedDocs || []).some(
        d => d.documentCode === validDocx.documentCode && (d.status ?? 'VALID') === 'VALID'
      )
    ).length
    return { documentCode: validDocx.documentCode, otherStudents }
  }, [reassignPractice, rawPractices])

  const handleConfirmReassign = async (company: { id: string; name: string }) => {
    if (!reassignPractice) return
    const practiceId = reassignPractice.id
    const oldCompanyId = reassignPractice.companyId || (reassignPractice.company as any)?.id
    const studentName = `${reassignPractice.student.firstName} ${reassignPractice.student.lastName}`

    setIsReassigning(true)
    try {
      const res = await api.patch(`/practices/${practiceId}`, { companyId: company.id })
      const reassignment = res.data?.reassignment
      const invalidatedIds: string[] = reassignment?.invalidatedDocumentIds || []

      rememberRecentCompany(company.id)
      setReassignPractice(null)
      setRecentlyInvalidatedDocIds(new Set(invalidatedIds))
      await queryClient.invalidateQueries({ queryKey: ['practices-all'] })

      const undo = async () => {
        try {
          if (oldCompanyId) await api.patch(`/practices/${practiceId}`, { companyId: oldCompanyId })
          if (invalidatedIds.length > 0) await api.post('/practices/restore-documents', { documentIds: invalidatedIds })
          setRecentlyInvalidatedDocIds(new Set())
          queryClient.invalidateQueries({ queryKey: ['practices-all'] })
          toast.success('Reasignación deshecha: todo volvió a su estado anterior')
        } catch {
          toast.error('No se pudo deshacer la reasignación')
        }
      }

      toast.success(
        invalidatedIds.length > 0
          ? `${studentName} movido a ${company.name}. Se invalidó la solicitud ${reassignment.invalidatedCodes?.[0] || ''} del grupo anterior.`
          : `${studentName} movido a ${company.name}.`,
        { duration: 10000, action: { label: 'Deshacer', onClick: undo } }
      )
    } catch (error: any) {
      console.error(error)
      toast.error(error.response?.data?.message || 'Error al reasignar la empresa')
    } finally {
      setIsReassigning(false)
    }
  }

  const handleGenerateCertificates = async (autoSendToSignature = false) => {
    setShowConfirmCerts(false)
    try {
      const templatesRes = await api.get('/document-templates')
      // La predeterminada manda; el nombre oficial queda solo como respaldo legado
      const pdfTemplates = templatesRes.data.filter((t: any) => t.type === 'PDF')
      const defaultTemplate = pdfTemplates.find((t: any) => t.content?.isDefault === true)
        || pdfTemplates.find((t: any) => t.name === 'Certificado de Prácticas Oficial')

      if (!defaultTemplate) {
        toast.error('No se encontró una plantilla predeterminada. Por favor márcala en Documentos.')
        return
      }

      const selectedPractices = certEligibility.eligible
      if (selectedPractices.length === 0) {
        toast.error('No hay estudiantes elegibles seleccionados.')
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

      // Generación masiva REAL en el servidor (cola BullMQ con workers
      // concurrentes y reintentos). La UI solo consulta el progreso.
      const { data: batch } = await api.post('/generated-documents/generate-batch', {
        templateId: defaultTemplate.id,
        studentIds: selectedPractices.map((p: any) => p.studentId)
      })

      setGenerationCurrentName('Procesando en el servidor...')

      // Polling del progreso cada 1.2s hasta que el lote termine
      const finalStats: { completed: number; failed: number } = await new Promise((resolve, reject) => {
        let attempts = 0
        const interval = setInterval(async () => {
          try {
            const { data: p } = await api.get(`/generated-documents/batch/${batch.batchId}/progress`)
            setGenerationTotal(p.total)
            setGenerationCurrent(p.completed + p.failed)
            setGenerationProgress(p.progress)
            if (p.status !== 'PROCESSING') {
              clearInterval(interval)
              resolve({ completed: p.completed, failed: p.failed })
            }
          } catch (e) {
            attempts++
            if (attempts > 5) { clearInterval(interval); reject(e) }
          }
        }, 1200)
      })

      setGenerationResults(
        selectedPractices.slice(0, finalStats.completed + finalStats.failed).map((p: any, i: number) => ({
          studentName: `${p.student.firstName} ${p.student.lastName}`,
          success: i < finalStats.completed
        }))
      )
      setIsGenerationFinished(true)
      if (finalStats.failed > 0) {
        toast.warning(`Generación completada: ${finalStats.completed} certificados listos, ${finalStats.failed} con error (reintentados 3 veces).`)
      } else {
        toast.success(`¡Generación completada! ${finalStats.completed} certificados listos.`)
      }

      // Palomita activa: el lote entra solo al circuito Decano → Director
      if (autoSendToSignature && finalStats.completed > 0) {
        try {
          setGenerationCurrentName('Enviando a firma...')
          const { data: docs } = await api.get('/generated-documents')
          const studentIdSet = new Set(selectedPractices.map((p: any) => p.studentId))
          const freshIds = (docs || [])
            .filter((d: any) =>
              d.documentType === 'CERTIFICADO' &&
              d.status === 'VALID' &&
              studentIdSet.has(d.studentId) &&
              (!d.signatureStatus || d.signatureStatus === 'NONE')
            )
            .map((d: any) => d.id)

          if (freshIds.length > 0) {
            const { data: batch } = await api.post('/signatures/batches', { documentIds: freshIds })
            toast.success(`Lote ${batch.code} enviado al circuito de firma (${freshIds.length} documentos)`, {
              action: { label: 'Ver circuito', onClick: () => router.push('/certificates') },
              duration: 8000,
            })
          }
        } catch (e: any) {
          toast.error(e.response?.data?.message || 'Certificados generados, pero falló el envío automático a firma. Envíalos desde Certificados.')
        }
      }

      setSelectedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ['practices-all'] })
    } catch (err: any) {
      console.error(err)
      toast.error(err.response?.data?.message || 'Error al iniciar la generación de certificados.')
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

    // El teléfono y correo de la empresa NO se imprimen en el oficio: sirven
    // para que los estudiantes la contacten por fuera. Si faltan, no se avisa.
    // El nombre del contacto sí aparece, pero la plantilla ya cae en un
    // genérico ("Responsable"), así que tampoco justifica frenar la emisión.

    // El celular del estudiante SÍ va impreso en la tabla del oficio.
    const missingPhones = groupItems.filter(p => !p.student.phone)
    if (missingPhones.length > 0) {
      toast.error(`Faltan celulares de ${missingPhones.length} estudiante(s): ese dato se imprime en la tabla del oficio. Complétalos con el ícono rojo de su fila.`)
      return
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
      // Se usa la plantilla DOCX marcada como predeterminada; si no hay, la primera
      const defaultDocxTemplate = docxTemplates.find((t: any) => typeof t.content === 'object' && t.content?.isDefault === true)
        || docxTemplates[0]
      const studentIds = groupItems.map((p: any) => p.studentId)

      // Verificar si ya existen
      const checkRes = await api.post('/generated-documents/check-solicitud', { studentIds })
      let overwrite = false
      if (checkRes.data?.exists) {
        const confirmOverwrite = window.confirm("Ya existe una solicitud grupal generada para estos estudiantes. ¿Deseas regenerarla invalidando la versión anterior?")
        if (!confirmOverwrite) {
          setIsGenerating(false)
          return
        }
        overwrite = true
      }

      const response = await api.post('/generated-documents/generate-solicitud', {
        templateId: defaultDocxTemplate.id,
        studentIds,
        overwrite
      })
      
      toast.success(`¡Generación exitosa! Revisa la carpeta de descargas o el sistema.`)
      
      // Invalidar consultas para refrescar la lista de prácticas y actualizar íconos inmediatamente
      queryClient.invalidateQueries({ queryKey: ['practices-all'] })
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] })

      if (response.data?.downloadUrl) {
        // URL prefirmada devuelta por el backend (el bucket es privado)
        const a = document.createElement('a');
        a.href = response.data.downloadUrl;
        a.download = (response.data.fileUrl || 'documento').split('/').pop() || 'documento';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (error: any) {
      console.error(error)
      toast.error(error.response?.data?.message || 'Error en la generación del Oficio.')
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
        
        {/* Tabs: Asignados / Sin Asignar */}
        <div className="flex items-center gap-6 mb-6 border-b border-gray-200 w-full max-w-[1600px] mx-auto">
          <button
            onClick={() => { setActiveTab('assigned'); setSelectedIds(new Set()); }}
            className={`pb-3 text-[15px] font-semibold transition-colors relative ${activeTab === 'assigned' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Estudiantes Asignados
            {activeTab === 'assigned' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />}
          </button>
          <button
            onClick={() => { setActiveTab('unassigned'); setSelectedIds(new Set()); setGroupBy('none'); }}
            className={`pb-3 text-[15px] font-semibold transition-colors relative ${activeTab === 'unassigned' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Estudiantes Sin Asignar
            {activeTab === 'unassigned' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />}
          </button>
        </div>

        {/* Top Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-end gap-4 mb-6 w-full max-w-[1600px] mx-auto">
          <div className="flex items-center gap-2">
            {activeTab === 'unassigned' && selectedIds.size > 0 && (
              <Button 
                onClick={() => toast.info('La interfaz de vinculación a Empresa estará disponible en la próxima actualización.')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Vincular a Empresa ({selectedIds.size})
              </Button>
            )}
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
            {activeTab === 'assigned' && (
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
                    { value: 'CANCELED', label: 'Cancelado' },
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
                  label="Programa" 
                  className="hidden xl:block"
                  value={filterProgram} 
                  onChange={setFilterProgram}
                  options={[
                    { value: null, label: 'Todos' },
                    ...programs.map(p => ({ value: p as string, label: p as string }))
                  ]} 
                />

                <div className="flex-1" />

                <div className="flex items-center gap-2 bg-white rounded-lg p-1 border shadow-soft shrink-0">
                  <span className="text-[12px] font-medium text-gray-500 pl-2 pr-1">Agrupar por:</span>
                  {(['none', 'company', 'tutor', 'level'] as const).map(option => (
                    <button
                      key={option}
                      onClick={() => setGroupBy(option)}
                      className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                        groupBy === option 
                          ? 'bg-blue-50 text-blue-700' 
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {option === 'none' ? 'No' : option === 'company' ? 'Empresa' : option === 'tutor' ? 'Tutor' : 'Nivel'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Barra de acciones flotante: acompaña la selección durante todo
                el scroll, así no hay que volver arriba para actuar. */}
            <FloatingActionBar
              count={certEligibility.companies}
              label={`empresa${certEligibility.companies > 1 ? 's' : ''} · ${certEligibility.eligible.length} certificable${certEligibility.eligible.length !== 1 ? 's' : ''}`}
              blockedReason={certEligibility.blockedReason}
              onClear={() => setSelectedIds(new Set())}
            >
              {!certEligibility.blockedReason && (
                <>
                  {certEligibility.alreadyCertified.length > 0 && (
                    <span
                      className="text-[11.5px] font-medium text-emerald-300 whitespace-nowrap"
                      title="Ya tienen su certificado emitido: no se vuelve a generar"
                    >
                      {certEligibility.alreadyCertified.length} ya certificado{certEligibility.alreadyCertified.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {certEligibility.omitted > 0 && (
                    <span
                      className="text-[11.5px] font-medium text-amber-300 whitespace-nowrap"
                      title="Aún no tienen solicitud vigente: no entran en la emisión"
                    >
                      {certEligibility.omitted} sin solicitud
                    </span>
                  )}
                  <button
                    onClick={() => setShowConfirmCerts(true)}
                    disabled={isGenerating || certEligibility.eligible.length === 0}
                    className="h-[34px] px-4 flex items-center gap-2 rounded-[10px] bg-white hover:bg-slate-100 text-[#111827] text-[12.5px] font-bold transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <FileText className="w-4 h-4 text-rose-500" />
                    Emitir {certEligibility.eligible.length} certificado{certEligibility.eligible.length > 1 ? 's' : ''}
                  </button>
                </>
              )}
            </FloatingActionBar>

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
                onEditPhone={handleEditPhone}
                onReassign={activeTab === 'assigned' ? setReassignPractice : undefined}
                recentlyInvalidatedDocIds={recentlyInvalidatedDocIds}
                onDocumentClick={handleDocumentClick}
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
              onReassign={activeTab === 'assigned' ? setReassignPractice : undefined}
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

        {/* Modal de reasignación de empresa (command palette) */}
        {reassignPractice && (
          <ReassignCompanyModal
            practice={reassignPractice}
            impact={reassignImpact}
            isSubmitting={isReassigning}
            onClose={() => setReassignPractice(null)}
            onConfirm={handleConfirmReassign}
          />
        )}

        {/* Confirmación de certificados + palomita de envío automático a firma */}
        <ConfirmCertificatesModal
          open={showConfirmCerts}
          count={certEligibility.eligible.length}
          onClose={() => setShowConfirmCerts(false)}
          onConfirm={handleGenerateCertificates}
        />
      </div>
    </RoleGate>
  )
}
