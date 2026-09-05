'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import * as XLSX from 'xlsx'
import { Filter, FilterX, Search, ChevronDown, Download, Printer, FileText, CheckSquare, FolderSearch, XCircle, Loader2, Lock, Plus, Building2, UserCheck, UserSearch, List, MoreHorizontal, MoreVertical } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { EntityList, type Group, type Practice } from '@/components/practices/EntityList'
import { ReassignCompanyModal, rememberRecentCompany, type ReassignImpact, type ReassignPayload } from '@/components/practices/ReassignCompanyModal'
import { ClosePracticeModal, type CloseResult } from '@/components/practices/ClosePracticeModal'
import { FloatingActionBar } from '@/components/practices/FloatingActionBar'
import { ConfirmCertificatesModal } from '@/components/practices/ConfirmCertificatesModal'
import { RightDetailPanel } from '@/components/practices/RightDetailPanel'
import { NewPracticeModal } from '@/components/practices/NewPracticeModal'
import { MissingDataModal } from '@/components/practices/MissingDataModal'
import { GenerationOverlay } from '@/components/shared/GenerationOverlay'
import { RoleGate } from '@/components/shared/role-gate'
import { cn } from '@/lib/utils'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { LabelPicker } from '@/components/practices/labels/LabelPicker'
import { faltaParaCerrar, ESTADOS_DERIVADOS, type PracticeLabel } from '@/components/practices/labels/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useSearchStore } from '@/store/search'
import { usePeriodStore } from '@/store/period'
import { usePeriodoCerrado } from '@/components/layout/periodo-cerrado-aviso'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

/**
 * Un oficio por emitir: la empresa a la que se dirige, los estudiantes que
 * ampara y si ya existe uno vigente al que este vaya a reemplazar.
 */
type GrupoOficio = {
  companyId: string
  companyName: string
  items: Practice[]
  existing: boolean
}

export default function PracticesPage() {
  const router = useRouter()
  const { searchQuery, setSearchQuery } = useSearchStore()
  const queryClient = useQueryClient()
  
  const [filterStatus, setFilterStatusState] = useState<string | null>(null)
  const [filterFaculty, setFilterFacultyState] = useState<string | null>(null)
  const [filterProgram, setFilterProgramState] = useState<string | null>(null)

  useEffect(() => {
    const savedStatus = localStorage.getItem('practices-filter-status')
    if (savedStatus) setFilterStatusState(savedStatus)
      
    const savedFaculty = localStorage.getItem('practices-filter-faculty')
    if (savedFaculty) setFilterFacultyState(savedFaculty)
      
    const savedProgram = localStorage.getItem('practices-filter-program')
    if (savedProgram) setFilterProgramState(savedProgram)
  }, [])

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

  /** Panel de filtros plegado por defecto: ruido visual solo cuando se pide. */
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const buscadorRef = useRef<HTMLInputElement>(null)

  /**
   * Borrador del panel. Los tres filtros se aplican juntos al pulsar
   * «Aplicar»: aplicarlos uno a uno recargaba la tabla tres veces y la lista
   * saltaba bajo las manos mientras se terminaba de elegir.
   */
  const [borrador, setBorrador] = useState<{ status: string | null; faculty: string | null; program: string | null }>({
    status: null, faculty: null, program: null,
  })

  // Al abrir, el borrador parte de lo que ya está aplicado.
  useEffect(() => {
    if (filtrosAbiertos) setBorrador({ status: filterStatus, faculty: filterFaculty, program: filterProgram })
  }, [filtrosAbiertos])

  const filtrosActivos = [filterStatus, filterFaculty, filterProgram].filter(Boolean).length

  const aplicarFiltros = () => {
    setFilterStatus(borrador.status)
    setFilterFaculty(borrador.faculty)
    setFilterProgram(borrador.program)
    setFiltrosAbiertos(false)
  }

  const limpiarFiltros = () => {
    setBorrador({ status: null, faculty: null, program: null })
    setFilterStatus(null)
    setFilterFaculty(null)
    setFilterProgram(null)
  }

  // Ctrl+K enfoca el buscador, como anuncia la propia tecla en la barra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        buscadorRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  
  const [activeTab, setActiveTab] = useState<'assigned' | 'unassigned'>('assigned')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activePracticeId, setActivePracticeId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingCertIds, setGeneratingCertIds] = useState<Set<string>>(new Set())

  // Reasignación de empresa
  const [reassignPractice, setReassignPractice] = useState<Practice | null>(null)
  const [closePractice, setClosePractice] = useState<Practice | null>(null)
  const [isReassigning, setIsReassigning] = useState(false)
  const [recentlyInvalidatedDocIds, setRecentlyInvalidatedDocIds] = useState<Set<string>>(new Set())

  // Modal de Nueva Práctica (Google / Monday style)
  const [isNewPracticeModalOpen, setIsNewPracticeModalOpen] = useState(false)
  const [practiceToEdit, setPracticeToEdit] = useState<any | null>(null)

  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const actionsMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Guardafuegos de emisión: modal de diagnóstico de datos faltantes
  const [missingDataGuard, setMissingDataGuard] = useState<{
    isOpen: boolean
    studentName?: string
    documentType: string
    missingFields: string[]
    practiceToFix?: any
  }>({
    isOpen: false,
    documentType: '',
    missingFields: [],
  })

  // Confirmación de emisión de certificados (con palomita de auto-firma)
  const [showConfirmCerts, setShowConfirmCerts] = useState(false)

  // Emisión masiva: certificados de todo un período, filtrado por carrera
  const [periodCertModal, setPeriodCertModal] = useState(false)
  const [massPeriod, setMassPeriod] = useState<string>('')
  const [massProgram, setMassProgram] = useState<string>('ALL')
  const [massAutoSign, setMassAutoSign] = useState<boolean>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('ppp-auto-send-signature') !== 'false' : true
  )

  // Modal previo a generar el oficio: formato (DOCX/PDF) + aviso de reemplazo
  // `kind` decide cuál de los dos oficios en Word se emite: los dos salen
  // agrupados por empresa y comparten este mismo diálogo.
  //
  // Cada grupo es un oficio: una empresa, sus estudiantes, y si ya tenía uno
  // vigente que este vaya a reemplazar.
  /**
   * Un oficio se dirige a UNA empresa —lleva su destinatario y su cargo
   * impresos—, pero la selección puede abarcar varias. En vez de rechazarla,
   * se parte por empresa y sale un oficio por cada una, con sus estudiantes y
   * su propio número de secuencia. Es lo que hace la Facultad a mano al cierre
   * del período, solo que en una pasada.
   */
  const [solicitudModal, setSolicitudModal] = useState<{
    kind: 'SOLICITUD' | 'DESIGNACION'
    grupos: GrupoOficio[]
  } | null>(null)
  const [solicitudAsPdf, setSolicitudAsPdf] = useState(false)
  const [useBlankSignatures, setUseBlankSignatures] = useState(false)
  const [openInBrowser, setOpenInBrowser] = useState(false)

  // Hydrate preferences from local storage
  useEffect(() => {
    const pref = localStorage.getItem('unibridge_solicitud_pdf')
    if (pref !== null) {
      setSolicitudAsPdf(pref === 'true')
    }
    const openPref = localStorage.getItem('unibridge_open_solicitud_in_browser')
    if (openPref !== null) {
      setOpenInBrowser(openPref === 'true')
    }
  }, [])
  const changeSolicitudFormat = (asPdf: boolean) => {
    setSolicitudAsPdf(asPdf)
    localStorage.setItem('unibridge_solicitud_pdf', String(asPdf))
  }

  // Estados para la barra de progreso circular de generación de certificados
  // Overlay de "generando oficio": el tramo de convertir a PDF tarda ~7 s
  // (abre LibreOffice), asi que mostrar los pasos reales evita que la
  // pantalla se sienta congelada.
  const [oficioOverlay, setOficioOverlay] = useState<{ title: string; asPdf: boolean; subtitle?: string } | null>(null)
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [generationTotal, setGenerationTotal] = useState(0)
  const [generationCurrent, setGenerationCurrent] = useState(0)
  const [generationCurrentName, setGenerationCurrentName] = useState('')
  const [generationResults, setGenerationResults] = useState<Array<{ studentName: string, success: boolean, fileUrl?: string, error?: string }>>([])
  const [isGenerationFinished, setIsGenerationFinished] = useState(false)

  /**
   * Escape limpia la selección — pero solo cuando no hay nada encima. El
   * listener vive en `window`, así que antes cerrar con Escape cualquier
   * modal (por ejemplo el de emisión masiva) descartaba de paso la selección
   * de prácticas que había debajo: diez minutos de trabajo perdidos por
   * cerrar un diálogo. Ahora Escape atiende primero a la capa superior y solo
   * toca la selección si la lista es lo único visible.
   */
  const hayCapaAbierta =
    isNewPracticeModalOpen || showConfirmCerts || periodCertModal || isProgressModalOpen ||
    !!reassignPractice || !!closePractice || !!solicitudModal || !!oficioOverlay ||
    missingDataGuard.isOpen

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (hayCapaAbierta) return           // el modal se cierra solo; la selección no se toca
      if (showActionsMenu) {                // un menú abierto también es una capa
        setShowActionsMenu(false)
        return
      }
      setSelectedIds(new Set())
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hayCapaAbierta, showActionsMenu])

  // 1. Fetch real data — acotado al periodo del selector global (topbar). El
  // queryKey incluye el periodo a propósito: React Query solo vuelve a
  // pedir datos cuando cambia, y cachea cada periodo por separado en vez de
  // traer los 500 registros de todos los años cada vez que se abre la página.
  const { selectedPeriod } = usePeriodStore()

  // Período cerrado = solo consulta. El aviso lo pinta el layout; aquí solo
  // se usa para no ofrecer botones que el servidor va a rechazar.
  const { periodoActivo, soloLectura } = usePeriodoCerrado()

  const { data: response, isLoading: isLoadingPractices, error } = useQuery({
    queryKey: ['practices-all', selectedPeriod],
    queryFn: async () => {
      const res = await api.get('/practices', {
        params: { page: 1, limit: 500, academicPeriod: selectedPeriod || undefined },
      })
      return res.data
    },
    enabled: !!selectedPeriod, // espera a que el switcher resuelva el periodo activo
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

  // ── Etiquetas de seguimiento ──
  // Son anotaciones del coordinador («la empresa no responde») y viven aparte
  // del estado que el sistema deriva de los documentos: no lo modifican.
  const { data: labels = [] } = useQuery<PracticeLabel[]>({
    queryKey: ['practice-labels'],
    queryFn: async () => (await api.get('/practice-labels')).data,
  })

  const refrescarPracticas = () => queryClient.invalidateQueries({ queryKey: ['practices-all'] })

  /**
   * Marca como obsoletas las dos listas de documentos que mantiene la app.
   * Son claves distintas y hay que nombrar las dos: el panel lateral cachea
   * por estudiante bajo ['generated-documents', studentId], mientras que la
   * pantalla de Certificados cachea por periodo bajo
   * ['generated-documents-all', periodo]. Invalidar solo la primera dejaba la
   * segunda con una copia anterior a la emisión, de modo que al llegar con
   * ?highlight=<id> el documento recién generado todavía no figuraba.
   */
  const refrescarDocumentos = () => {
    queryClient.invalidateQueries({ queryKey: ['generated-documents'] })
    queryClient.invalidateQueries({ queryKey: ['generated-documents-all'] })
  }

  /**
   * Todo lo que una baja o una reasignación deja obsoleto: la lista, los
   * documentos y el expediente del estudiante. Se nombran las tres porque son
   * cachés distintas y refrescar solo la primera dejaba las otras mostrando un
   * estado anterior al movimiento.
   */
  const refrescarTodo = async () => {
    refrescarDocumentos()
    await queryClient.invalidateQueries({ queryKey: ['practices-all'] })
    await queryClient.invalidateQueries({ queryKey: ['students-all'] })
  }

  /** Asigna la etiqueta a la práctica indicada, o a toda la selección si la incluye. */
  const handleAssignLabel = async (practice: Practice, labelId: string | null) => {
    const alcance = selectedIds.has(practice.id) ? Array.from(selectedIds) : [practice.id]
    try {
      const { data } = await api.patch('/practice-labels/assign', { practiceIds: alcance, labelId })
      await refrescarPracticas()

      const deshacer = async () => {
        try {
          await api.patch('/practice-labels/restore', { previous: data.previous })
          await refrescarPracticas()
          toast.success('Etiquetas devueltas a como estaban')
        } catch {
          toast.error('No se pudo deshacer el cambio de etiqueta')
        }
      }

      const resumen = labelId
        ? `${data.updated === 1 ? 'Etiqueta aplicada' : `Actualizamos ${data.updated} elementos`}: ${data.label?.name ?? ''}`
        : `${data.updated === 1 ? 'Etiqueta retirada' : `Etiqueta retirada de ${data.updated} elementos`}`

      toast.success(resumen, { action: { label: 'Deshacer', onClick: deshacer }, duration: 8000 })
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'No se pudo asignar la etiqueta')
    }
  }

  const handleCreateLabel = async (name: string, color: string) => {
    try {
      await api.post('/practice-labels', { name, color })
      await queryClient.invalidateQueries({ queryKey: ['practice-labels'] })
      toast.success(`Etiqueta «${name}» creada`)
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'No se pudo crear la etiqueta')
    }
  }

  const handleDeleteLabel = async (labelId: string) => {
    const etiqueta = labels.find(l => l.id === labelId)
    try {
      const { data } = await api.delete(`/practice-labels/${labelId}`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['practice-labels'] }),
        refrescarPracticas(),
      ])
      toast.success(
        data.practicesAffected > 0
          ? `Etiqueta «${etiqueta?.name}» eliminada; ${data.practicesAffected} práctica(s) quedaron sin etiqueta`
          : `Etiqueta «${etiqueta?.name}» eliminada`,
      )
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'No se pudo eliminar la etiqueta')
    }
  }

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

      const matchesStatus = !filterStatus || p.status === filterStatus
      const pFaculty = p.faculty?.name || 'Ciencias de la Vida y Tecnología'
      const matchesFaculty = !filterFaculty || pFaculty === filterFaculty
      const pProgram = p.student?.program?.name || 'Tecnologías de la Información'
      const matchesProgram = !filterProgram || pProgram === filterProgram

      // El periodo ya no se filtra aquí: el switcher del topbar lo resuelve
      // server-side (ver el useQuery de 'practices-all' más arriba).
      return matchesSearch && matchesStatus && matchesFaculty && matchesProgram
    })

    // Sort A-Z by student name
    return result.sort((a, b) => {
      const nameA = `${a.student.firstName} ${a.student.lastName}`.toLowerCase()
      const nameB = `${b.student.firstName} ${b.student.lastName}`.toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [rawPractices, searchQuery, filterStatus, filterFaculty, filterProgram])

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
  /**
   * El certificado necesita el acta del docente Y la designación vigente.
   *
   * La solicitud no se exige: es un trámite previo y colectivo que la empresa
   * puede haberse saltado acordando el cupo de palabra, y bloquear por ella
   * dejaba fuera a estudiantes que sí habían culminado.
   *
   * La designación sí, porque es la que nombra a este estudiante, le asigna su
   * tutor y fija horas y nivel: exactamente lo que el certificado imprime.
   * Estas dos condiciones son espejo de `canIssueCertificate` en el servidor.
   */
  const tieneActa = (p: Practice) => !!p.tutorApprovedAt

  const tieneDesignacion = (p: Practice) =>
    (p.student.generatedDocs || []).some(
      d => d.documentType === 'DESIGNACION' && (d.status ?? 'VALID') === 'VALID'
    )

  const puedeCertificar = (p: Practice) =>
    tieneActa(p) && tieneDesignacion(p) && !hasValidCertificate(p) &&
    p.status !== 'CANCELED' && p.status !== 'REJECTED'

  const hasValidCertificate = (p: Practice) =>
    (p.student.generatedDocs || []).some(d => d.template.type === 'PDF' && (d.status ?? 'VALID') === 'VALID')

  /**
   * Selección para oficios. Un oficio se dirige a UNA empresa —lleva su
   * destinatario y su cargo impresos—, pero eso no obliga a marcar de una en
   * una: si la selección abarca varias, se emite un oficio por cada una. Antes
   * se rechazaba la selección entera, y al cierre del período eso significaba
   * repetir el mismo trámite empresa por empresa.
   */
  const seleccionOficios = useMemo(
    () => rawPractices.filter((p) => selectedIds.has(p.id) && !p.closedAt),
    [rawPractices, selectedIds],
  )
  const empresasDeLaSeleccion = useMemo(
    () => new Set(seleccionOficios.map((p) => p.company?.name || 'Sin empresa')).size,
    [seleccionOficios],
  )
  const bloqueoOficios =
    seleccionOficios.length === 0 ? 'No hay estudiantes seleccionados.' : null

  // Resumen de lo que el diálogo de oficios va a producir.
  const totalAlumnosModal = solicitudModal?.grupos.reduce((n, g) => n + g.items.length, 0) ?? 0
  const gruposQueReemplazan = solicitudModal?.grupos.filter((g) => g.existing).length ?? 0

  const certEligibility = useMemo(() => {
    const selected = rawPractices.filter(p => selectedIds.has(p.id))
    // Ya tiene certificado vigente: no hay nada que emitir
    const alreadyCertified = selected.filter(p => hasValidCertificate(p))
    const eligible = selected.filter(puedeCertificar)
    const omitted = selected.length - eligible.length - alreadyCertified.length
    const companies = new Set(selected.map(p => p.company?.name || 'Sin empresa')).size

    // Nada que emitir. El motivo se nombra con precisión: decir «falta el acta»
    // cuando lo que falta es la designación manda a buscar el documento
    // equivocado, y son dos trámites distintos con dos responsables distintos.
    let blockedReason: string | null = null
    if (selected.length > 0 && eligible.length === 0) {
      const pendientes = selected.filter(p => !hasValidCertificate(p))
      const sinDesignacion = pendientes.filter(p => !tieneDesignacion(p)).length
      const sinActa = pendientes.filter(p => tieneDesignacion(p) && !tieneActa(p)).length

      blockedReason = alreadyCertified.length === selected.length
        ? 'Todos ya tienen su certificado emitido.'
        : sinDesignacion > 0 && sinActa === 0
          ? 'Falta generar la designación de estudiante y tutor.'
          : sinActa > 0 && sinDesignacion === 0
            ? 'Falta cargar el acta del docente.'
            : 'Faltan la designación y el acta del docente.'
    }

    return { selected, eligible, alreadyCertified, omitted, companies, blockedReason }
  }, [rawPractices, selectedIds])

  // Emisión masiva por período + carrera: mismos requisitos que la selección,
  // pero el alcance es todo el período electivo filtrado.
  const massEligibility = useMemo(() => {
    const inScope = rawPractices.filter(p =>
      ((p as any).academicPeriod || '2024-1') === massPeriod &&
      (massProgram === 'ALL' || (p.student as any)?.program?.name === massProgram)
    )
    const eligible = inScope.filter(puedeCertificar)
    const already = inScope.filter(p => hasValidCertificate(p)).length
    const noSolicitud = inScope.length - eligible.length - already
    return { inScope, eligible, already, noSolicitud }
  }, [rawPractices, massPeriod, massProgram])

  const openPeriodCertModal = () => {
    if (!massPeriod && periods.length > 0) setMassPeriod(String(periods[periods.length - 1]))
    setPeriodCertModal(true)
  }

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

  /**
   * Reasignar deja de editar la práctica en su sitio (RF-19): cierra la que
   * había con su motivo y abre otra encadenada. Por eso ya no se ofrece
   * «Deshacer» de un clic — el movimiento queda registrado en el historial del
   * estudiante a propósito, y borrarlo sin dejar rastro contradiría el motivo
   * por el que se pide el motivo.
   */
  const handleConfirmReassign = async (payload: ReassignPayload) => {
    if (!reassignPractice) return
    const practiceId = reassignPractice.id
    const studentName = `${reassignPractice.student.firstName} ${reassignPractice.student.lastName}`

    setIsReassigning(true)
    try {
      const { data } = await api.post(`/practices/${practiceId}/reassign`, {
        reasonId: payload.reasonId,
        companyId: payload.company.id,
        tutorId: payload.tutorId,
        note: payload.note,
      })

      rememberRecentCompany(payload.company.id)
      setReassignPractice(null)
      // Los documentos que acaban de dejar de valer se animan al quebrarse,
      // que es lo que hace visible el efecto del movimiento en la lista.
      setRecentlyInvalidatedDocIds(new Set(data.documentoIdsAnulados ?? []))
      await refrescarTodo()

      toast.success(
        `${studentName} movido a ${payload.company.name} · ${data.motivo}.` +
        (data.documentosAnulados > 0
          ? ` Se anularon ${data.documentosAnulados} documento(s) del grupo anterior.`
          : ''),
        { duration: 10000 },
      )
      toast.info(data.aviso, { duration: 12000 })
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al reasignar la empresa', { duration: 10000 })
    } finally {
      setIsReassigning(false)
    }
  }

  /** Baja de un estudiante (RF-21): registra, y dice si conviene regenerar. */
  const handleClosed = async (r: CloseResult) => {
    const nombre = closePractice
      ? `${closePractice.student.firstName} ${closePractice.student.lastName}`
      : 'El estudiante'
    setClosePractice(null)
    await refrescarTodo()
    toast.success(`${nombre} dado de baja · ${r.motivo}`, { duration: 8000 })
    if (r.regenerarConviene) {
      toast.warning(r.consejo, { duration: 12000 })
    } else if (r.documentosFirmados > 0) {
      toast.info(r.consejo, { duration: 12000 })
    }
  }

  const handleGenerateCertificates = async (autoSendToSignature = false, listOverride?: Practice[]) => {
    setShowConfirmCerts(false)
    setPeriodCertModal(false)
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

      const selectedPractices = listOverride ?? certEligibility.eligible
      if (selectedPractices.length === 0) {
        toast.error('No hay estudiantes elegibles seleccionados.')
        return
      }

      // Initialize progress states
      setGeneratingCertIds(new Set(selectedPractices.map((p: any) => p.id)))
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
      type Fallo = { studentId: string; nombre: string; motivo: string }
      const finalStats: { completed: number; failed: number; errores: Fallo[] } =
        await new Promise((resolve, reject) => {
          let attempts = 0
          const interval = setInterval(async () => {
            try {
              const { data: p } = await api.get(`/generated-documents/batch/${batch.batchId}/progress`)
              setGenerationTotal(p.total)
              setGenerationCurrent(p.completed + p.failed)
              setGenerationProgress(p.progress)
              if (p.status !== 'PROCESSING') {
                clearInterval(interval)
                resolve({ completed: p.completed, failed: p.failed, errores: p.errores || [] })
              }
            } catch (e) {
              attempts++
              if (attempts > 5) { clearInterval(interval); reject(e) }
            }
          }, 1200)
        })

      // El resultado se arma con lo que de verdad falló, no repartiendo los
      // contadores por orden: antes se marcaban como exitosos los primeros N
      // de la lista, así que el nombre que aparecía junto a un error podía no
      // ser el del estudiante que realmente falló.
      const motivoPorEstudiante = new Map(finalStats.errores.map((e) => [e.studentId, e.motivo]))
      setGenerationResults(
        selectedPractices.map((p: any) => {
          const motivo = motivoPorEstudiante.get(p.studentId)
          return {
            studentName: `${p.student.firstName} ${p.student.lastName}`,
            success: !motivo,
            error: motivo,
          }
        })
      )
      setIsGenerationFinished(true)

      if (finalStats.failed > 0) {
        // Los primeros motivos van en su propio aviso: un contador sin razón
        // deja al usuario sin nada que hacer con la información.
        finalStats.errores.slice(0, 3).forEach((e) =>
          toast.error(`${e.nombre}: ${e.motivo}`, { duration: 10000 })
        )
        toast.warning(
          `${finalStats.completed} certificados listos, ${finalStats.failed} sin generar.` +
          (finalStats.errores.length > 3 ? ' El detalle completo está en la ventana de progreso.' : '')
        )
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
              action: { label: 'Ver circuito', onClick: () => router.push(`/certificates?highlight=${freshIds[0]}`) },
              duration: 8000,
            })
          }
        } catch (e: any) {
          toast.error(e.response?.data?.message || 'Certificados generados, pero falló el envío automático a firma. Envíalos desde Certificados.')
        }
      }

      setSelectedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ['practices-all'] })
      refrescarDocumentos()
    } catch (err: any) {
      console.error(err)
      toast.error(err.response?.data?.message || 'Error al iniciar la generación de certificados.')
      setIsProgressModalOpen(false)
    } finally {
      setIsGenerating(false)
      setGeneratingCertIds(new Set())
    }
  }
  const validatePracticeDataForDoc = (practice: Practice, docType: string): string[] => {
    const missing: string[] = []
    // Solo bloquean las decisiones humanas. Estar en «Pendiente» no es un dato
    // que falte: el sistema marca así a toda práctica que todavía no tiene su
    // solicitud, de modo que exigirlo impedía emitir justamente el documento
    // que la sacaba de ese estado.
    if (practice.status === 'CANCELED' || practice.status === 'REJECTED') {
      missing.push(practice.status === 'CANCELED' ? 'La práctica está cancelada' : 'La práctica fue rechazada')
    }
    if (!practice.student) {
      missing.push('Estudiante asignado')
    } else {
      if (!practice.student.dni) missing.push('Cédula del estudiante')
      if (!practice.student.firstName || !practice.student.lastName) missing.push('Nombres y apellidos del estudiante')
    }
    if (!practice.company) {
      missing.push('Empresa receptora asignada')
    } else {
      if (!practice.company.name) missing.push('Nombre Razón Social de la empresa')
      if ((docType === 'SOLICITUD' || docType === 'DESIGNACION') && !practice.company.recipientName) {
        missing.push('Destinatario y cargo de oficios en la empresa')
      }
    }
    if (docType === 'SOLICITUD' || docType === 'DESIGNACION') {
      if (!practice.workArea || !practice.workArea.trim()) {
        missing.push('Área de trabajo en la empresa ("en el área de: ___")')
      }
    }
    if (docType === 'DESIGNACION' || docType === 'CERTIFICADO') {
      if (!practice.tutorName || !practice.tutorName.trim()) {
        missing.push('Tutor Académico asignado')
      }
    }
    if (docType === 'CERTIFICADO') {
      if (!practice.totalHours || practice.totalHours <= 0) missing.push('Horas totales (> 0)')
      if (!practice.practiceLevel) missing.push('Nivel de práctica')
      if (!practice.academicLevel) missing.push('Nivel académico')
    }
    return missing
  }

  /**
   * Paso previo a generar el oficio: valida requisitos y abre el modal donde
   * se elige el formato (DOCX o PDF) y se confirma el reemplazo si ya existe.
   */
  const handleGenerateOficio = async (kind: 'SOLICITUD' | 'DESIGNACION', groupItems: Practice[]) => {
    if (!groupItems || groupItems.length === 0) return

    // Guardafuegos de validación: chequear si algún estudiante del grupo tiene datos faltantes
    for (const item of groupItems) {
      const missing = validatePracticeDataForDoc(item, kind)
      if (missing.length > 0) {
        const studentName = item.student ? `${item.student.firstName} ${item.student.lastName}` : undefined
        setMissingDataGuard({
          isOpen: true,
          studentName,
          documentType: kind === 'SOLICITUD' ? 'Solicitud (PAP-001)' : 'Designación',
          missingFields: missing,
          practiceToFix: item,
        })
        return
      }
    }

    const sinEmpresa = groupItems.filter((p) => !p.company?.id)
    if (sinEmpresa.length > 0) {
      toast.error('Error: Los estudiantes no tienen empresa asignada.')
      return
    }

    // El formato oficial de la designación imprime el tutor de cada estudiante:
    // sin ese dato saldría una fila en blanco en la tabla del oficio.
    if (kind === 'DESIGNACION') {
      const sinTutor = groupItems.filter(p => !p.tutorName?.trim())
      if (sinTutor.length > 0) {
        toast.error(`Faltan tutores académicos de ${sinTutor.length} estudiante(s): ese dato se imprime en la tabla de la designación.`)
        return
      }
    }

    // Se parte la selección por empresa: cada una es un oficio distinto, con
    // su destinatario y su número. El servidor sigue recibiendo un solo grupo
    // por llamada, que es su invariante; lo que cambia es que aquí puede haber
    // varias llamadas en vez de un rechazo.
    const porEmpresa = new Map<string, GrupoOficio>()
    for (const p of groupItems) {
      const company = p.company
      // Ya se rechazó arriba a quien no tenga empresa; esto solo lo hace
      // evidente para el compilador, que no puede seguir esa comprobación.
      if (!company?.id) continue
      const grupo: GrupoOficio = porEmpresa.get(company.id)
        ?? { companyId: company.id, companyName: company.name, items: [], existing: false }
      grupo.items.push(p)
      porEmpresa.set(company.id, grupo)
    }

    // Se pregunta por cada empresa si ya tiene un oficio vigente. Si la
    // consulta falla se asume que no lo hay: el servidor vuelve a comprobarlo
    // al emitir, así que lo único que se pierde es el aviso previo.
    const grupos = await Promise.all(
      [...porEmpresa.values()].map(async (g) => {
        try {
          const res = await api.post('/generated-documents/check-oficio', {
            kind,
            studentIds: g.items.map((p) => p.studentId),
          })
          return { ...g, existing: !!res.data?.exists }
        } catch {
          return g
        }
      }),
    )

    // Las empresas se ordenan por nombre para que la lista del diálogo salga
    // siempre igual, y no en el orden accidental de la selección.
    grupos.sort((a, b) => a.companyName.localeCompare(b.companyName, 'es'))

    setSolicitudModal({ kind, grupos })
  }

  const handleGenerateSolicitud = (groupItems: Practice[]) => handleGenerateOficio('SOLICITUD', groupItems)
  const handleGenerateDesignacion = (groupItems: Practice[]) => handleGenerateOficio('DESIGNACION', groupItems)

  const confirmGenerateSolicitud = async () => {
    const modal = solicitudModal
    if (!modal) return
    setSolicitudModal(null)
    setIsGenerating(true)
    const etiqueta = modal.kind === 'SOLICITUD' ? 'solicitud' : 'designación'
    const totalAlumnos = modal.grupos.reduce((n, g) => n + g.items.length, 0)
    // El overlay es la única señal mientras genera: antes había además un
    // toast "Generando…" diciendo lo mismo en la esquina. El toast ahora
    // queda solo para el resultado.
    setOficioOverlay({
      title: modal.grupos.length === 1 ? `Generando ${etiqueta}` : `Generando ${modal.grupos.length} ${etiqueta}s`,
      asPdf: solicitudAsPdf,
      subtitle: modal.grupos.length === 1
        ? `${modal.grupos[0].companyName} · ${totalAlumnos} estudiante${totalAlumnos === 1 ? '' : 's'}`
        : `${modal.grupos.length} empresas · ${totalAlumnos} estudiantes`,
    })
    try {
      const templatesRes = await api.get('/document-templates')
      // Cada oficio tiene su propia plantilla. Las subidas antes de que
      // existieran los dos formatos no declaran tipo: son de solicitud.
      const activeTemplates = (templatesRes.data || []).filter((t: any) => !t.deletedAt)
      const tipoDe = (t: any) => (typeof t.content === 'object' && t.content?.kind) || 'SOLICITUD'
      const docxTemplates = activeTemplates.filter((t: any) => t.type === 'DOCX' && tipoDe(t) === modal.kind)
      if (docxTemplates.length === 0) {
        toast.error(
          `No hay ninguna plantilla de ${etiqueta} subida. Súbela en Plantillas y márcala como predeterminada.`,
          { duration: 7000 },
        )
        return
      }
      const defaultDocxTemplate = docxTemplates.find((t: any) => typeof t.content === 'object' && t.content?.isDefault === true)
        || docxTemplates[0]
      
      let targetTemplate = defaultDocxTemplate
      if (useBlankSignatures) {
        const blankVariant = docxTemplates.find((t: any) =>
          t.name.toLowerCase().includes('sin firma') ||
          !t.name.toLowerCase().includes('con firma y sello')
        )
        if (blankVariant) {
          targetTemplate = blankVariant
        }
      }

      // Un POST por empresa. Se emiten en serie, no en paralelo, porque cada
      // uno consume un número de la secuencia oficial y el servidor los
      // serializa igual con un bloqueo de fila: lanzarlos a la vez solo haría
      // que se esperaran entre ellos, y complicaría decir cuál falló.
      const emitidos: any[] = []
      const fallidos: { empresa: string; motivo: string }[] = []

      for (const grupo of modal.grupos) {
        setOficioOverlay({
          title: modal.grupos.length === 1 ? `Generando ${etiqueta}` : `Generando ${modal.grupos.length} ${etiqueta}s`,
          asPdf: solicitudAsPdf,
          subtitle: `${grupo.companyName} · ${grupo.items.length} estudiante${grupo.items.length === 1 ? '' : 's'}`,
        })
        try {
          const response = await api.post('/generated-documents/generate-oficio', {
            kind: modal.kind,
            templateId: targetTemplate?.id,
            studentIds: grupo.items.map((p) => p.studentId),
            overwrite: grupo.existing,
            asPdf: solicitudAsPdf,
          })
          const docs = response.data?.documents?.length ? response.data.documents : [response.data]
          emitidos.push(...docs)
        } catch (e: any) {
          // Que una empresa falle no cancela las demás: cada oficio es
          // independiente y el coordinador prefiere tener nueve de diez a no
          // tener ninguno. Al final se dice cuáles quedaron pendientes.
          const m = e.response?.data?.message
          fallidos.push({
            empresa: grupo.companyName,
            motivo: Array.isArray(m) ? m.join(', ') : (typeof m === 'string' ? m : 'error desconocido'),
          })
        }
      }

      queryClient.invalidateQueries({ queryKey: ['practices-all'] })
      refrescarDocumentos()

      if (fallidos.length > 0) {
        toast.error(
          `No se pudo emitir para ${fallidos.map((f) => f.empresa).join(', ')}: ${fallidos[0].motivo}`,
          { duration: 10000 },
        )
      }
      if (emitidos.length === 0) return

      const firstDocId = emitidos[0]?.id || ''
      const actionPayload = { label: 'Ir a Repositorio', onClick: () => router.push(`/certificates?highlight=${firstDocId}`) }

      const nombre = modal.kind === 'SOLICITUD' ? 'Solicitud' : 'Designación'
      const codigosUnicos = new Set(emitidos.map((d) => d?.documentCode).filter(Boolean))
      const resumen = codigosUnicos.size <= 1
        ? `${nombre} ${emitidos[0]?.documentCode || ''}`
        : `${codigosUnicos.size} oficios (uno por empresa)`

      if (solicitudAsPdf) {
        toast.success(`${resumen} generada en PDF`, { action: actionPayload })
        if (openInBrowser) {
          try {
            const docs = await api.get('/generated-documents')
            const codigos = new Set(emitidos.map((d) => d.documentCode))
            const encontrados = (docs.data || []).filter(
              (d: any) => codigos.has(d.documentCode) && d.status === 'VALID',
            )
            // Un único documentCode puede tener una fila por estudiante: se abre
            // cada papel una sola vez.
            const vistos = new Set<string>()
            for (const doc of encontrados) {
              if (vistos.has(doc.documentCode)) continue
              vistos.add(doc.documentCode)
              const v = await api.get(`/generated-documents/${doc.id}/view`)
              window.open(v.data.url, '_blank')
            }
          } catch {}
        }
      } else if (emitidos.some((d) => d?.downloadUrl)) {
        toast.success(`${resumen} generada — descargando DOCX`, { action: actionPayload })
        if (openInBrowser) {
          for (const doc of emitidos) {
            if (!doc?.downloadUrl) continue
            const a = document.createElement('a')
            a.href = doc.downloadUrl
            // El servidor devuelve el nombre con el que la Facultad archiva el
            // oficio; el key interno solo sirve de respaldo
            a.download = doc.fileName || (doc.fileUrl || 'documento').split('/').pop() || 'documento'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
          }
        }
      }
    } catch (error: any) {
      const resData = error.response?.data
      let detail = ''
      if (resData?.message) {
        detail = Array.isArray(resData.message)
          ? resData.message.join(', ')
          : typeof resData.message === 'string'
          ? resData.message
          : JSON.stringify(resData.message)
      } else if (resData?.error) {
        detail = typeof resData.error === 'string' ? resData.error : JSON.stringify(resData.error)
      } else if (error.message) {
        detail = error.message
      }

      const msg = detail ? detail : `Error en la generación de la ${etiqueta}.`
      toast.error(msg, { duration: 8000 })
    } finally {
      setIsGenerating(false)
      setOficioOverlay(null)
    }
  }

  const handleExportPracticesExcel = () => {
    const listToExport = filteredPractices.length ? filteredPractices : rawPractices
    if (!listToExport.length) {
      toast.error('No hay prácticas para exportar')
      return
    }

    const dataToExport = listToExport.map((p) => ({
      'Cédula': p.student?.dni || '',
      'Estudiante': `${p.student?.firstName || ''} ${p.student?.lastName || ''}`.trim(),
      'Carrera / Programa': p.student?.program?.name || '',
      'Empresa': p.company?.name || 'Sin asignación',
      'Estado': ESTADOS_DERIVADOS[p.status]?.texto ?? p.status,
      'Horas Totales': p.totalHours || 0,
      'Tutor Académico': p.tutorName || '',
      'Tutor Empresarial': p.company?.contactName || '',
      'Período Académico': p.academicPeriod || '',
      'Fecha Inicio': p.startDate ? new Date(p.startDate).toLocaleDateString('es-EC') : '',
      'Fecha Fin': p.endDate ? new Date(p.endDate).toLocaleDateString('es-EC') : '',
    }))

    const worksheet = XLSX.utils.json_to_sheet(dataToExport)
    worksheet['!cols'] = [
      { wch: 12 }, { wch: 30 }, { wch: 30 }, { wch: 35 }, { wch: 20 },
      { wch: 14 }, { wch: 25 }, { wch: 25 }, { wch: 16 }, { wch: 14 }, { wch: 14 }
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Prácticas')
    const dateStr = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `UniBridge_Reporte_Practicas_${dateStr}.xlsx`)
    toast.success(`Exportadas ${listToExport.length} prácticas a Excel (.xlsx)`)
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
      <div className="flex flex-col w-full flex-1">
        <PageContainer variant="wide" className="flex flex-col flex-1">

        {/* ── Cabecera: título, acción principal y el resto en un menú ── */}
        <PageHeader
          className="mb-5"
          description="Gestiona y supervisa las prácticas preprofesionales de los estudiantes."
          actions={
            <>
              {!soloLectura && (
                <Button
                  onClick={() => { setPracticeToEdit(null); setIsNewPracticeModalOpen(true); }}
                  className="gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Nueva práctica</span>
                  <span className="sm:hidden">Nueva</span>
                </Button>
              )}

              {/* Lo secundario deja de ocupar sitio en la barra de filtros. */}
              <div className="relative shrink-0" ref={actionsMenuRef}>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Más acciones"
                  aria-expanded={showActionsMenu}
                  aria-haspopup="menu"
                  onClick={() => setShowActionsMenu((prev) => !prev)}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>

                {showActionsMenu && (
                  <div
                    role="menu"
                    className="absolute right-0 z-40 mt-1.5 w-64 rounded-xl border border-border bg-popover p-1.5 shadow-md"
                    onClick={() => setShowActionsMenu(false)}
                  >
                    {/* Emitir escribe; exportar solo lee. En un período
                        cerrado solo queda lo segundo. */}
                    {!soloLectura && (
                      <button
                        role="menuitem"
                        onClick={openPeriodCertModal}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span>Emitir certificados de período…</span>
                      </button>
                    )}
                    <button
                      role="menuitem"
                      onClick={handleExportPracticesExcel}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>Exportar a Excel (.xlsx)</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          }
        />

        {/* ── Pestañas ── */}
        {/* `overflow-x-auto` + `no-scrollbar`: en 375px los dos rótulos no
            caben en una línea, y partirlos rompería la línea de la pestaña
            activa. Se deslizan en horizontal en vez de desbordarse. */}
        <div
          role="tablist"
          aria-label="Vista de estudiantes"
          className="mb-5 flex items-center gap-5 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {([
            { id: 'assigned' as const, icono: UserCheck, texto: 'Estudiantes asignados' },
            { id: 'unassigned' as const, icono: UserSearch, texto: 'Estudiantes sin asignar' },
          ]).map((t) => {
            const activa = activeTab === t.id
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={activa}
                onClick={() => {
                  setActiveTab(t.id)
                  setSelectedIds(new Set())
                  if (t.id === 'unassigned') setGroupBy('none')
                }}
                className={cn(
                  'relative -mb-px flex items-center gap-2 border-b-2 px-0.5 pb-2.5 text-sm font-medium transition-colors',
                  activa
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <t.icono className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{t.texto}</span>
              </button>
            )
          })}
        </div>

        {/* Main Grid: Entity List + Right Panel */}
        <div 
          id="main-grid-container"
          className="flex flex-col xl:flex-row gap-[24px] items-stretch w-full max-w-[1600px] mx-auto relative mt-2"
        >
          
          {/* Left Column: Entity List + Filters */}
          <div className="w-full xl:flex-1 flex flex-col gap-6 min-w-0">
            
            {/* ── Barra de búsqueda, filtros y agrupación ──
                Una sola fila. Antes había tres FilterChip sueltos, un menú de
                acciones y el selector de agrupación compitiendo en la misma
                línea: cinco controles con unas quince opciones desplegadas a la
                vez. Ahora los filtros viven plegados tras un botón que dice
                cuántos hay puestos, y las acciones secundarias se fueron al
                menú de la cabecera.

                Los FilterChip eran <div> con onClick: no se alcanzaban con Tab
                y escondían dos comportamientos en la misma pieza. Aquí son
                <Select> de verdad. */}
            {activeTab === 'assigned' && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={buscadorRef}
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar"
                      aria-label="Buscar estudiante, empresa o carrera"
                      className="w-full pl-9 pr-16"
                    />
                    <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground sm:block">
                      Ctrl + K
                    </kbd>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Button
                      variant="outline"
                      onClick={() => setFiltrosAbiertos((v) => !v)}
                      aria-expanded={filtrosAbiertos}
                      aria-controls="panel-filtros"
                      className="h-10 shrink-0 gap-2"
                    >
                      <Filter className="h-4 w-4" />
                      <span>Filtros</span>
                      {filtrosActivos > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">
                          {filtrosActivos}
                        </span>
                      )}
                      <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', filtrosAbiertos && 'rotate-180')} />
                    </Button>

                    <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                      <label htmlFor="agrupar-por" className="hidden shrink-0 text-sm text-muted-foreground md:block">
                        Agrupar por
                      </label>
                      <Select
                        id="agrupar-por"
                        containerClassName="min-w-0 flex-1 sm:flex-none"
                        className="w-full sm:w-44"
                        value={groupBy}
                        onChange={(e) => setGroupBy(e.target.value as any)}
                        icon={
                          groupBy === 'company' ? <Building2 className="h-4 w-4" />
                            : groupBy === 'tutor' ? <UserCheck className="h-4 w-4" />
                            : <List className="h-4 w-4" />
                        }
                      >
                        <option value="none">Sin agrupar</option>
                        <option value="company">Empresa</option>
                        <option value="tutor">Docente tutor</option>
                        <option value="level">Nivel</option>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Panel plegable. Los cambios no se aplican hasta pulsar
                    «Aplicar»: con tres listas encadenadas, recargar la tabla en
                    cada cambio hace que la lista salte bajo las manos. */}
                {filtrosAbiertos && (
                  <div
                    id="panel-filtros"
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {([
                        {
                          id: 'f-estado', etiqueta: 'Estado', valor: borrador.status,
                          set: (v: string | null) => setBorrador((b) => ({ ...b, status: v })),
                          opciones: [
                            { value: null, label: 'Todos' },
                            { value: 'PENDING', label: 'No iniciado' },
                            { value: 'IN_PROGRESS', label: 'En proceso' },
                            { value: 'COMPLETED', label: 'Finalizado' },
                            { value: 'CANCELED', label: 'Cancelado' },
                          ],
                        },
                        {
                          id: 'f-facultad', etiqueta: 'Facultad', valor: borrador.faculty,
                          set: (v: string | null) => setBorrador((b) => ({ ...b, faculty: v })),
                          opciones: [
                            { value: null, label: 'Todas' },
                            ...faculties.map((f) => ({ value: f as string, label: f as string })),
                          ],
                        },
                        {
                          id: 'f-carrera', etiqueta: 'Carrera', valor: borrador.program,
                          set: (v: string | null) => setBorrador((b) => ({ ...b, program: v })),
                          opciones: [
                            { value: null, label: 'Todas' },
                            ...programs.map((p) => ({ value: p as string, label: p as string })),
                          ],
                        },
                      ]).map((f) => (
                        <div key={f.id} className="flex flex-col gap-1.5">
                          <label htmlFor={f.id} className="text-sm font-medium text-foreground">
                            {f.etiqueta}
                          </label>
                          <div className="relative">
                            <Select
                              id={f.id}
                              value={f.valor ?? ''}
                              onChange={(e) => f.set(e.target.value || null)}
                              className="w-full"
                            >
                              {f.opciones.map((o) => (
                                <option key={o.label} value={o.value ?? ''}>{o.label}</option>
                              ))}
                            </Select>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end">
                      <Button
                        variant="ghost"
                        onClick={limpiarFiltros}
                        disabled={filtrosActivos === 0 && !borrador.status && !borrador.faculty && !borrador.program}
                        className="gap-2"
                      >
                        <FilterX className="h-4 w-4" />
                        Limpiar filtros
                      </Button>
                      <Button onClick={aplicarFiltros} className="gap-2">
                        Aplicar filtros
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Barra de acciones flotante: acompaña la selección durante todo
                el scroll, así no hay que volver arriba para actuar. */}
            {/* Una sola barra para los TRES documentos.
                Antes solo sabía emitir certificados: la solicitud y la
                designación se generaban desde la cabecera de la empresa y
                SIEMPRE para el grupo entero. Si de doce estudiantes solo cinco
                tenían que entrar en el oficio, no había forma de decirlo.
                Ahora los tres se emiten igual: marcas lo que quieras y actúas
                sobre la selección. */}
            <FloatingActionBar
              count={seleccionOficios.length}
              label={`estudiante${seleccionOficios.length === 1 ? '' : 's'} · ${empresasDeLaSeleccion} empresa${empresasDeLaSeleccion === 1 ? '' : 's'}`}
              blockedReason={bloqueoOficios}
              onClear={() => setSelectedIds(new Set())}
            >
              {!bloqueoOficios && (
                <>
                  <button
                    onClick={() => handleGenerateSolicitud(seleccionOficios)}
                    disabled={isGenerating}
                    className="h-[34px] px-4 flex items-center gap-2 rounded-[10px] bg-white hover:bg-slate-100 text-[#111827] text-[12.5px] font-bold transition-colors disabled:opacity-50 whitespace-nowrap"
                    title={empresasDeLaSeleccion > 1
                      ? `${empresasDeLaSeleccion} solicitudes, una por empresa, para los ${seleccionOficios.length} estudiantes marcados`
                      : `Un único oficio de solicitud para los ${seleccionOficios.length} estudiantes marcados`}
                  >
                    <Printer className="w-4 h-4 text-blue-600" />
                    Solicitud
                  </button>
                  <button
                    onClick={() => handleGenerateDesignacion(seleccionOficios)}
                    disabled={isGenerating}
                    className="h-[34px] px-4 flex items-center gap-2 rounded-[10px] bg-white hover:bg-slate-100 text-[#111827] text-[12.5px] font-bold transition-colors disabled:opacity-50 whitespace-nowrap"
                    title={empresasDeLaSeleccion > 1
                      ? `${empresasDeLaSeleccion} designaciones, una por empresa, para los ${seleccionOficios.length} estudiantes marcados`
                      : `Un único oficio de designación para los ${seleccionOficios.length} estudiantes marcados`}
                  >
                    <UserCheck className="w-4 h-4 text-violet-600" />
                    Designación
                  </button>
                  <span className="h-5 w-px bg-white/20" />
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
                      title="Les falta la designación o el acta del docente: no entran en la emisión"
                    >
                      {certEligibility.omitted} sin requisitos
                    </span>
                  )}
                  {/* Un botón que solo puede rechazar no es un botón: si nadie
                      de la selección es elegible, en su lugar va el motivo.
                      Antes se ofrecía apagado y sin explicación, y el usuario
                      lo pulsaba esperando que pasara algo. */}
                  {certEligibility.eligible.length > 0 ? (
                    <button
                      onClick={() => setShowConfirmCerts(true)}
                      disabled={isGenerating}
                      className="h-[34px] px-4 flex items-center gap-2 rounded-[10px] bg-white hover:bg-slate-100 text-[#111827] text-[12.5px] font-bold transition-colors disabled:opacity-50 whitespace-nowrap"
                      title={
                        certEligibility.omitted > 0
                          ? `Se emite a ${certEligibility.eligible.length} de ${certEligibility.selected.length}: al resto le falta la designación o el acta del docente.`
                          : undefined
                      }
                    >
                      <FileText className="w-4 h-4 text-rose-500" />
                      Emitir {certEligibility.eligible.length} certificado{certEligibility.eligible.length > 1 ? 's' : ''}
                    </button>
                  ) : (
                    <span className="text-[11.5px] font-medium text-white/60 whitespace-nowrap">
                      {certEligibility.blockedReason}
                    </span>
                  )}
                </>
              )}
            </FloatingActionBar>


            {/*
              Pendientes por completar.

              Antes este bloque listaba las prácticas en estado PENDING y las
              llamaba «borradores incompletos», pero PENDING no significa eso:
              lo pone el sistema a toda práctica que aún no tiene su solicitud
              emitida, que es el punto de partida normal de cualquiera. El aviso
              señalaba como defectuosos registros que estaban completos.

              Ahora mira los datos de verdad —los mismos que exige el oficio— y
              vive en la pestaña de sin asignar, junto al resto de lo que está a
              la espera de una acción.
            */}
            {activeTab === 'unassigned' && !isLoading && (() => {
              const incompletas = (response?.data || [])
                .map((p: any) => ({ p, falta: validatePracticeDataForDoc(p, 'SOLICITUD') }))
                .filter((x: any) => x.falta.length > 0)
              if (!incompletas.length) return null
              return (
                <div className="mt-2 bg-amber-50 border border-amber-200/70 rounded-2xl p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <span className="text-[12px] font-bold text-amber-800 uppercase tracking-wider">
                      Pendientes por completar ({incompletas.length})
                    </span>
                    <span className="text-[11.5px] text-amber-600 ml-1">· Les falta algún dato que el oficio imprime</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {incompletas.map(({ p, falta }: any) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 border border-amber-100 shadow-xs"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-semibold text-slate-800 truncate">
                            {p.student
                              ? `${p.student.firstName} ${p.student.lastName}`
                              : <span className="text-slate-400 italic">Sin estudiante</span>}
                          </span>
                          {/* Se dice qué falta exactamente, no solo que falta algo */}
                          <span className="text-[11.5px] text-amber-700 truncate" title={falta.join(' · ')}>
                            Falta: {falta.join(' · ')}
                          </span>
                        </div>
                        <button
                          onClick={() => { setPracticeToEdit(p); setIsNewPracticeModalOpen(true) }}
                          className="ml-4 shrink-0 text-[11.5px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-300/60 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Completar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

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
            ) : !selectedPeriod ? (
              // Sin periodo resuelto la consulta ni siquiera corre (ver
              // `enabled` arriba). Antes esto caía en "No hay resultados", que
              // hacía pensar que los filtros estaban mal cuando en realidad
              // no se pudo leer el catálogo de periodos.
              <div className="mt-4">
                <EmptyState
                  icon={XCircle}
                  title="No se pudo determinar el periodo académico"
                  description="Las prácticas se consultan por periodo. Elige uno en el selector de arriba, o reintenta si la lista de periodos no cargó."
                  actionLabel="Reintentar"
                  onAction={() => queryClient.invalidateQueries({ queryKey: ['academic-periods'] })}
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
                soloLectura={soloLectura}
                onGenerateSolicitud={!soloLectura && groupBy === 'company' ? handleGenerateSolicitud : undefined}
                onGenerateDesignacion={!soloLectura && groupBy === 'company' ? handleGenerateDesignacion : undefined}
                isGenerating={isGenerating}
                onSelectPractice={handleSelectPractice}
                activePracticeId={activePracticeId}
                isGrouped={groupBy !== 'none'}
                onUpdateStatus={soloLectura ? undefined : handleUpdateStatus}
                onReassign={!soloLectura && activeTab === 'assigned' ? setReassignPractice : undefined}
                onClosePractice={!soloLectura && activeTab === 'assigned' ? setClosePractice : undefined}
                recentlyInvalidatedDocIds={recentlyInvalidatedDocIds}
                generatingCertIds={generatingCertIds}
                onDocumentClick={handleDocumentClick}
                renderLabel={(practice) => (
                  <LabelPicker
                    labels={labels}
                    current={practice.label}
                    status={practice.status}
                    missingForCompletion={faltaParaCerrar(practice.student.generatedDocs)}
                    selectionCount={selectedIds.has(practice.id) ? selectedIds.size : 1}
                    onAssign={(labelId) => handleAssignLabel(practice, labelId)}
                    onCreate={handleCreateLabel}
                    onDelete={handleDeleteLabel}
                  />
                )}
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
              className="sticky top-[80px] float-left -ml-[16px] w-[8px] h-[calc(100vh-100px)] cursor-col-resize hover:bg-blue-500/20 active:bg-blue-500/40 rounded-full transition-colors z-20"
              onMouseDown={handleMouseDown}
            />
            <RightDetailPanel
              selectedCount={selectedCount}
              selectedPractice={activePractice}
              onClearSelection={() => setActivePracticeId(null)}
              onGenerateCertificate={() => handleGenerateCertificates()}
              onReassign={!soloLectura && activeTab === 'assigned' ? setReassignPractice : undefined}
              onClosePractice={!soloLectura && activeTab === 'assigned' ? setClosePractice : undefined}
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
                  <span className="text-[9px] text-muted-foreground font-medium mt-0.5">
                    Procesando {generationCurrent} de {generationTotal}
                  </span>
                </div>
              </div>
            ) : (
              (() => {
              // La tarjeta refleja lo que de verdad pasó. Antes anunciaba
              // «¡Completado!» con visto verde aunque no se hubiera generado
              // ni un documento, y el usuario se quedaba sin saberlo.
              const fallos = generationResults.filter((r) => !r.success)
              const logrados = generationResults.length - fallos.length
              const hayFallos = fallos.length > 0
              return (
              <div className="flex flex-col gap-2.5 w-[320px]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn(
                    'w-8 h-8 rounded-full border flex items-center justify-center shrink-0',
                    hayFallos
                      ? 'bg-amber-50 border-amber-100 text-amber-600'
                      : 'bg-emerald-50 border-emerald-100 text-emerald-600',
                  )}>
                    {hayFallos ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[12px] font-bold text-[#111827] leading-tight">
                      {hayFallos ? 'Terminó con errores' : '¡Completado!'}
                    </span>
                    <span className="text-[10px] text-slate-500 leading-tight mt-0.5">
                      {hayFallos
                        ? `${logrados} generados · ${fallos.length} sin generar`
                        : `${logrados} listos`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    onClick={() => {
                      setIsProgressModalOpen(false)
                      router.push('/certificates')
                    }}
                    className="h-[28px] px-2.5 text-[10px] rounded-lg"
                  >
                    Historial
                  </Button>
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

              {/* El motivo de cada fallo, que es lo que permite arreglarlo.
                  Sin esto el usuario solo sabía cuántos habían fallado. */}
              {hayFallos && (
                <div className="flex flex-col gap-1.5 max-h-[168px] overflow-y-auto border-t border-slate-100 pt-2">
                  {fallos.map((f, i) => (
                    <div key={i} className="flex flex-col gap-0.5 px-2 py-1.5 rounded-lg bg-amber-50/70">
                      <span className="text-[10.5px] font-bold text-[#111827] leading-tight">
                        {f.studentName}
                      </span>
                      <span className="text-[10px] text-amber-800 leading-snug">
                        {f.error || 'Error no especificado.'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              </div>
              )
              })()
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

        {/* Baja de un estudiante, con su motivo (RF-21) */}
        <ClosePracticeModal
          practice={closePractice}
          onClose={() => setClosePractice(null)}
          onDone={handleClosed}
        />

        {/* Confirmación de certificados + palomita de envío automático a firma */}
        <ConfirmCertificatesModal
          open={showConfirmCerts}
          count={certEligibility.eligible.length}
          onClose={() => setShowConfirmCerts(false)}
          onConfirm={handleGenerateCertificates}
        />

        {/* Emisión masiva por período + carrera */}
        {periodCertModal && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setPeriodCertModal(false) }}
          >
            <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-[460px] border border-slate-100 overflow-hidden">
              <div className="px-6 pt-5 pb-4">
                <h2 className="text-[16px] font-bold text-[#111827]">Emitir certificados del período</h2>
                <p className="text-[12.5px] text-slate-500 mt-0.5">
                  Genera de una vez los certificados de todos los que cumplen los requisitos.
                </p>
              </div>

              <div className="mx-6 grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Período electivo</label>
                  <Select
                    value={massPeriod}
                    onChange={(e) => setMassPeriod(e.target.value)}
                    className="w-full mt-1"
                  >
                    {periods.map(p => <option key={String(p)} value={String(p)}>{String(p)}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Carrera</label>
                  <Select
                    value={massProgram}
                    onChange={(e) => setMassProgram(e.target.value)}
                    className="w-full mt-1"
                  >
                    <option value="ALL">Todas las carreras</option>
                    {programs.map(p => <option key={String(p)} value={String(p)}>{String(p)}</option>)}
                  </Select>
                </div>
              </div>

              {/* Desglose: qué entra y qué se omite */}
              <div className="mx-6 mb-4 grid grid-cols-3 gap-2 text-center">
                <div className="bg-emerald-50 border border-emerald-100 rounded-[10px] py-2">
                  <div className="text-[20px] font-bold text-emerald-600 leading-none">{massEligibility.eligible.length}</div>
                  <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mt-1">se emiten</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-[10px] py-2">
                  <div className="text-[20px] font-bold text-slate-500 leading-none">{massEligibility.already}</div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mt-1">ya tienen</div>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-[10px] py-2">
                  <div className="text-[20px] font-bold text-amber-600 leading-none">{massEligibility.noSolicitud}</div>
                  <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mt-1">sin requisitos</div>
                </div>
              </div>

              <label className="mx-6 mb-5 flex items-start gap-2.5 p-3 rounded-[12px] border border-slate-200 hover:border-blue-200 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={massAutoSign}
                  onChange={(e) => { setMassAutoSign(e.target.checked); localStorage.setItem('ppp-auto-send-signature', String(e.target.checked)) }}
                  className="w-[16px] h-[16px] mt-0.5 rounded border-slate-300 text-blue-600 cursor-pointer shrink-0"
                />
                <span className="text-[12.5px] text-slate-600 leading-snug">
                  <span className="font-semibold text-[#111827]">Enviar a firma automáticamente</span> al terminar
                  (circuito Responsable de Prácticas → Decano)
                </span>
              </label>

              <div className="flex justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
                <Button variant="ghost" onClick={() => setPeriodCertModal(false)} className="text-[13px] rounded-[10px]">
                  Cancelar
                </Button>
                <Button
                  onClick={() => handleGenerateCertificates(massAutoSign, massEligibility.eligible)}
                  disabled={massEligibility.eligible.length === 0 || isGenerating}
                  className="text-[13px] rounded-[10px] shadow-sm"
                >
                  Emitir {massEligibility.eligible.length} certificado{massEligibility.eligible.length !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmación del oficio: formato DOCX/PDF + aviso de reemplazo */}
        {solicitudModal && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setSolicitudModal(null) }}
          >
            <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-[440px] border border-slate-100 overflow-hidden">
              <div className="px-6 pt-5 pb-4">
                <h2 className="text-[16px] font-bold text-[#111827]">
                  {solicitudModal.grupos.length === 1
                    ? `Generar ${solicitudModal.kind === 'SOLICITUD' ? 'solicitud' : 'designación'} · ${solicitudModal.grupos[0].companyName}`
                    : `Generar ${solicitudModal.grupos.length} ${solicitudModal.kind === 'SOLICITUD' ? 'solicitudes' : 'designaciones'}`}
                </h2>
                <p className="text-[12.5px] text-slate-500 mt-0.5">
                  {solicitudModal.grupos.length > 1
                    ? `Un oficio por empresa, cada uno con sus ${totalAlumnosModal} estudiante${totalAlumnosModal > 1 ? 's' : ''} repartidos y su propio número.`
                    : solicitudModal.kind === 'SOLICITUD'
                      ? `Un único oficio que pide vacantes para los ${totalAlumnosModal} estudiante${totalAlumnosModal > 1 ? 's' : ''} del grupo.`
                      : `Un único oficio que designa a los ${totalAlumnosModal} estudiante${totalAlumnosModal > 1 ? 's' : ''} del grupo con su tutor académico.`}
                </p>
              </div>

              {/* Con varias empresas se enumeran: el coordinador tiene que ver
                  cuántos papeles va a producir y con quién va cada uno antes
                  de confirmar, no después. */}
              {solicitudModal.grupos.length > 1 && (
                <div className="mx-6 mb-3 rounded-[10px] border border-slate-200 divide-y divide-slate-100 max-h-[168px] overflow-y-auto">
                  {solicitudModal.grupos.map((g) => (
                    <div key={g.companyId} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="text-[12.5px] font-medium text-[#111827] truncate">{g.companyName}</span>
                      <span className="text-[11.5px] text-slate-500 whitespace-nowrap shrink-0">
                        {g.items.length} est.
                        {g.existing && <span className="text-amber-600 ml-1.5">· reemplaza</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {gruposQueReemplazan > 0 && (
                <div className="mx-6 mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-[10px] px-3 py-2.5">
                  <span className="text-[12px] text-amber-800 leading-snug">
                    ⚠ {gruposQueReemplazan === 1
                      ? `Ya existe una ${solicitudModal.kind === 'SOLICITUD' ? 'solicitud' : 'designación'} vigente para ${solicitudModal.grupos.length === 1 ? 'este grupo' : 'una de las empresas'}: la versión anterior`
                      : `Ya existen oficios vigentes para ${gruposQueReemplazan} de las empresas: las versiones anteriores`}
                    {' '}quedará{gruposQueReemplazan > 1 ? 'n' : ''} invalidada{gruposQueReemplazan > 1 ? 's' : ''} (visible en el historial por 30 días).
                  </span>
                </div>
              )}

              {/* Formato de entrega */}
              <div className="mx-6 mb-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => changeSolicitudFormat(false)}
                  className={`flex flex-col items-start gap-0.5 p-3 rounded-[12px] border text-left transition-colors ${!solicitudAsPdf ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/10' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <span className="text-[13px] font-bold text-[#111827]">Word (DOCX)</span>
                  <span className="text-[11px] text-slate-500 leading-snug">Editable.</span>
                </button>
                <button
                  onClick={() => changeSolicitudFormat(true)}
                  className={`flex flex-col items-start gap-0.5 p-3 rounded-[12px] border text-left transition-colors ${solicitudAsPdf ? 'border-rose-500 bg-rose-50/60 ring-2 ring-rose-500/10' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <span className="text-[13px] font-bold text-[#111827]">PDF</span>
                  <span className="text-[11px] text-slate-500 leading-snug">Listo para enviar.</span>
                </button>
              </div>

              <div className="mx-6 mb-5 flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="openBrowser"
                    checked={openInBrowser}
                    onChange={(e) => {
                      setOpenInBrowser(e.target.checked);
                      localStorage.setItem('unibridge_open_solicitud_in_browser', String(e.target.checked));
                    }}
                    className="rounded border-slate-300 text-[#111827] focus:ring-[#111827] w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="openBrowser" className="text-[13px] text-slate-700 cursor-pointer select-none">
                    Visualizar / Descargar al finalizar
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="blankSignatures"
                    checked={useBlankSignatures}
                    onChange={(e) => setUseBlankSignatures(e.target.checked)}
                    className="rounded border-slate-300 text-[#111827] focus:ring-[#111827] w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="blankSignatures" className="text-[13px] font-medium text-amber-900 bg-amber-50/70 border border-amber-200/60 rounded-md px-2 py-0.5 cursor-pointer select-none" title="Genera el documento sin imágenes de firma ni sello pegadas, dejando la línea en blanco para firmar con esfero a mano">
                    Sin imágenes de firma/sello (para firma física en papel)
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
                <Button variant="ghost" onClick={() => setSolicitudModal(null)} className="text-[13px] rounded-[10px]">
                  Cancelar
                </Button>
                <Button onClick={confirmGenerateSolicitud} disabled={isGenerating} className="text-[13px] rounded-[10px] shadow-sm">
                  {gruposQueReemplazan > 0 ? 'Regenerar' : 'Generar'}
                  {solicitudModal.grupos.length > 1 ? ` ${solicitudModal.grupos.length}` : ''} en {solicitudAsPdf ? 'PDF' : 'DOCX'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Nueva Práctica (Google / Monday Style) */}
        <NewPracticeModal
          isOpen={isNewPracticeModalOpen}
          onClose={() => {
            setIsNewPracticeModalOpen(false)
            setPracticeToEdit(null)
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['practices-all'] })
          }}
          practiceToEdit={practiceToEdit}
        />

        {/* Modal de Alerta y Diagnóstico de Datos Faltantes */}
        <MissingDataModal
          isOpen={missingDataGuard.isOpen}
          onClose={() => setMissingDataGuard((prev) => ({ ...prev, isOpen: false }))}
          studentName={missingDataGuard.studentName}
          documentType={missingDataGuard.documentType}
          missingFields={missingDataGuard.missingFields}
          onFixData={() => {
            if (missingDataGuard.practiceToFix) {
              setPracticeToEdit(missingDataGuard.practiceToFix)
              setIsNewPracticeModalOpen(true)
            }
          }}
        />

        {/* Pasos reales mientras se emite el oficio (convertir a PDF tarda ~7 s) */}
        <GenerationOverlay
          isOpen={!!oficioOverlay}
          title={oficioOverlay?.title || ''}
          asPdf={oficioOverlay?.asPdf}
          subtitle={oficioOverlay?.subtitle}
        />
        </PageContainer>
      </div>
    </RoleGate>
  )
}
