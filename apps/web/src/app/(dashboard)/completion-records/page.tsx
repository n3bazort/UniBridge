'use client'

import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { api } from '@/lib/axios'
import { cn } from '@/lib/utils'
import { RoleGate } from '@/components/shared/role-gate'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import {
  FileCheck2, UploadCloud, CheckCircle2, AlertTriangle, XCircle, UserX,
  ClipboardList, Loader2, RotateCcw, ChevronDown, FileText, Info, Lock,
} from 'lucide-react'
import { usePeriodStore } from '@/store/period'

/* ─────────────── Tipos que devuelve el servidor ─────────────── */

interface Listo {
  dni: string
  nombreActa: string
  studentId: string
  practiceId: string
  nombre: string
  empresa: string | null
  tutorActual: string | null
}

interface Revision {
  cabecera: {
    actaNumber: string | null
    actaVersion: string | null
    academicPeriod: string | null
    subject: string | null
    courseCode: string | null
    level: string | null
    parallel: string | null
    professorRaw: string | null
  }
  advertencias: string[]
  listos: Listo[]
  reprobados: Array<{ dni: string; nombreActa: string; condicion: string }>
  desconocidos: Array<{ dni: string; nombreActa: string }>
  sinPractica: Array<{ dni: string; nombre: string; motivo: string }>
  yaAprobados: Array<{ dni: string; nombre: string; aprobadoEl: string; porTutor: string | null }>
  tutorSugerido: { id: string; fullName: string } | null
}

interface AcademicPeriod {
  id: string
  code: string
  name: string
  isActive: boolean
}

interface ActaRegistrada {
  id: string
  academicPeriod: string
  actaNumber: string | null
  subject: string | null
  fileName: string | null
  fileKey: string | null
  createdAt: string
  tutor: { fullName: string }
  uploadedBy: { firstName: string | null; lastName: string | null; email: string }
  _count: { approvedPractices: number }
}

/* ─────────────── Grupo plegable de la revisión ─────────────── */

function Grupo({
  titulo, cuenta, tono, icono: Icono, children, abiertoPorDefecto = false,
}: {
  titulo: string
  cuenta: number
  tono: 'ok' | 'aviso' | 'malo' | 'neutro'
  icono: any
  children: React.ReactNode
  abiertoPorDefecto?: boolean
}) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto)
  if (cuenta === 0) return null

  const tonos = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    aviso: 'bg-amber-50 text-amber-700 border-amber-200',
    malo: 'bg-red-50 text-red-700 border-red-200',
    neutro: 'bg-muted text-muted-foreground border-border',
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50"
      >
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-full border', tonos[tono])}>
          <Icono className="h-4 w-4" />
        </span>
        <span className="flex-1 text-sm font-medium">{titulo}</span>
        <span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums', tonos[tono])}>
          {cuenta}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && <div className="border-t border-border">{children}</div>}
    </Card>
  )
}

/* ─────────────── Página ─────────────── */

export default function CompletionRecordsPage() {
  /**
   * Cola de actas pendientes de revisar.
   *
   * Al cierre de período los docentes no entregan sus actas de una en una:
   * llegan varias juntas. Antes había que soltar un archivo, revisarlo,
   * confirmarlo, y volver a abrir el selector para el siguiente. Ahora se
   * sueltan todas y el sistema las va sirviendo.
   *
   * Se procesan de una en una a propósito: cada acta aprueba a estudiantes
   * concretos y va a nombre de un docente concreto. Confirmarlas en bloque sin
   * mirar sería firmar a ciegas un documento que acredita horas cumplidas.
   */
  const [cola, setCola] = useState<File[]>([])
  const archivo = cola[0] ?? null
  const [revision, setRevision] = useState<Revision | null>(null)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [leyendo, setLeyendo] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  const { selectedPeriod } = usePeriodStore()

  const { data: periodos = [] } = useQuery<AcademicPeriod[]>({
    queryKey: ['academic-periods'],
    queryFn: async () => (await api.get('/academic-periods')).data,
    staleTime: 5 * 60 * 1000,
  })

  // El selector del topbar gobierna lo que se ve; el período activo gobierna
  // lo que se puede escribir. Si el coordinador está mirando un semestre
  // cerrado, esta pantalla se convierte en consulta.
  const periodoActivo = periodos.find((p) => p.isActive)
  const periodo = selectedPeriod ?? periodoActivo?.code ?? null
  const cerrado = !!periodo && !!periodoActivo && periodo !== periodoActivo.code
  const soloLectura = cerrado || !periodoActivo

  const { data: actas = [], refetch: recargarActas } = useQuery<ActaRegistrada[]>({
    queryKey: ['completion-records', periodo],
    queryFn: async () =>
      (await api.get('/completion-records', { params: { academicPeriod: periodo } })).data,
    enabled: !!periodo,
  })

  const onDrop = useCallback((files: File[]) => {
    if (files.length === 0) return
    setCola(files)
    setRevision(null)
    setSeleccion(new Set())
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
    disabled: soloLectura,
  })

  /** Descarta la cola entera: el botón de cancelar. */
  const limpiar = () => {
    setCola([])
    setRevision(null)
    setSeleccion(new Set())
  }

  /** Retira el acta ya resuelta y deja lista la siguiente de la cola. */
  const siguienteActa = () => {
    setCola((c) => c.slice(1))
    setRevision(null)
    setSeleccion(new Set())
  }

  /* Lee el acta sin escribir nada: todo lo que el sistema decidiría se ve antes. */
  const leerActa = async () => {
    if (!archivo) {
      toast.error('Adjunta el acta de calificaciones en PDF')
      return
    }
    setLeyendo(true)
    try {
      const fd = new FormData()
      fd.append('file', archivo)
      if (periodo) fd.append('academicPeriod', periodo)

      const { data } = await api.post<Revision>('/completion-records/preview', fd)
      setRevision(data)
      // Todos los que el acta aprueba entran marcados: desmarcar es la excepción.
      setSeleccion(new Set(data.listos.map((l) => l.practiceId)))

      if (data.listos.length === 0) {
        toast.warning('Ningún estudiante del acta queda pendiente de aprobar en este período.')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo leer el acta')
    } finally {
      setLeyendo(false)
    }
  }

  const confirmar = async () => {
    if (!archivo) return
    // Quién aprueba lo decide el acta, no la pantalla: si el servidor no
    // reconoció al docente que la firma, no hay nada que confirmar.
    if (!revision?.tutorSugerido) {
      toast.error('No se reconoce al docente que firma el acta: regístralo antes de confirmar')
      return
    }
    setConfirmando(true)
    try {
      const fd = new FormData()
      fd.append('file', archivo)
      if (periodo) fd.append('academicPeriod', periodo)
      fd.append('practiceIds', JSON.stringify([...seleccion]))

      const { data } = await api.post('/completion-records/confirm', fd)
      const quedan = cola.length - 1
      toast.success(
        `${data.aprobados} estudiante${data.aprobados === 1 ? '' : 's'} aprobado${data.aprobados === 1 ? '' : 's'} a nombre de ${data.tutor}.` +
        (quedan > 0 ? ` Quedan ${quedan} acta${quedan === 1 ? '' : 's'} por revisar.` : ''),
        { duration: 8000 },
      )
      // Se retira la resuelta y la siguiente queda lista para leer. La cola
      // entera solo se descarta con el botón de cancelar.
      siguienteActa()
      recargarActas()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo registrar la aprobación', { duration: 10000 })
    } finally {
      setConfirmando(false)
    }
  }

  /**
   * Marca o desmarca todo el grupo de un golpe.
   *
   * Mismo criterio que la pantalla de Importación: si ya está todo marcado, el
   * control desmarca; en cualquier otro caso, marca todo. Un acta de treinta
   * estudiantes no se desmarca de a uno.
   */
  const alternarTodos = () => {
    if (!revision) return
    setSeleccion((prev) =>
      prev.size === revision.listos.length ? new Set() : new Set(revision.listos.map((l) => l.practiceId)),
    )
  }

  const alternar = (practiceId: string) => {
    setSeleccion((prev) => {
      const s = new Set(prev)
      if (s.has(practiceId)) s.delete(practiceId)
      else s.add(practiceId)
      return s
    })
  }

  const hayEntrada = !!archivo

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <PageContainer variant="reading">
        <PageHeader
          className="mb-8"
          description="Carga el acta de calificaciones en PDF. El sistema lee quién la firma y a quiénes aprueba, y solo a esos los marca. Sin esa marca no se emite el certificado."
          meta={
            periodo ? (
              <>
                Período <strong className="text-foreground">{periodo}</strong> ·{' '}
                {actas.length} acta{actas.length === 1 ? '' : 's'} registrada{actas.length === 1 ? '' : 's'}
              </>
            ) : undefined
          }
        />

        {/* Un período cerrado se consulta, no recibe aprobaciones nuevas. Se
            dice arriba del todo, antes de que nadie arrastre un archivo. */}
        {soloLectura && (
          <div className="mb-6 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm leading-relaxed text-amber-800">
              {periodoActivo ? (
                <>
                  Estás viendo <strong>{periodo}</strong>, que está cerrado: aquí solo se consulta.
                  Las aprobaciones nuevas se registran en <strong>{periodoActivo.code}</strong>,
                  que es el período abierto — cámbialo en el selector de arriba.
                </>
              ) : (
                <>No hay ningún período académico activo, así que no se pueden registrar aprobaciones.</>
              )}
            </p>
          </div>
        )}

        {/* ── Carga ──
            Una sola columna y un solo camino. Antes esta zona tenía tres
            decisiones en paralelo —arrastrar el PDF, pegar cédulas, elegir
            docente en un panel lateral— para una tarea que en realidad es una:
            entregar el acta. El docente ya no se elige: sale de la cabecera del
            propio acta, que es quien la firma. */}
        <Card className="p-6">
          <div
            {...getRootProps()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center transition-colors',
              isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/40',
              archivo && 'border-success/40 bg-success/5',
            )}
          >
            <Input {...getInputProps()} />
            {archivo ? (
              <>
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
                  <FileText className="h-6 w-6 text-success" />
                </div>
                {cola.length > 1 && (
                  <span className="mb-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    Acta 1 de {cola.length} · las demás esperan turno
                  </span>
                )}
                <p className="text-base font-semibold text-foreground">{archivo.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {(archivo.size / 1024).toFixed(0)} KB · pulsa para cambiarlas
                </p>
                {cola.length > 1 && (
                  <p className="mt-3 max-w-md text-xs text-muted-foreground">
                    En cola: {cola.slice(1).map((f) => f.name).join(' · ')}
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <UploadCloud className="h-6 w-6 text-primary" />
                </div>
                <p className="text-base font-semibold text-foreground">Arrastra tus actas en PDF aquí</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Puedes soltar varias a la vez: se revisan una por una, en orden.
                </p>
                <Button type="button" className="mt-5 pointer-events-none">
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Seleccionar archivos
                </Button>
                <p className="mt-4 text-xs text-muted-foreground">
                  Solo archivos PDF · máx. 15 MB cada uno · deben ser los oficiales de Secretaría General
                </p>
              </>
            )}
          </div>

          {/* Quién aprueba no se elige: se lee. Se enseña en cuanto el acta se
              ha revisado, para que el coordinador lo vea antes de confirmar. */}
          {revision && (
            <div className="mt-5 flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
              {revision.tutorSugerido ? (
                <>
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <p className="text-sm text-foreground">
                    Aprueba <strong>{revision.tutorSugerido.fullName}</strong>, que es quien firma el
                    acta. La aprobación queda a su nombre, no al de quien la registra.
                  </p>
                </>
              ) : (
                <>
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <p className="text-sm text-foreground">
                    No se reconoce al docente que firma el acta, así que no hay a quién atribuir la
                    aprobación. Regístralo como docente tutor y vuelve a cargarla.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center gap-2">
            <Button onClick={leerActa} disabled={!hayEntrada || leyendo || soloLectura}>
              {leyendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardList className="mr-2 h-4 w-4" />}
              Revisar antes de confirmar
            </Button>
            {hayEntrada && (
              <Button variant="ghost" onClick={limpiar}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Empezar de nuevo
              </Button>
            )}
          </div>
        </Card>

        {/* ── Revisión ── */}
        {revision && (
          <section className="mt-8">
            {/* Lo que el acta dice de sí misma */}
            {revision.cabecera.actaNumber && (
              <Card className="mb-4 p-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <span className="font-medium">
                    Acta {revision.cabecera.actaNumber}
                    {revision.cabecera.actaVersion && ` · v${revision.cabecera.actaVersion}`}
                  </span>
                  {revision.cabecera.subject && (
                    <span className="text-muted-foreground">
                      {revision.cabecera.subject}
                      {revision.cabecera.courseCode && ` (${revision.cabecera.courseCode})`}
                    </span>
                  )}
                  {revision.cabecera.academicPeriod && (
                    <Badge variant="outline">Período {revision.cabecera.academicPeriod}</Badge>
                  )}
                  {revision.cabecera.parallel && (
                    <span className="text-muted-foreground">Paralelo {revision.cabecera.parallel}</span>
                  )}
                </div>
                {revision.cabecera.professorRaw && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Firma el acta: {revision.cabecera.professorRaw}
                  </p>
                )}
              </Card>
            )}

            {revision.advertencias.length > 0 && (
              <div className="mb-4 space-y-2">
                {revision.advertencias.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <Grupo
                titulo="Listos para aprobar"
                cuenta={revision.listos.length}
                tono="ok"
                icono={CheckCircle2}
                abiertoPorDefecto
              >
                {/* Marcar todo / nada. Va dentro de la lista y no en la
                    cabecera del grupo porque esa cabecera ya es un botón
                    (plegar), y un checkbox dentro de un botón no es pulsable. */}
                <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={seleccion.size === revision.listos.length && revision.listos.length > 0}
                    ref={(el) => {
                      // Estado intermedio: hay algunos marcados, pero no todos.
                      if (el) el.indeterminate = seleccion.size > 0 && seleccion.size < revision.listos.length
                    }}
                    onChange={alternarTodos}
                    disabled={soloLectura}
                    className="h-4 w-4 rounded border-input"
                    aria-label="Marcar o desmarcar a todos los estudiantes que el acta aprueba"
                  />
                  <span className="text-xs font-medium text-muted-foreground">
                    {seleccion.size === revision.listos.length ? 'Desmarcar todos' : 'Marcar todos'}
                    <span className="ml-2 tabular-nums">
                      ({seleccion.size} de {revision.listos.length} marcados)
                    </span>
                  </span>
                </div>

                <ul className="divide-y divide-border">
                  {revision.listos.map((l) => {
                    const marcada = seleccion.has(l.practiceId)
                    return (
                      <li
                        key={l.practiceId}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2.5 transition-opacity',
                          !marcada && 'opacity-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={marcada}
                          onChange={() => alternar(l.practiceId)}
                          disabled={soloLectura}
                          className="h-4 w-4 rounded border-input"
                          aria-label={`Aprobar a ${l.nombre}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{l.nombre}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            <span className="tabular-nums">{l.dni}</span>
                            {l.empresa && ` · ${l.empresa}`}
                            {l.tutorActual && ` · tutor actual: ${l.tutorActual}`}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </Grupo>

              <Grupo
                titulo="El acta NO los aprueba"
                cuenta={revision.reprobados.length}
                tono="malo"
                icono={XCircle}
              >
                <ul className="divide-y divide-border">
                  {revision.reprobados.map((r) => (
                    <li key={r.dni} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span>
                        {r.nombreActa || r.dni}
                        <span className="ml-2 tabular-nums text-xs text-muted-foreground">{r.dni}</span>
                      </span>
                      <Badge variant="danger">{r.condicion}</Badge>
                    </li>
                  ))}
                </ul>
              </Grupo>

              <Grupo
                titulo="Cédulas que no corresponden a ningún estudiante"
                cuenta={revision.desconocidos.length}
                tono="aviso"
                icono={UserX}
              >
                <ul className="divide-y divide-border">
                  {revision.desconocidos.map((d) => (
                    <li key={d.dni} className="px-4 py-2.5 text-sm">
                      <span className="tabular-nums">{d.dni}</span>
                      {d.nombreActa && <span className="ml-2 text-muted-foreground">{d.nombreActa}</span>}
                    </li>
                  ))}
                </ul>
              </Grupo>

              <Grupo
                titulo="Sin práctica abierta en este período"
                cuenta={revision.sinPractica.length}
                tono="aviso"
                icono={AlertTriangle}
              >
                <ul className="divide-y divide-border">
                  {revision.sinPractica.map((s) => (
                    <li key={s.dni} className="px-4 py-2.5 text-sm">
                      {s.nombre}
                      <span className="ml-2 text-xs text-muted-foreground">{s.motivo}</span>
                    </li>
                  ))}
                </ul>
              </Grupo>

              <Grupo
                titulo="Ya estaban aprobados"
                cuenta={revision.yaAprobados.length}
                tono="neutro"
                icono={FileCheck2}
              >
                <ul className="divide-y divide-border">
                  {revision.yaAprobados.map((y) => (
                    <li key={y.dni} className="px-4 py-2.5 text-sm">
                      {y.nombre}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {new Date(y.aprobadoEl).toLocaleDateString('es-EC')}
                        {y.porTutor && ` · ${y.porTutor}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </Grupo>
            </div>

            {/* ── Confirmar ── */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-md border border-border bg-muted/40 px-5 py-4">
              <p className="text-sm">
                Se aprobarán <strong className="tabular-nums">{seleccion.size}</strong> de{' '}
                <span className="tabular-nums">{revision.listos.length}</span>
                {revision.tutorSugerido && <> a nombre de <strong>{revision.tutorSugerido.fullName}</strong></>}.
                <span className="ml-1 text-muted-foreground">Nada se escribe hasta que confirmes.</span>
              </p>
              <Button onClick={confirmar} disabled={seleccion.size === 0 || !revision.tutorSugerido || confirmando || soloLectura}>
                {confirmando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Confirmar aprobación
              </Button>
            </div>
          </section>
        )}

        {/* ── Historial ── */}
        <section className="mt-12">
          <h2 className="text-sm font-medium">Actas registradas</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            El archivo se conserva 30 días; la aprobación no caduca. Después basta el número del
            acta para volver a pedirla al sistema académico.
          </p>

          {actas.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No se ha registrado ninguna acta en {periodo ?? 'este período'}.
            </p>
          ) : (
            <Card className="mt-4 overflow-hidden">
              <ul className="divide-y divide-border">
                {actas.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                    <span className="font-medium">{a.tutor.fullName}</span>
                    <span className="text-muted-foreground">
                      {a.actaNumber ? `Acta ${a.actaNumber}` : 'Cédulas pegadas'}
                      {a.subject && ` · ${a.subject}`}
                    </span>
                    <Badge variant="outline">{a.academicPeriod}</Badge>
                    <Badge variant="success">
                      {a._count.approvedPractices} aprobado{a._count.approvedPractices === 1 ? '' : 's'}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(a.createdAt).toLocaleDateString('es-EC')}
                    </span>
                    {a.fileKey && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            const { data } = await api.get(`/completion-records/${a.id}/download`)
                            window.open(data.url, '_blank')
                          } catch (e: any) {
                            toast.error(e?.response?.data?.message || 'No se pudo abrir el acta')
                          }
                        }}
                      >
                        Ver acta
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </PageContainer>
    </RoleGate>
  )
}
