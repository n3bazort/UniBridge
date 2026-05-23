'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { 
  Briefcase, 
  Users, 
  Building2, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  FileText,
  UploadCloud,
  UserPlus
} from 'lucide-react'
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'

export default function OverviewPage() {
  const user = useAuthStore((state) => state.user)
  const [data, setData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/practices/dashboard-stats')
        setData(res.data)
      } catch (error) {
        console.error('Error fetching stats:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchStats()
  }, [])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-8 min-h-screen bg-[#fafafa]">
        <div className="h-8 w-48 bg-slate-200 animate-pulse rounded-md"></div>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 bg-slate-200 animate-pulse rounded-[14px]"></div>
          ))}
        </div>
      </div>
    )
  }

  // Mapeo de colores para el Donut Chart de Estados
  const statusColors: Record<string, string> = {
    'IN_PROGRESS': '#3b82f6', // azul
    'COMPLETED': '#10b981', // verde
    'PENDING': '#eab308', // amarillo
    'DELAYED': '#f97316', // naranja
    'REJECTED': '#ef4444' // rojo
  };

  const statusLabels: Record<string, string> = {
    'IN_PROGRESS': 'En progreso',
    'COMPLETED': 'Completadas',
    'PENDING': 'Pendientes',
    'DELAYED': 'Retrasadas',
    'REJECTED': 'Rechazadas'
  };

  const { kpis, charts, operational } = data || {};

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <div className="flex flex-col w-full min-h-[calc(100vh-72px)] bg-[#fafafa] pt-8 pb-12 px-6 lg:px-10">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Resumen General</h1>
            <p className="text-sm text-slate-500 mt-1">Monitoreo ejecutivo de prácticas preprofesionales</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="h-9 px-4 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm">
              Exportar Reporte
            </button>
            <button className="h-9 px-4 text-sm font-medium bg-[#1a1a1a] text-white rounded-lg hover:bg-[#333333] transition-colors shadow-sm">
              Nueva Práctica
            </button>
          </div>
        </div>

        {/* 6 KPIs - Fila 1 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <KpiCard 
            title="Prácticas Activas" 
            value={kpis?.activePractices || 0} 
            icon={<Briefcase className="w-4 h-4 text-blue-600" />} 
            iconBg="bg-blue-50"
            trend="+12% vs mes ant."
            trendColor="text-emerald-600"
          />
          <KpiCard 
            title="Estudiantes Activos" 
            value={kpis?.activeStudents || 0} 
            icon={<Users className="w-4 h-4 text-indigo-600" />} 
            iconBg="bg-indigo-50"
          />
          <KpiCard 
            title="Empresas Vinculadas" 
            value={kpis?.totalCompanies || 0} 
            icon={<Building2 className="w-4 h-4 text-purple-600" />} 
            iconBg="bg-purple-50"
          />
          <KpiCard 
            title="Horas Acumuladas" 
            value={`${kpis?.totalHours || 0}h`}
            icon={<Clock className="w-4 h-4 text-emerald-600" />} 
            iconBg="bg-emerald-50"
          />
          <KpiCard 
            title="Finalización" 
            value={`${kpis?.completionRate || 0}%`}
            icon={<CheckCircle2 className="w-4 h-4 text-teal-600" />} 
            iconBg="bg-teal-50"
          />
          <KpiCard 
            title="Alertas Activas" 
            value={kpis?.activeAlerts || 0} 
            icon={<AlertTriangle className="w-4 h-4 text-rose-600" />} 
            iconBg="bg-rose-50"
            trend={kpis?.activeAlerts > 0 ? "Requiere atención" : "Todo en orden"}
            trendColor={kpis?.activeAlerts > 0 ? "text-rose-600" : "text-slate-500"}
          />
        </div>

        {/* Gráficos - Fila 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          
          {/* Donut Chart */}
          <div className="bg-white rounded-[14px] border border-slate-100 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <h3 className="text-sm font-medium text-slate-800 mb-6">Estado de las Prácticas</h3>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={charts?.statusDistribution || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="count"
                    stroke="none"
                  >
                    {(charts?.statusDistribution || []).map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={statusColors[entry.status] || '#cbd5e1'} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value: number, name: string, props: any) => [value, statusLabels[props.payload.status] || props.payload.status]}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-2">
              {(charts?.statusDistribution || []).map((entry: any, i: number) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[entry.status] || '#cbd5e1' }} />
                  {statusLabels[entry.status] || entry.status}
                </div>
              ))}
            </div>
          </div>

          {/* Vertical Bar Chart */}
          <div className="bg-white rounded-[14px] border border-slate-100 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <h3 className="text-sm font-medium text-slate-800 mb-6">Prácticas por Periodo Académico</h3>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts?.periodDistribution || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <RechartsTooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Horizontal Bar Chart */}
          <div className="bg-white rounded-[14px] border border-slate-100 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <h3 className="text-sm font-medium text-slate-800 mb-6">Top 5 Carreras</h3>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts?.careerDistribution || []} layout="vertical" margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} width={90} />
                  <RechartsTooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Tarjetas Operacionales - Fila 3 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="bg-white rounded-[14px] border border-slate-100 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col">
            <h3 className="text-sm font-medium text-slate-800 mb-5">Actividad Reciente</h3>
            <div className="flex-1 flex flex-col gap-4">
              <ActivityItem icon={<FileText />} title="Documento generado" desc="Evaluación final de Josue Panta" time="Hace 10 min" iconColor="text-blue-500" />
              <ActivityItem icon={<UploadCloud />} title="Importación exitosa" desc="Nómina 2024-1 subida (45 registros)" time="Hace 2 horas" iconColor="text-emerald-500" />
              <ActivityItem icon={<UserPlus />} title="Estudiante asignado" desc="Erick Rodriguez asignado a Altura S.A." time="Ayer 14:30" iconColor="text-purple-500" />
            </div>
            <button className="mt-4 text-xs font-medium text-slate-500 hover:text-slate-800 text-left transition-colors">
              Ver todo el registro →
            </button>
          </div>

          <div className="bg-white rounded-[14px] border border-slate-100 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col">
            <h3 className="text-sm font-medium text-slate-800 mb-5 flex justify-between items-center">
              Alertas y Pendientes
              <span className="bg-rose-100 text-rose-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{kpis?.activeAlerts || 0}</span>
            </h3>
            <div className="flex-1 flex flex-col gap-3">
              {kpis?.activeAlerts > 0 ? (
                <>
                  <div className="flex items-start gap-3 p-3 bg-rose-50/50 rounded-lg border border-rose-100/50">
                    <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">Prácticas retrasadas</p>
                      <p className="text-xs text-slate-500 mt-0.5">Existen prácticas marcadas como retrasadas que requieren revisión del coordinador.</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center flex-col text-slate-400">
                  <CheckCircle2 className="w-8 h-8 mb-2 text-emerald-400 opacity-50" />
                  <p className="text-sm">No hay alertas críticas</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-[14px] border border-slate-100 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col">
            <h3 className="text-sm font-medium text-slate-800 mb-5">Top Empresas Receptoras</h3>
            <div className="flex-1 flex flex-col gap-4">
              {operational?.topCompanies?.slice(0,4).map((company: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-[10px] font-semibold text-slate-500">
                      #{idx + 1}
                    </div>
                    <p className="text-sm font-medium text-slate-700 truncate max-w-[150px]">{company.name}</p>
                  </div>
                  <span className="text-sm font-medium text-slate-900">{company.count} est.</span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </RoleGate>
  )
}

function KpiCard({ title, value, icon, iconBg, trend, trendColor }: any) {
  return (
    <div className="bg-white rounded-[14px] border border-slate-100 p-5 flex flex-col shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-md">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2 rounded-xl ${iconBg}`}>{icon}</div>
      </div>
      <div>
        <h4 className="text-[13px] font-medium text-slate-500 mb-1">{title}</h4>
        <div className="text-2xl font-bold text-slate-900 tracking-tight">{value}</div>
        {trend && (
          <p className={`text-xs mt-2 font-medium ${trendColor}`}>{trend}</p>
        )}
      </div>
    </div>
  )
}

function ActivityItem({ icon, title, desc, time, iconColor }: any) {
  return (
    <div className="flex gap-3 items-start">
      <div className={`p-1.5 rounded-full bg-slate-50 border border-slate-100 ${iconColor} mt-0.5`}>
        <div className="w-3.5 h-3.5">{icon}</div>
      </div>
      <div>
        <p className="text-[13px] font-medium text-slate-800">{title}</p>
        <p className="text-[12px] text-slate-500 mt-0.5">{desc}</p>
        <p className="text-[11px] text-slate-400 mt-1">{time}</p>
      </div>
    </div>
  )
}
