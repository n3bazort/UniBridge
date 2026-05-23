'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { BookOpen, Building2, Clock, CheckCircle2, FileText, Download } from 'lucide-react'

export default function StudentDashboardPage() {
  const { data: student, isLoading } = useQuery({
    queryKey: ['student-profile'],
    queryFn: async () => {
      const res = await api.get('/students/me/profile')
      return res.data
    }
  })

  if (isLoading) {
    return (
      <RoleGate allowedRoles={['STUDENT']}>
        <div className="flex h-[calc(100vh-80px)] items-center justify-center">
          <span className="animate-pulse text-slate-500 font-medium">Cargando tu perfil...</span>
        </div>
      </RoleGate>
    )
  }

  if (!student) {
    return (
      <RoleGate allowedRoles={['STUDENT']}>
        <div className="p-8 text-center text-red-500">Error al cargar perfil</div>
      </RoleGate>
    )
  }

  // Obtenemos la última práctica activa
  const currentPractice = student.practices?.[0]
  const company = currentPractice?.company

  // Archivos generados (Certificados PDF)
  const certificates = student.generatedDocs?.filter((doc: any) => doc.template?.type === 'PDF') || []

  return (
    <RoleGate allowedRoles={['STUDENT']}>
      <div className="flex flex-col gap-6 max-w-5xl mx-auto py-6">
        
        {/* Header de Bienvenida */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <h1 className="text-3xl font-bold mb-2">¡Hola, {student.firstName}!</h1>
            <p className="text-blue-100 opacity-90 max-w-2xl">
              Bienvenido a tu panel de estudiante. Aquí podrás dar seguimiento a tus prácticas pre-profesionales, 
              revisar tus asignaciones y descargar tus certificados oficiales.
            </p>
          </div>
          <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4">
            <BookOpen className="w-64 h-64" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Tarjeta Principal de Práctica */}
          <div className="md:col-span-2 flex flex-col gap-6">
            <div className="bg-white rounded-2xl border shadow-sm p-6">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-6">
                <Building2 className="w-5 h-5 text-indigo-500" />
                Estado de tu Práctica Actual
              </h2>
              
              {currentPractice ? (
                <div className="space-y-6">
                  {/* Status Banner */}
                  <div className={`p-4 rounded-xl border flex items-start gap-4 ${
                    currentPractice.status === 'COMPLETED' 
                      ? 'bg-green-50 border-green-200 text-green-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}>
                    <CheckCircle2 className={`w-6 h-6 mt-0.5 ${currentPractice.status === 'COMPLETED' ? 'text-green-600' : 'text-amber-600'}`} />
                    <div>
                      <h3 className="font-semibold text-lg">
                        {currentPractice.status === 'COMPLETED' ? 'Práctica Finalizada' : 'Práctica en Progreso'}
                      </h3>
                      <p className="text-sm opacity-90 mt-1">
                        {currentPractice.status === 'COMPLETED' 
                          ? 'Has completado exitosamente todas tus horas requeridas. Tu certificado ya puede ser emitido.' 
                          : 'Aún te encuentras realizando tus horas reglamentarias. Asegúrate de cumplir con tus actividades asignadas.'}
                      </p>
                    </div>
                  </div>

                  {/* Detalles Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Empresa Asignada</p>
                      <p className="font-bold text-slate-700">{company?.name || 'Pendiente de asignación'}</p>
                      {company && (
                        <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                          <span className="truncate">👤 {company.contactName}</span>
                        </p>
                      )}
                    </div>
                    
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Tutor Académico</p>
                      <p className="font-bold text-slate-700">{currentPractice.tutorName || 'Aún no asignado'}</p>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Período Académico</p>
                      <p className="font-bold text-slate-700">{currentPractice.academicPeriod}</p>
                    </div>

                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider mb-1">Horas Registradas</p>
                      <p className="font-bold text-2xl text-blue-700">{currentPractice.totalHours} <span className="text-sm font-medium text-blue-600">hrs</span></p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Clock className="w-6 h-6 text-slate-400" />
                  </div>
                  <h3 className="font-medium text-slate-900 mb-1">Sin Práctica Activa</h3>
                  <p className="text-sm text-slate-500">Aún no se ha registrado ninguna práctica pre-profesional en tu perfil. Contacta a coordinación.</p>
                </div>
              )}
            </div>
          </div>

          {/* Tarjeta de Documentos */}
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-2xl border shadow-sm p-6 sticky top-6">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-6">
                <FileText className="w-5 h-5 text-indigo-500" />
                Mis Certificados
              </h2>

              {certificates.length > 0 ? (
                <div className="space-y-3">
                  {certificates.map((cert: any) => (
                    <div key={cert.id} className="group p-3 bg-slate-50 rounded-xl border hover:border-indigo-200 hover:shadow-sm transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-700 truncate">{cert.template?.name || 'Certificado Oficial'}</p>
                          <p className="text-xs text-slate-500 mt-1">Generado: {new Date(cert.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => window.open(process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') + cert.fileUrl, '_blank')}
                        className="mt-3 w-full flex items-center justify-center gap-2 bg-white border border-slate-200 text-indigo-600 text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors"
                      >
                        <Download className="w-4 h-4" /> Descargar PDF
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 px-4">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-600">No hay certificados</p>
                  <p className="text-xs text-slate-400 mt-1">Los certificados se habilitarán cuando apruebes tus horas.</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </RoleGate>
  )
}
