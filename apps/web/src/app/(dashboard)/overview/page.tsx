'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { Users, Clock, Building2, UserCheck, BookOpen, BarChart3, TrendingUp } from 'lucide-react'

export default function OverviewPage() {
  const user = useAuthStore((state) => state.user)
  const [stats, setStats] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await api.get('/practices/dashboard-stats')
        setStats(data)
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
      <div className="flex flex-col gap-6 p-4">
        <div className="h-10 w-48 bg-slate-100 animate-pulse rounded"></div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-slate-100 animate-pulse rounded-xl border"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Dashboard de Gestión
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Análisis y visualización general de prácticas preprofesionales – ULEAM
            </p>
          </div>
        </div>
        
        {/* Métricas Principales (KPIs) */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-white p-6 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between pb-2">
              <h3 className="tracking-tight text-sm font-medium text-slate-600">Total Estudiantes</h3>
              <div className="p-2 bg-blue-50 rounded-lg"><Users className="h-5 w-5 text-blue-600" /></div>
            </div>
            <div>
              <div className="text-3xl font-bold text-slate-900">{stats?.totalStudents || 0}</div>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-emerald-500" /> Registrados activos
              </p>
            </div>
          </div>
          
          <div className="rounded-xl border bg-white p-6 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between pb-2">
              <h3 className="tracking-tight text-sm font-medium text-slate-600">Promedio Horas</h3>
              <div className="p-2 bg-emerald-50 rounded-lg"><Clock className="h-5 w-5 text-emerald-600" /></div>
            </div>
            <div>
              <div className="text-3xl font-bold text-slate-900">{stats?.avgHours || 0} <span className="text-base font-normal text-slate-500">hrs</span></div>
              <p className="text-xs text-slate-500 mt-1">Asignadas por estudiante</p>
            </div>
          </div>
          
          <div className="rounded-xl border bg-white p-6 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between pb-2">
              <h3 className="tracking-tight text-sm font-medium text-slate-600">Empresas Receptoras</h3>
              <div className="p-2 bg-purple-50 rounded-lg"><Building2 className="h-5 w-5 text-purple-600" /></div>
            </div>
            <div>
              <div className="text-3xl font-bold text-slate-900">{stats?.totalCompanies || 0}</div>
              <p className="text-xs text-slate-500 mt-1">Convenios activos</p>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-6 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between pb-2">
              <h3 className="tracking-tight text-sm font-medium text-slate-600">Tutores Académicos</h3>
              <div className="p-2 bg-amber-50 rounded-lg"><UserCheck className="h-5 w-5 text-amber-600" /></div>
            </div>
            <div>
              <div className="text-3xl font-bold text-slate-900">{stats?.totalTutors || 0}</div>
              <p className="text-xs text-slate-500 mt-1">Docentes asignados</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Distribución por Tipo de Práctica */}
          <div className="rounded-xl border bg-white shadow-sm flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-slate-800">Distribución por Tipo de Práctica</h3>
            </div>
            <div className="p-6 flex-1">
              <div className="space-y-6">
                {stats?.distributionByLevel?.length > 0 ? stats.distributionByLevel.map((item: any, idx: number) => {
                  const maxStudents = Math.max(...stats.distributionByLevel.map((d: any) => d.studentCount));
                  const percentage = Math.round((item.studentCount / maxStudents) * 100);
                  
                  return (
                    <div key={idx} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">{item.practiceLevel || 'Sin Especificar'}</span>
                        <span className="font-bold text-slate-900">{item.studentCount} est.</span>
                      </div>
                      <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-sm text-slate-500 italic text-center py-4">No hay datos suficientes</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {/* Carga por Empresa Receptora */}
            <div className="rounded-xl border bg-white shadow-sm flex flex-col flex-1">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-purple-600" />
                  <h3 className="font-semibold text-sm text-slate-800">Top 5 Empresas Receptoras</h3>
                </div>
              </div>
              <div className="p-4 space-y-4">
                {stats?.loadByCompany?.slice(0, 5).map((company: any, idx: number) => {
                  const maxLoad = Math.max(...stats.loadByCompany.map((c: any) => c.studentCount));
                  const width = Math.max((company.studentCount / maxLoad) * 100, 5); // min 5%
                  
                  return (
                    <div key={idx} className="flex items-center gap-4">
                      <div className="w-8 text-center text-xs font-bold text-slate-400">#{idx + 1}</div>
                      <div className="flex-1 space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-slate-700 truncate max-w-[200px]">{company.companyName}</span>
                          <span className="font-bold text-purple-700">{company.studentCount}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Carga por Tutor Académico */}
            <div className="rounded-xl border bg-white shadow-sm flex flex-col flex-1">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-amber-600" />
                  <h3 className="font-semibold text-sm text-slate-800">Top 5 Tutores (Carga Académica)</h3>
                </div>
              </div>
              <div className="p-4 space-y-4">
                {stats?.loadByTutor?.slice(0, 5).map((tutor: any, idx: number) => {
                  const maxLoad = Math.max(...stats.loadByTutor.map((t: any) => t.studentCount));
                  const width = Math.max((tutor.studentCount / maxLoad) * 100, 5);
                  
                  return (
                    <div key={idx} className="flex items-center gap-4">
                      <div className="w-8 text-center text-xs font-bold text-slate-400">#{idx + 1}</div>
                      <div className="flex-1 space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-slate-700 truncate max-w-[200px]">{tutor.tutorName}</span>
                          <span className="font-bold text-amber-700">{tutor.studentCount}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </RoleGate>
  )
}
