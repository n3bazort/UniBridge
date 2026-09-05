'use client'

import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight, MoreHorizontal, Building2, CheckSquare, Printer, AlertCircle, FileText, ArrowLeftRight, Loader2, Check, PenLine, UserCheck, UserMinus } from 'lucide-react'
import { api } from '@/lib/axios'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { LabelPill } from './labels/LabelPill'

export interface GeneratedDoc {
  id: string
  status?: 'VALID' | 'SUPERSEDED' | 'INVALIDATED'
  signatureStatus?: 'NONE' | 'IN_SIGNING' | 'PARTIALLY_SIGNED' | 'SIGNED' | 'REJECTED'
  documentCode?: string
  documentType?: string
  invalidReason?: string
  template: { type: string, name: string }
}

/**
 * Cómo debe verse el sello de firma de un certificado. Solo se colorea del todo
 * cuando las dos autoridades ya suscribieron; en los pasos intermedios avisa de
 * en qué punto del circuito está, y si aún no se ha enviado, lo dice.
 */
/**
 * Estado visual del ícono de firma.
 *
 * El circuito tiene dos firmas —Responsable primero, Decano después— y el
 * ícono lo dice con un ARCO alrededor, no con un borde más o menos grueso.
 * Un círculo cerrado se lee como «terminado» aunque sea fino; medio arco se
 * lee como «va por la mitad» de un vistazo, que es justo lo que hay que saber
 * al recorrer la lista.
 *
 *   firmas = null → no hay circuito: sin arco (ni certificado, ni enviado)
 *   firmas = 0    → enviado, nadie ha firmado: solo la pista tenue
 *   firmas = 1    → media vuelta
 *   firmas = 2    → vuelta completa
 */
function getFirmaState(pdf?: GeneratedDoc) {
  // Sin certificado: ícono apagado, sin fondo ni contorno
  if (!pdf) {
    return {
      cls: 'bg-muted/50 text-muted-foreground/50 cursor-default',
      title: 'Sin certificado emitido: primero hay que generarlo',
      activo: false,
      firmas: null as number | null,
    }
  }
  switch (pdf.signatureStatus) {
    case 'SIGNED':
      // 2 firmas → contorno grueso ("negrita"): único estado que se colorea
      // en verde, porque confirma que el circuito de firma quedó completo.
      return {
        cls: 'bg-success/10 hover:bg-success/20 text-success cursor-pointer',
        title: 'Firmado por ambas autoridades — ver en Certificados',
        activo: true,
        firmas: 2,
      }
    case 'PARTIALLY_SIGNED':
      // 1 firma → mismo tono que "enviado", pero con contorno: la firma que
      // falta se distingue por el anillo, no por inventar un segundo color.
      //
      // El circuito va Responsable → Decano (el lote nace en PENDING_DIRECTOR),
      // así que con una firma hecha la que falta es la del Decano.
      return {
        cls: 'bg-info/10 hover:bg-info/20 text-info cursor-pointer',
        title: 'En circuito de firma: falta el Decano — ver en Certificados',
        activo: true,
        firmas: 1,
      }
    case 'IN_SIGNING':
      // Enviado pero sin firmas aún: en curso, no urgente — tono informativo suave.
      return {
        cls: 'bg-info/10 hover:bg-info/20 text-info cursor-pointer',
        title: 'En circuito de firma: pendiente del Responsable de Prácticas — ver en Certificados',
        activo: true,
        firmas: 0,
      }
    case 'REJECTED':
      // Único caso que de verdad exige intervención del coordinador.
      return {
        cls: 'bg-destructive/10 hover:bg-destructive/20 text-destructive cursor-pointer',
        title: 'Firma rechazada: hay que revisarlo — ver en Certificados',
        activo: true,
        firmas: null,
      }
    default:
      // PDF existe pero no enviado: neutro, no reclama atención por sí solo.
      return {
        cls: 'bg-muted hover:bg-accent text-foreground/60 cursor-pointer',
        title: 'Sin enviar a firma: mándalo al circuito desde Certificados',
        activo: true,
        firmas: null,
      }
  }
}


/**
 * Arco de progreso del circuito de firma.
 *
 * Se dibuja con `stroke-dasharray`: la circunferencia se parte en el trozo que
 * se pinta y el que se deja en blanco. Girado -90° para que arranque arriba,
 * como cualquier indicador de progreso.
 *
 * Debajo va una pista tenue con la vuelta entera, que es lo que hace legible
 * que falta algo: sin ella, media vuelta suelta parece un adorno.
 */
function AnilloDeFirma({ firmas }: { firmas: number }) {
  const R = 10.6
  const VUELTA = 2 * Math.PI * R
  const pintado = (firmas / 2) * VUELTA

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx="12" cy="12" r={R}
        fill="none" stroke="currentColor" strokeWidth="2.2"
        className="opacity-20"
      />
      {firmas > 0 && (
        <circle
          cx="12" cy="12" r={R}
          fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
          strokeDasharray={`${pintado} ${VUELTA - pintado}`}
        />
      )}
    </svg>
  )
}

export interface Practice {
  id: string
  studentId: string
  companyId?: string
  /**
   * Fecha en que el acta del docente marcó la práctica como aprobada. Es la
   * única condición que habilita el certificado: los oficios de solicitud y
   * designación son trámite administrativo y ya no lo bloquean.
   */
  tutorApprovedAt?: string | null
  /** Etiqueta de seguimiento del coordinador; no interviene en `status` */
  label?: {
    id: string
    name: string
    color: string
    isSystem: boolean
    requiresCompletion: boolean
  } | null
  student: {
    firstName: string
    lastName: string
    dni: string
    phone?: string
    user?: { email: string }
    program?: { id?: string; name?: string }
    generatedDocs?: GeneratedDoc[]
  }
  company?: {
    id?: string
    name: string
    contactName: string
    /** Cargo del contacto: es el que los oficios imprimen como destinatario */
    recipientName?: string
    email?: string
    phone?: string
  }
  tutorName: string
  /** Docente como entidad (RF-23); `tutorName` es su nombre ya resuelto */
  tutorId?: string | null
  /** Fecha de baja o de cierre por reasignación (RF-19/RF-21) */
  closedAt?: string | null
  academicLevel: string
  practiceLevel: string
  /** Área de la empresa donde se desempeña; la solicitud oficial la imprime */
  workArea?: string
  academicPeriod?: string
  status: string
  totalHours: number
  startDate?: string | Date
  endDate?: string | Date
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
  /** Marca o desmarca UNA fila. La cabecera del grupo marca todas de golpe. */
  onToggleSelection?: (id: string) => void
  onToggleAll: (groupId: string, items: Practice[]) => void
  onGenerateSolicitud?: (items: Practice[]) => void
  /** Emite la designación del grupo. No depende de la solicitud: son independientes */
  onGenerateDesignacion?: (items: Practice[]) => void
  isGenerating?: boolean
  onSelectPractice?: (p: Practice) => void
  activePracticeId?: string | null
  isGrouped?: boolean
  onUpdateStatus?: (id: string, newStatus: string) => void
  /** Abre el buscador de reasignación de empresa para esta práctica */
  onReassign?: (p: Practice) => void
  /** Dar de baja al estudiante con su motivo (RF-21) */
  onClosePractice?: (p: Practice) => void
  /**
   * Período cerrado: la lista se consulta, no se opera. Oculta la casilla de
   * selección, que solo existe para emitir certificados. El resto de acciones
   * desaparecen solas porque la página deja de pasar sus manejadores.
   */
  soloLectura?: boolean
  /** Docs recién invalidados por una reasignación: disparan la animación de "quiebre" */
  recentlyInvalidatedDocIds?: Set<string>
  /** Click en un mini-ícono de documento: navega a su instancia en /certificates */
  onDocumentClick?: (docId: string) => void
  /** IDs de prácticas que actualmente están generando certificado */
  generatingCertIds?: Set<string>
  /**
   * Pinta la etiqueta de la fila. La página lo provee para envolver la píldora
   * en su selector; sin él la lista sigue mostrando la etiqueta, solo que como
   * indicador y sin poder cambiarla.
   */
  renderLabel?: (practice: Practice) => React.ReactNode
}

/**
 * Estado efectivo de un oficio en Word de un estudiante.
 *
 * Se filtra por `documentType`, no por el formato del archivo: la solicitud y la
 * designación son las dos DOCX, así que filtrar por tipo de archivo encendería
 * el ícono de una con el documento de la otra.
 */
function getOficioState(docs: GeneratedDoc[], tipo: 'SOLICITUD' | 'DESIGNACION') {
  const propios = docs.filter(d => (d.documentType || 'SOLICITUD') === tipo)
  const valid = propios.find(d => (d.status ?? 'VALID') === 'VALID')
  if (valid) return { state: 'valid' as const, doc: valid }
  const stale = propios.find(d => d.status === 'SUPERSEDED' || d.status === 'INVALIDATED')
  if (stale) return { state: 'stale' as const, doc: stale }
  return { state: 'none' as const, doc: undefined }
}

/** Estado efectivo del ícono de solicitud de un estudiante. */
function getDocxState(docs: GeneratedDoc[]) {
  return getOficioState(docs, 'SOLICITUD')
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
 * Qué acción tiene sentido ofrecer para un oficio de esta empresa.
 * Solo se ofrece cuando hay algo real que hacer: si todos los estudiantes
 * ya están cubiertos por un oficio vigente, no se muestra nada.
 */
function getOficioAction(items: Practice[], tipo: 'SOLICITUD' | 'DESIGNACION'): SolicitudAction {
  const states = items.map(p => getOficioState(p.student.generatedDocs || [], tipo).state)
  const validCount = states.filter(s => s === 'valid').length
  const staleCount = states.filter(s => s === 'stale').length

  if (validCount === items.length) return { kind: 'none' }        // todos cubiertos
  if (validCount > 0) return { kind: 'update', missing: items.length - validCount }
  if (staleCount > 0) return { kind: 'regenerate' }               // invalidada, ninguna vigente
  return { kind: 'create' }
}

function getSolicitudAction(items: Practice[]): SolicitudAction {
  return getOficioAction(items, 'SOLICITUD')
}

export function EntityList({ 
  groups, 
  selectedIds, 
  onToggleSelection, 
  onToggleAll, 
  onGenerateSolicitud,
  onGenerateDesignacion,
  isGenerating,
  onSelectPractice,
  activePracticeId,
  isGrouped,
  onUpdateStatus,
  onReassign,
  onClosePractice,
  soloLectura,
  recentlyInvalidatedDocIds,
  onDocumentClick,
  generatingCertIds,
  renderLabel
}: EntityListProps) {
  /**
   * Con algo marcado, la barra flotante es la única que ofrece acciones.
   *
   * Los botones de la cabecera del grupo y los de la barra flotante parecían
   * el mismo botón repetido, pero no lo son: la cabecera actúa sobre TODA la
   * empresa y la barra, sobre lo que esté marcado, que puede abarcar varias.
   * Cuando la selección coincide con un grupo hacen lo mismo, y no había forma
   * de saber cuál usar. Se resuelve dándole a cada estado un solo dueño: sin
   * selección manda la cabecera —atajo para el grupo entero—, y en cuanto se
   * marca algo, manda la barra, que además lleva el alcance escrito.
   */
  const haySeleccion = selectedIds.size > 0

  /**
   * Los grupos nacen PLEGADOS. Con cuarenta empresas abiertas de golpe, la
   * pantalla arranca en una pared de filas y hay que buscar la empresa
   * bajando; plegadas, se ve el índice completo y se abre solo la que toca.
   */
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const inicializado = useRef(false)
  useEffect(() => {
    if (inicializado.current || groups.length === 0) return
    inicializado.current = true
    setCollapsedGroups(new Set(groups.map((g) => g.name)))
  }, [groups])
  const [contextMenu, setContextMenu] = useState<{ id: string, x: number, y: number, canceled: boolean } | null>(null)

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
    setContextMenu({
      id: practice.id,
      x: e.clientX,
      y: e.clientY,
      canceled: practice.status === 'CANCELED' || practice.status === 'REJECTED',
    })
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
        // Cada oficio se evalúa por su cuenta: no hay orden obligatorio.
        const designacionAction = getOficioAction(group.items, 'DESIGNACION')

        // Campos que TODO el grupo comparte se dicen UNA vez en la cabecera;
        // las filas solo muestran lo que varía entre estudiantes.
        const uniq = (vals: (string | number | null | undefined)[]) => {
          const s = new Set(vals.map(v => String(v ?? '')))
          return s.size === 1 && group.items.length > 1 ? vals[0] : null
        }
        const sharedTutor = isGrouped ? (uniq(group.items.map(p => p.tutorName)) as string | null) : null

        /**
         * Una empresa puede recibir estudiantes de varios docentes distintos.
         * Cuando pasa, la lista se ordena por docente y cada bloque se abre con
         * su nombre: antes los estudiantes salían por orden alfabético, así que
         * los de un mismo tutor quedaban intercalados y su nombre solo se veía
         * truncado al final de la línea gris de cada fila.
         */
        const tutoresDelGrupo = new Set(group.items.map(p => p.tutorName || ''))
        const hayVariosTutores = isGrouped && !sharedTutor && tutoresDelGrupo.size > 1

        const nombreDe = (p: typeof group.items[number]) =>
          `${p.student.lastName ?? ''} ${p.student.firstName ?? ''}`.trim()

        const itemsAMostrar = hayVariosTutores
          ? [...group.items].sort(
              (a, b) =>
                (a.tutorName || 'zz').localeCompare(b.tutorName || 'zz', 'es') ||
                nombreDe(a).localeCompare(nombreDe(b), 'es'),
            )
          : group.items

        const cuentaPorTutor = new Map<string, number>()
        for (const p of group.items) {
          const k = p.tutorName || ''
          cuentaPorTutor.set(k, (cuentaPorTutor.get(k) ?? 0) + 1)
        }
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
                {!soloLectura && (
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
                      aria-label={`Seleccionar los ${group.count} estudiantes de ${group.name}`}
                      className="w-[18px] h-[18px] rounded border-input text-primary focus:ring-primary/20 cursor-pointer"
                    />
                  </div>
                )}

                <div className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors",
                  allGroupSelected ? "bg-[#111827] text-white" : "bg-slate-100 text-slate-500"
                )}>
                  {isGrouped ? <Building2 className="w-4 h-4" /> : (isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                </div>

                {/* El nombre de la empresa manda: reclama el espacio sobrante
                    y es lo último que se recorta. Antes este bloque no crecía
                    y los avisos, que iban en su misma línea, lo empujaban
                    hasta dejarlo en «AUTORI…» o en nada. */}
                <div className="flex flex-1 flex-col min-w-[120px] gap-0.5">
                  <div className="flex items-baseline gap-2.5 min-w-0">
                    <h3 className="text-[15px] font-semibold text-[#111827] truncate" title={group.name}>
                      {group.name}
                    </h3>
                    <span className="text-[13px] text-muted-foreground shrink-0">{group.count}</span>
                  </div>

                  {/* Segunda línea: lo que el grupo comparte y el aviso del
                      oficio. Aquí el texto puede ser largo sin robarle sitio
                      al nombre, y si aun así no cabe se recorta esta línea,
                      que es la accesoria. */}
                  <div className="flex items-center gap-2.5 min-w-0 text-[11.5px]">
                    {sharedParts.length > 0 && (
                      <span
                        className="text-muted-foreground truncate"
                        title="Datos comunes a todos los estudiantes del grupo"
                      >
                        Todos: {sharedParts.join(' · ')}
                      </span>
                    )}
                    {solicitudAction.kind === 'regenerate' && (
                      <span
                        className="flex items-center gap-1 text-amber-600 font-medium shrink-0"
                        title="La solicitud del grupo quedó invalidada: hay que generar una nueva"
                      >
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        solicitud desactualizada
                      </span>
                    )}
                    {solicitudAction.kind === 'update' && (
                      <span
                        className="flex items-center gap-1 text-amber-600 font-medium shrink-0"
                        title={`El oficio vigente no incluye a ${solicitudAction.missing} estudiante(s) del grupo`}
                      >
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {solicitudAction.missing} sin incluir
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Los dos oficios son INDEPENDIENTES.
                  Antes eran excluyentes: la designación solo aparecía cuando
                  todo el grupo tenía ya su solicitud vigente
                  (`puedeDesignar = solicitudAction.kind === 'none'`), así que
                  para designar había que emitir antes una solicitud aunque la
                  empresa ya hubiera acordado el cupo de palabra. Ahora cada
                  botón aparece si hay algo que hacer con SU tipo, y pueden
                  verse los dos a la vez. */}
              <div className="flex items-center gap-2 shrink-0">
                {/*
                  Cuando ya no hay nada que emitir, DECIRLO. Antes este
                  espacio quedaba vacío: el usuario pasaba el ratón esperando
                  un botón, no salía nada, y no tenía forma de saber si era
                  porque ya estaba hecho o porque algo fallaba. El silencio es
                  ambiguo; un «vigente» discreto no lo es.
                */}
                {solicitudAction.kind === 'none' && designacionAction.kind === 'none' && (
                  <span
                    className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-600 shrink-0"
                    title="Los dos oficios del grupo están emitidos y vigentes: no hay nada que generar"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Oficios vigentes
                  </span>
                )}

                {onGenerateSolicitud && solicitudAction.kind !== 'none' && !haySeleccion && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onGenerateSolicitud(group.items)
                    }}
                    disabled={isGenerating}
                    className={cn(
                      'h-8 flex items-center gap-1.5 rounded-lg text-[12.5px] font-medium transition-all disabled:opacity-50 shrink-0',
                      allGroupSelected
                        ? needsAttention
                          ? 'px-3.5 bg-warning text-warning-foreground hover:bg-warning/90 shadow-soft'
                          : 'px-3.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-soft'
                        : needsAttention
                          ? 'px-2.5 text-warning hover:bg-warning/10'
                          : 'px-2.5 text-muted-foreground hover:text-foreground hover:bg-muted',
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
                          ? 'Actualizar solicitud'
                          : solicitudAction.kind === 'regenerate'
                            ? 'Regenerar solicitud'
                            : 'Solicitud'}
                      </>
                    )}
                  </button>
                )}

                {onGenerateDesignacion && designacionAction.kind !== 'none' && !haySeleccion && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onGenerateDesignacion(group.items)
                    }}
                    disabled={isGenerating}
                    className={cn(
                      'h-8 flex items-center gap-1.5 rounded-lg text-[12.5px] font-medium transition-all disabled:opacity-50 shrink-0',
                      allGroupSelected
                        ? 'px-3.5 bg-violet-600 hover:bg-violet-700 text-white shadow-soft'
                        : 'px-2.5 text-violet-600 hover:bg-violet-50',
                    )}
                    title={
                      designacionAction.kind === 'update'
                        ? `La designación actual no incluye a ${designacionAction.missing} estudiante(s). Se rehará con el grupo completo.`
                        : designacionAction.kind === 'regenerate'
                          ? 'La designación quedó invalidada. Se generará una nueva para el grupo.'
                          : `Designa a los ${group.count} estudiantes de ${group.name} con su tutor académico`
                    }
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    {designacionAction.kind === 'update'
                      ? 'Actualizar designación'
                      : designacionAction.kind === 'regenerate'
                        ? 'Regenerar designación'
                        : 'Designación'}
                  </button>
                )}
              </div>
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
                  {itemsAMostrar.map((practice, idx) => {
                    // Varios docentes en la misma empresa: el bloque de cada uno
                    // se abre con su nombre y un poco de aire por encima. Nada
                    // más — ni tarjetas anidadas ni cabeceras que compitan con
                    // la de la empresa.
                    const abreBloque =
                      hayVariosTutores && practice.tutorName !== (idx > 0 ? itemsAMostrar[idx - 1].tutorName : undefined)

                    const isSelected = selectedIds.has(practice.id)
                    const isActive = activePracticeId === practice.id
                    // Sin solicitud vigente = no certificable. Se marca en la
                    // fila para que se entienda por qué bloquea la selección.
                    // Lo que impide certificar es NO tener el acta del docente.
                    // Antes se miraba la solicitud vigente, que es trámite y no acredita nada.
                    const blocksCertificate = !practice.tutorApprovedAt

                    return (
                      <React.Fragment key={practice.id}>
                      {abreBloque && (
                        <div className={cn('flex items-center gap-1.5 pl-1', idx > 0 && 'mt-2.5')}>
                          <UserCheck className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={2} />
                          <span className="truncate text-[11px] font-medium text-[#6b7280]">
                            {practice.tutorName || 'Sin docente tutor'}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {cuentaPorTutor.get(practice.tutorName || '') ?? 0}
                          </span>
                          <span className="ml-1 h-px flex-1 bg-[#f0f0f0]" />
                        </div>
                      )}
                      <motion.div
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
                        title={isSelected && blocksCertificate ? 'Se omitirá al emitir certificados: aún no tiene el acta del docente' : undefined}
                      >
                        {/* Casilla por fila.
                            Antes la selección era solo por empresa: o entraba
                            el grupo entero o ninguno. Si de doce estudiantes
                            había que sacar a dos del oficio, no se podía. */}
                        {!soloLectura && onToggleSelection ? (
                          <div
                            className="w-[26px] shrink-0 mr-1.5 flex items-center justify-center"
                            onClick={(e) => { e.stopPropagation(); onToggleSelection(practice.id) }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              aria-label={`Seleccionar a ${practice.student.firstName} ${practice.student.lastName}`}
                              className="w-[15px] h-[15px] rounded border-input text-primary focus:ring-primary/20 cursor-pointer"
                            />
                          </div>
                        ) : (
                          <div className="w-[10px] shrink-0 mr-2.5 flex items-center justify-center">
                            {isSelected && (
                              <span className={cn("w-[3px] h-7 rounded-full", blocksCertificate ? "bg-warning" : "bg-primary")} />
                            )}
                          </div>
                        )}

                        {/* Nombre + datos secundarios en una sola línea discreta */}
                        <div className="flex flex-col flex-1 min-w-[180px] truncate pr-4">
                          {/* Sin distintivo de «Borrador»: PENDING solo quiere
                              decir que aún no se emitió la solicitud, y eso ya
                              lo dice la píldora del final de la fila. */}
                          <span className="text-[13.5px] font-semibold text-[#111827] truncate">
                            {practice.student.firstName} {practice.student.lastName}
                          </span>
                          {/* Solo lo que VARÍA entre compañeros; lo común vive en
                              la cabecera. Si no varía nada, la línea no aparece:
                              la cédula ocupaba sitio sin distinguir a nadie que
                              el nombre no distinguiera ya, y está en la ficha. */}
                          {(() => {
                            const parts: string[] = []
                            if (sharedLevel === null && practice.academicLevel) parts.push(practice.academicLevel.replace(' Nivel', ''))
                            if (sharedHours === null) parts.push(`${practice.totalHours || 0} h`)
                            // Si el docente ya encabeza su bloque, repetirlo en
                            // cada fila solo sirve para que se corte a mitad.
                            if (sharedTutor === null && !hayVariosTutores && practice.tutorName) parts.push(practice.tutorName)
                            if (parts.length === 0) return null
                            return (
                              <span className="text-[12px] text-muted-foreground truncate">{parts.join(' · ')}</span>
                            )
                          })()}
                        </div>

                        {/* Documentos + Firma: antes eran 4 cajas de 28×28
                            sueltas (una por Solicitud/Designación/Certificado/
                            Firma), cada una con su propio fondo — aunque ya
                            neutras, seguían leyéndose como 4 botones
                            compitiendo. Ahora "documentos" es UN grupo visual
                            compacto (misma bandeja, íconos más chicos y sin
                            fondo propio salvo al pasar el mouse), y "firma"
                            queda aparte porque es otro concepto: progreso de
                            firma, no existencia de documento. */}
                        <div className="flex items-center gap-1.5 w-[124px] shrink-0">
                          {(() => {
                            const docs = practice.student.generatedDocs || []
                            const docxState = getDocxState(docs)
                            const designacionState = getOficioState(docs, 'DESIGNACION')
                            const pdf = docs.find(d => d.documentType === 'CERTIFICADO' && (d.status ?? 'VALID') === 'VALID')

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

                            // La designación se emite después de que la empresa
                            // acepta, así que antes de la solicitud no procede.
                            const designacionTitle = designacionState.state === 'valid'
                              ? `Designación ${designacionState.doc?.documentCode || ''} — ver en Certificados`
                              : designacionState.state === 'stale'
                                ? `Designación invalidada: ${designacionState.doc?.invalidReason || 'requiere regenerarse'}`
                                : docxState.state === 'valid'
                                  ? 'Sin designación — emítela desde el grupo de la empresa'
                                  : 'Sin designación: primero hace falta la solicitud'

                            const isGeneratingCert = generatingCertIds?.has(practice.id)

                            return (
                              <>
                                {/*
                                  Los 3 documentos comparten UNA bandeja (antes
                                  eran 3 cajas sueltas que saturaban la fila),
                                  pero cada uno conserva SU color cuando ya
                                  esta generado: azul solicitud, violeta
                                  designacion, rosa certificado. Se probo
                                  dejarlos todos grises "porque ya estan en
                                  orden" y fue un error: sin color no se
                                  distingue de un vistazo lo que ya existe de
                                  lo que falta, que es justo lo que se lee al
                                  recorrer la lista. Ambar = requiere
                                  regenerarse.
                                */}
                                <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5 shrink-0">
                                  <motion.button
                                    animate={justInvalidated ? { x: [0, -4, 4, -3, 3, -1, 0], rotate: [0, -6, 6, -4, 4, 0] } : {}}
                                    transition={{ duration: 0.5, ease: 'easeOut' }}
                                    onClick={(e) => docxState.doc ? handleDocClick(e, docxState.doc.id) : e.stopPropagation()}
                                    className={cn(
                                      "relative w-6 h-6 rounded-md flex items-center justify-center transition-all",
                                      docxState.state === 'valid' ? "bg-blue-50 hover:bg-blue-100 text-blue-500 cursor-pointer" :
                                      docxState.state === 'stale' ? "bg-warning/15 hover:bg-warning/25 text-warning cursor-pointer" :
                                      "text-muted-foreground/40 cursor-default",
                                    )}
                                    title={docxTitle}
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                    {docxState.state === 'stale' && (
                                      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-warning text-warning-foreground text-[8px] font-bold flex items-center justify-center leading-none">!</span>
                                    )}
                                  </motion.button>
                                  {/* Designación del estudiante y su tutor */}
                                  <button
                                    onClick={(e) => designacionState.doc ? handleDocClick(e, designacionState.doc.id) : e.stopPropagation()}
                                    className={cn(
                                      "relative w-6 h-6 rounded-md flex items-center justify-center transition-all",
                                      designacionState.state === 'valid' ? "bg-violet-50 hover:bg-violet-100 text-violet-500 cursor-pointer" :
                                      designacionState.state === 'stale' ? "bg-warning/15 hover:bg-warning/25 text-warning cursor-pointer" :
                                      "text-muted-foreground/40 cursor-default",
                                    )}
                                    title={designacionTitle}
                                  >
                                    <UserCheck className="w-3.5 h-3.5" />
                                    {designacionState.state === 'stale' && (
                                      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-warning text-warning-foreground text-[8px] font-bold flex items-center justify-center leading-none">!</span>
                                    )}
                                  </button>
                                  <button
                                    onClick={(e) => pdf && !isGeneratingCert ? handleDocClick(e, pdf.id) : e.stopPropagation()}
                                    className={cn(
                                      "w-6 h-6 rounded-md flex items-center justify-center transition-all",
                                      isGeneratingCert ? "bg-rose-50 text-rose-500 cursor-wait" :
                                      pdf ? "bg-rose-50 hover:bg-rose-100 text-rose-500 cursor-pointer" :
                                      "text-muted-foreground/40 cursor-default"
                                    )}
                                    title={isGeneratingCert ? 'Generando certificado...' : pdf ? `Certificado ${pdf.documentCode || ''} — ver en Certificados` : 'Sin certificado emitido'}
                                  >
                                    {isGeneratingCert ? (
                                      <div className="relative w-3.5 h-3.5">
                                        <svg className="w-3.5 h-3.5 -rotate-90 animate-spin" viewBox="0 0 24 24">
                                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="transparent" strokeDasharray="45" strokeDashoffset="15" />
                                        </svg>
                                      </div>
                                    ) : (
                                      <FileText className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                                {/* Firma: aparte a propósito — no es "existe o no",
                                    es en qué paso del circuito de firma va. */}
                                {(() => {
                                  const firma = getFirmaState(pdf)
                                  return (
                                    <button
                                      onClick={(e) => (pdf && firma.activo) ? handleDocClick(e, pdf.id) : e.stopPropagation()}
                                      className={cn(
                                        "relative w-6 h-6 rounded-md flex items-center justify-center transition-all shrink-0",
                                        firma.cls,
                                      )}
                                      title={firma.title}
                                    >
                                      {firma.firmas !== null && <AnilloDeFirma firmas={firma.firmas} />}
                                      <PenLine className="w-3.5 h-3.5" />
                                    </button>
                                  )
                                })()}
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
                            className="w-[26px] h-[26px] mr-2 rounded-[7px] flex items-center justify-center shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-slate-100 hover:text-[#111827] transition-all"
                            title="Reasignar a otra empresa"
                          >
                            <ArrowLeftRight className="w-4 h-4" />
                          </button>
                        )}

                        {/* Dar de baja (RF-21). Solo cuando la práctica sigue
                            abierta: una ya cerrada no se cierra dos veces. */}
                        {onClosePractice && !practice.closedAt && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onClosePractice(practice)
                            }}
                            className="w-[26px] h-[26px] mr-2 rounded-[7px] flex items-center justify-center shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-all"
                            title="Dar de baja a este estudiante"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        )}

                        {/* Acta del docente: el único requisito que no se ve en
                            la fila y sin el cual no se puede certificar. Llega
                            por fuera del sistema —el tutor se la pasa a la
                            coordinación— así que quien mira la lista no tiene
                            forma de saber quién ya la tiene. El punto lo dice
                            de un vistazo, sin abrir la ficha de nadie. */}
                        <div
                          className="w-[18px] shrink-0 mr-2 flex items-center justify-center"
                          title={
                            practice.tutorApprovedAt
                              ? 'Acta del docente registrada: apto para certificar'
                              : 'Sin acta del docente: todavía no se puede certificar'
                          }
                        >
                          <span
                            className={cn(
                              'h-2.5 w-2.5 rounded-full',
                              practice.tutorApprovedAt
                                ? 'bg-emerald-500 ring-2 ring-emerald-500/20'
                                : 'bg-slate-200',
                            )}
                          />
                        </div>

                        {/* Etiqueta de seguimiento; si no hay, se ve el estado
                            derivado. Un clic abre el selector. */}
                        <div className="flex items-center w-[132px] shrink-0" onClick={(e) => e.stopPropagation()}>
                          {renderLabel ? (
                            renderLabel(practice)
                          ) : (
                            <LabelPill label={practice.label} status={practice.status} />
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end w-[32px] shrink-0 ml-1">
                          <button
                            className="p-1.5 text-muted-foreground hover:text-[#111827] transition-colors rounded-md hover:bg-[#f3f4f6] opacity-0 group-hover:opacity-100"
                            onClick={(e) => handleContextMenu(e, practice)}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                      </React.Fragment>
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
          {/*
            Aquí solo caben las decisiones que de verdad le corresponden a una
            persona. No iniciado, En proceso y Finalizado los deduce el
            sistema de los documentos emitidos: ponerlos a mano no servía de
            nada —el siguiente recálculo los revertía— y «Finalizado» además
            devolvía un error del servidor. Cancelar y reactivar sí perduran.
          */}
          {contextMenu.canceled ? (
            <>
              <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Práctica cancelada
              </div>
              <button
                onClick={() => changeStatus(contextMenu.id, 'IN_PROGRESS')}
                className="w-full text-left px-3 py-2 text-[13px] font-medium text-[#374151] hover:bg-[#f8fafc] hover:text-[#1d4ed8] rounded-md transition-colors"
                title="Vuelve a dejar el estado en manos del sistema, que lo deducirá de los documentos"
              >
                Reactivar práctica
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                if (window.confirm('¿Cancelar esta práctica? El historial se conserva, pero dejará de estar activa y no podrá emitir documentos.')) {
                  changeStatus(contextMenu.id, 'CANCELED')
                }
              }}
              className="w-full text-left px-3 py-2 text-[13px] font-semibold text-red-600 hover:bg-red-50 rounded-md transition-colors"
            >
              Cancelar práctica
            </button>
          )}
        </div>
      )}

    </div>

    </>
  )
}
