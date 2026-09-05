'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { api } from '@/lib/axios'
import { useRouter } from 'next/navigation'
import { RoleGate } from '@/components/shared/role-gate'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { 
  Briefcase, 
  Building2, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  FileText,
  UploadCloud,
  UserPlus,
  Download,
  Loader2
} from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { usePeriodStore } from '@/store/period'
import { RecorridoExpediente } from '@/components/dashboard/recorrido-expediente'

/** Un punto de color por tipo de suceso: lo importante se distingue sin leer. */
const TONO_ACTIVIDAD: Record<string, string> = {
  alta: 'bg-primary',
  documento: 'bg-info',
  firma: 'bg-success',
  acta: 'bg-success',
  anulacion: 'bg-destructive',
  baja: 'bg-destructive',
  traslado: 'bg-warning',
  periodo: 'bg-muted-foreground',
  cambio: 'bg-muted-foreground',
}

export default function OverviewPage() {
  const user = useAuthStore((state) => state.user)
  const router = useRouter()
  const { selectedPeriod } = usePeriodStore()
  const [data, setData] = useState<any>(null)
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [hayMasActividad, setHayMasActividad] = useState(false)
  const [offsetActividad, setOffsetActividad] = useState(0)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)

  // Acotado al periodo del selector global — mismo criterio que
  // prácticas/certificados: solo vuelve a pedir cuando cambia selectedPeriod,
  // en vez de agregar TODAS las prácticas desde que existe el sistema cada
  // vez que alguien abre el resumen ejecutivo.
  useEffect(() => {
    if (!selectedPeriod) return
    let cancelled = false
    const fetchStats = async () => {
      setIsLoading(true)
      try {
        const [statsRes, activityRes] = await Promise.all([
          api.get('/practices/dashboard-stats', { params: { academicPeriod: selectedPeriod } }),
          api.get('/audit-logs/feed', { params: { academicPeriod: selectedPeriod, limit: 10 } })
            .catch(() => ({ data: { items: [], hasMore: false, nextOffset: 0 } })),
        ])
        if (cancelled) return
        setData(statsRes.data)
        setRecentActivity(activityRes.data?.items || [])
        setHayMasActividad(!!activityRes.data?.hasMore)
        setOffsetActividad(activityRes.data?.nextOffset ?? 0)
      } catch (error) {
        console.error('Error fetching stats:', error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    fetchStats()
    return () => { cancelled = true }
  }, [selectedPeriod])

  /** Trae el siguiente tramo de la bitácora sin recargar el resto del panel. */
  const cargarMasActividad = async () => {
    setCargandoMas(true)
    try {
      const { data } = await api.get('/audit-logs/feed', {
        params: { academicPeriod: selectedPeriod, limit: 10, offset: offsetActividad },
      })
      setRecentActivity((prev) => [...prev, ...(data?.items || [])])
      setHayMasActividad(!!data?.hasMore)
      setOffsetActividad(data?.nextOffset ?? offsetActividad)
    } catch {
      toast.error('No se pudo cargar más actividad')
    } finally {
      setCargandoMas(false)
    }
  }

  /** Descarga el reporte ejecutivo en Excel (KPIs, gráficos nativos y detalle). */
  const handleExportReport = async () => {
    setIsExporting(true)
    try {
      const res = await api.get('/reports/dashboard.xlsx', { responseType: 'blob' })
      const disposition = res.headers['content-disposition'] || ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] || `UniBridge_Reporte_${new Date().toISOString().split('T')[0]}.xlsx`

      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Reporte descargado: KPIs, gráficos y detalle por hoja')
    } catch (e) {
      console.error('Error exportando reporte', e)
      toast.error('No se pudo generar el reporte')
    } finally {
      setIsExporting(false)
    }
  }

  if (isLoading) {
    return (
      // El esqueleto usa el mismo contenedor y la misma rejilla que la vista
      // cargada. Antes tenía su propio p-8, su propio fondo y SEIS tarjetas
      // frente a los cinco KPI reales: al terminar de cargar, el fondo, los
      // márgenes y el número de columnas cambiaban de golpe.
      <PageContainer variant="wide" className="flex flex-col gap-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded-md"></div>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-md"></div>
          ))}
        </div>
      </PageContainer>
    )
  }

  // Mapeo de colores para el Donut Chart de Estados
  // Mismos nombres que en la lista de prácticas, para que el resumen y el
  // detalle no llamen distinto a lo mismo.
  const statusColors: Record<string, string> = {
    'PENDING': '#94a3b8', // gris: aún sin ningún documento
    'IN_PROGRESS': '#3b82f6', // azul
    'COMPLETED': '#10b981', // verde
    'CANCELED': '#cbd5e1',
    'REJECTED': '#ef4444' // rojo
  };

  const statusLabels: Record<string, string> = {
    'PENDING': 'No iniciadas',
    'IN_PROGRESS': 'En proceso',
    'COMPLETED': 'Finalizadas',
    'CANCELED': 'Canceladas',
    'REJECTED': 'Rechazadas'
  };

  const { kpis, charts, operational } = data || {};

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <div className="w-full flex-1">
        <PageContainer variant="wide" className="flex flex-col">

          {/* El título ya no se escribe aquí: viene de PAGE_TITLES, la misma
              fuente que lee el topbar. Antes esta pantalla se llamaba
              «Dashboard Ejecutivo» abajo y «Resumen General» arriba. */}
          <PageHeader
            className="mb-8 pb-6 border-b border-border/80"
            description="Monitoreo centralizado de prácticas preprofesionales y convenios."
            actions={
              <>
                <button
                  onClick={handleExportReport}
                  disabled={isExporting}
                  className="h-9 px-3.5 flex items-center gap-2 text-xs font-semibold bg-card border border-border text-foreground rounded-md hover:bg-muted/60 transition-all disabled:opacity-60"
                >
                  {isExporting ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generando...</>
                  ) : (
                    <><Download className="w-3.5 h-3.5" /> Exportar reporte</>
                  )}
                </button>
                <button
                  onClick={() => router.push('/practices')}
                  className="h-9 px-4 text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-all active:scale-[0.98]"
                >
                  Nueva práctica
                </button>
              </>
            }
          />

          {/* 5 KPIs Bento Row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-8">
            {/* Cuántos casos hay en el periodo, y cuántos ya arrancaron el
                papeleo. Antes estas dos tarjetas mostraban el mismo número por
                caminos distintos («prácticas con documento» y «estudiantes con
                documento»), así que una de las cinco no aportaba nada. */}
            <KpiCard 
              title="Prácticas Activas" 
              value={kpis?.periodPractices || 0} 
              icon={<Briefcase className="w-4 h-4 text-blue-700" />} 
              iconBg="bg-[#E1F3FE]"
            />
            <KpiCard 
              title="Trámites Iniciados" 
              value={kpis?.startedProcedures || 0} 
              icon={<FileText className="w-4 h-4 text-indigo-700" />} 
              iconBg="bg-indigo-50"
            />
            <KpiCard 
              title="Empresas Vinculadas" 
              value={kpis?.totalCompanies || 0} 
              icon={<Building2 className="w-4 h-4 text-purple-700" />} 
              iconBg="bg-purple-50"
            />
            <KpiCard 
              title="Tasa de Finalización" 
              value={`${kpis?.completionRate || 0}%`}
              icon={<CheckCircle2 className="w-4 h-4 text-[#346538]" />} 
              iconBg="bg-[#EDF3EC]"
            />
            <KpiCard 
              title="Alertas Activas" 
              value={kpis?.activeAlerts || 0} 
              icon={<AlertTriangle className="w-4 h-4 text-[#9F2F2D]" />} 
              iconBg="bg-[#FDEBEC]"
              trend={kpis?.activeAlerts > 0 ? "Requiere atención" : "Sin novedades"}
              trendBadge={kpis?.activeAlerts > 0 ? "danger" : "success"}
            />
          </div>

          {/* Charts Bento Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
            
            {/* Donut Chart */}
            <div className="bg-white dark:bg-card rounded-xl border border-border p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                  Estado de Prácticas
                </h3>
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">
                  Distribución
                </span>
              </div>
              <div className="h-[210px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={charts?.statusDistribution || []}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="count"
                      stroke="none"
                    >
                      {(charts?.statusDistribution || []).map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={statusColors[entry.status] || '#cbd5e1'} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value: any, name: any, props: any) => [value, statusLabels[props.payload.status] || props.payload.status]}
                      contentStyle={{ borderRadius: '6px', border: '1px solid #EAEAEA', backgroundColor: '#FFFFFF', fontSize: '12px', boxShadow: 'none' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-x-3.5 gap-y-1.5 pt-3 border-t border-border/60">
                {(charts?.statusDistribution || []).map((entry: any, i: number) => (
                  <div key={i} className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[entry.status] || '#cbd5e1' }} />
                    {statusLabels[entry.status] || entry.status}
                  </div>
                ))}
              </div>
            </div>

            {/* Vertical Bar Chart */}
            <div className="bg-white dark:bg-card rounded-xl border border-border p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                  Prácticas por Periodo
                </h3>
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">
                  Histórico
                </span>
              </div>
              <div className="h-[230px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts?.periodDistribution || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                    <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#787774' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#787774' }} />
                    <RechartsTooltip 
                      cursor={{ fill: '#F7F6F3' }}
                      contentStyle={{ borderRadius: '6px', border: '1px solid #EAEAEA', backgroundColor: '#FFFFFF', fontSize: '12px', boxShadow: 'none' }}
                    />
                    <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Horizontal Bar Chart */}
            <div className="bg-white dark:bg-card rounded-xl border border-border p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                  Top 5 Carreras
                </h3>
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">
                  Demanda
                </span>
              </div>
              <div className="h-[230px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts?.careerDistribution || []} layout="vertical" margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#EAEAEA" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#787774' }} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10.5, fill: '#787774' }} width={95} />
                    <RechartsTooltip 
                      cursor={{ fill: '#F7F6F3' }}
                      contentStyle={{ borderRadius: '6px', border: '1px solid #EAEAEA', backgroundColor: '#FFFFFF', fontSize: '12px', boxShadow: 'none' }}
                    />
                    <Bar dataKey="count" fill="#7c3aed" radius={[0, 4, 4, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

          {/* Operational Bento Cards */}
          {/* `items-start`: cada tarjeta mide lo que su contenido pide. Antes
              todas se estiraban a la altura de la más alta, así que la de
              «0 pendientes» ocupaba lo mismo que veinte líneas de actividad. */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">

            {/* Actividad Reciente */}
            <div className="bg-white dark:bg-card rounded-xl border border-border p-5 flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/60">
                <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                  Actividad Reciente
                </h3>
                {/* Aquí había un «Ver todo →» que llevaba a Configuraciones,
                    donde no hay ninguna bitácora. Un enlace que promete algo y
                    lleva a otra parte enseña a desconfiar del resto. */}
              </div>
              {/* Cada línea dice QUÉ pasó y QUIÉN lo hizo. Antes decía
                  «Actualización de estado (Ref: a3f9b201)»: el nombre de una
                  tabla y ocho caracteres de un UUID que no se pueden buscar en
                  ninguna parte de la app. */}
              {/* La lista crece HACIA DENTRO, no hacia abajo: con un alto tope
                  y su propio desplazamiento, pulsar «Cargar más» ya no estira
                  la tarjeta, ni arrastra a las de al lado, ni alarga la página.
                  El botón queda fijo al pie, siempre alcanzable. */}
              <div className="flex max-h-[26rem] flex-col gap-3.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {recentActivity.length > 0 ? (
                  <>
                    {recentActivity.map((ev: any) => (
                      <ActivityItem
                        key={ev.id}
                        icon={<span className={cn('block h-2 w-2 rounded-full', TONO_ACTIVIDAD[ev.tipo] ?? 'bg-muted-foreground')} />}
                        title={ev.texto}
                        desc={ev.autor}
                        time={new Date(ev.fecha).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}
                        veces={ev.repeticiones}
                      />
                    ))}
                  </>
                ) : (
                  <ActivityItem
                    icon={<span className="block h-2 w-2 rounded-full bg-muted-foreground/40" />}
                    title="Sin actividad en este período"
                    desc="Lo que se registre aquí llevará el nombre de quien lo hizo"
                    time="—"
                  />
                )}
              </div>

              {/* Fuera del contenedor con desplazamiento: el botón no se va
                  hacia abajo con la lista. */}
              {hayMasActividad && (
                <button
                  onClick={cargarMasActividad}
                  disabled={cargandoMas}
                  className="mt-3 shrink-0 rounded-md border border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
                >
                  {cargandoMas ? 'Cargando…' : 'Cargar más'}
                </button>
              )}
            </div>

            {/* Alertas y Pendientes */}
            <div className="flex flex-col gap-4">
            <div className="bg-white dark:bg-card rounded-xl border border-border p-5 flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/60">
                <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                  Alertas y Atenciones
                </h3>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase",
                  kpis?.activeAlerts > 0 ? "bg-[#FDEBEC] text-[#9F2F2D]" : "bg-[#EDF3EC] text-[#346538]"
                )}>
                  {kpis?.activeAlerts || 0} pendientes
                </span>
              </div>
              <div className="flex-1 flex flex-col justify-center">
                {kpis?.activeAlerts > 0 ? (
                  <div className="flex items-start gap-3 p-3.5 rounded-lg border border-[#FDEBEC] bg-[#FDEBEC]/30">
                    <AlertTriangle className="w-4 h-4 text-[#9F2F2D] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-foreground">Prácticas rechazadas o canceladas</p>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                        Requieren intervención del coordinador: fueron observadas por la empresa o invalidadas.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                    <CheckCircle2 className="w-7 h-7 mb-2 text-[#346538] opacity-70" />
                    <p className="text-xs font-semibold text-foreground">Sin alertas críticas</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Todas las prácticas activas avanzan con normalidad</p>
                  </div>
                )}
              </div>
            </div>

            {/* El recorrido del expediente. Ocupa el hueco que dejaba la
                tarjeta de alertas cuando no hay ninguna —que es lo normal— y
                no es un adorno: es el circuito real del sistema, dibujado. */}
            <div className="rounded-xl border border-border bg-white p-5 dark:bg-card">
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Recorrido del expediente
              </h3>
              <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                El certificado no se emite sin el acta del docente.
              </p>
              <RecorridoExpediente />
            </div>
            </div>

            {/* Top Empresas Receptoras */}
            <div className="bg-white dark:bg-card rounded-xl border border-border p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/60">
                <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                  Top Empresas Receptoras
                </h3>
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">
                  Ranking
                </span>
              </div>
              <div className="flex-1 flex flex-col gap-3">
                {operational?.topCompanies?.slice(0, 4).map((company: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-[10px] font-bold text-muted-foreground bg-[#F7F6F3] dark:bg-muted border border-border rounded px-1.5 py-0.5 shrink-0">
                        #{idx + 1}
                      </span>
                      <p className="font-medium text-foreground truncate max-w-[170px]">{company.name}</p>
                    </div>
                    <span className="font-mono text-xs font-semibold text-foreground shrink-0">
                      {company.count} est.
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </PageContainer>
      </div>
    </RoleGate>
  )
}

function KpiCard({ title, value, icon, iconBg, trend, trendBadge }: any) {
  return (
    <div className="bg-white dark:bg-card rounded-xl border border-border p-4 flex flex-col justify-between transition-all hover:border-muted-foreground/30">
      <div className="flex items-center justify-between mb-3">
        <div className={cn("p-2 rounded-lg border border-border/50", iconBg)}>
          {icon}
        </div>
        {trend && (
          <span className={cn(
            "text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
            trendBadge === "danger" ? "bg-[#FDEBEC] text-[#9F2F2D]" : "bg-[#EDF3EC] text-[#346538]"
          )}>
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">{title}</p>
        <p className="text-2xl font-bold tracking-tight text-foreground font-sans">{value}</p>
      </div>
    </div>
  )
}

function ActivityItem({ icon, title, desc, time, veces }: any) {
  return (
    <div className="flex items-start gap-3 text-xs">
      <div className="mt-1 shrink-0 rounded-md border border-border bg-muted p-1.5">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          {/* El texto NO se recorta: si una línea dice «Reasignó a X · ahora en
              Y», cortarla justo antes del destino la deja sin lo que importa. */}
          <p className="min-w-0 flex-1 font-semibold leading-snug text-foreground">{title}</p>
          {/* Un mismo acto sobre un oficio grupal deja una entrada por
              estudiante. Se muestra una vez, diciendo a cuántos abarcó. */}
          {veces > 1 && (
            <span className="mt-px shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
              ×{veces}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
          {desc} · <span className="tabular-nums">{time}</span>
        </p>
      </div>
    </div>
  )
}
