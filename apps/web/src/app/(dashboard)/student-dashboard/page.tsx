'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { 
  BookOpen, 
  Building2, 
  Clock, 
  CheckCircle2, 
  FileText, 
  Download, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar, 
  Lock, 
  FileCheck,
  ChevronRight
} from 'lucide-react'

export default function StudentDashboardPage() {
  const { data: student, isLoading } = useQuery({
    queryKey: ['student-profile'],
    queryFn: async () => {
      const res = await api.get('/students/me/profile')
      return res.data
    }
  })

  // Descarga segura: el backend valida permisos y devuelve una URL prefirmada
  // de corta duración (el bucket de documentos es privado).
  const handleDownload = async (documentId: string) => {
    try {
      const res = await api.get(`/generated-documents/${documentId}/download`)
      window.open(res.data.url, '_blank')
    } catch {
      // el interceptor de axios ya gestiona 401; aquí solo evitamos romper la UI
      console.error('No se pudo obtener el enlace de descarga')
    }
  }

  // Etiquetas del estado de firma digital de cada documento (mismo estilo de badges del sistema)
  const SIGNATURE_LABEL: Record<string, { label: string; cls: string }> = {
    NONE: { label: '', cls: '' },
    IN_SIGNING: { label: 'En Firma', cls: 'text-amber-600 bg-amber-50 border-amber-100' },
    PARTIALLY_SIGNED: { label: 'Firma Decano ✓', cls: 'text-blue-600 bg-blue-50 border-blue-100' },
    SIGNED: { label: 'Firmado ✓', cls: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
    REJECTED: { label: 'En Corrección', cls: 'text-red-600 bg-red-50 border-red-100' },
  }

  if (isLoading) {
    return (
      <RoleGate allowedRoles={['STUDENT']}>
        <div className="flex h-[calc(100vh-80px)] items-center justify-center bg-[#f7f7f8]">
          <span className="animate-pulse text-slate-500 font-semibold text-[14px]">Cargando tu perfil del estudiante...</span>
        </div>
      </RoleGate>
    )
  }

  if (!student) {
    return (
      <RoleGate allowedRoles={['STUDENT']}>
        <div className="flex h-[calc(100vh-80px)] items-center justify-center bg-[#f7f7f8]">
          <div className="p-6 bg-white rounded-[18px] border border-red-100 shadow-soft text-center max-w-sm">
            <p className="text-red-500 font-semibold mb-2">Error al cargar perfil</p>
            <p className="text-[13px] text-slate-500">No pudimos cargar tus datos. Inténtalo de nuevo o ponte en contacto con coordinación.</p>
          </div>
        </div>
      </RoleGate>
    )
  }

  // Obtenemos la última práctica activa
  const currentPractice = student.practices?.[0]
  const company = currentPractice?.company

  // Horas reglamentarias estimadas (ej. 240)
  const requiredHours = 240
  const progressPercent = Math.min(100, Math.round(((currentPractice?.totalHours || 0) / requiredHours) * 100))

  // Documentos reales generados por el estudiante
  const generatedDocs: any[] = student.generatedDocs || []

  // Documentos esperados en el proceso de prácticas
  const expectedDocs = [
    { name: 'Plan de Práctica', templateName: 'Plan de Práctica', type: 'PDF' },
    { name: 'Carta de Presentación', templateName: 'Carta de Presentación', type: 'PDF' },
    { name: 'Informe Mensual', templateName: 'Informe', type: 'DOCX' },
    { name: 'Certificado de Prácticas', templateName: 'Certificado de Prácticas', type: 'PDF' }
  ]

  // Cruce de datos para generar la lista interactiva
  const allDocs = expectedDocs.map(expected => {
    const realDoc = generatedDocs.find(d => 
      d.template?.name?.toLowerCase().includes(expected.templateName.toLowerCase()) || 
      expected.name.toLowerCase().includes(d.template?.name?.toLowerCase() || '')
    )
    return {
      name: expected.name,
      type: realDoc?.template?.type || expected.type,
      id: realDoc?.id || null,
      signatureStatus: realDoc?.signatureStatus || 'NONE',
      isReal: !!realDoc,
      createdAt: realDoc?.createdAt ? new Date(realDoc.createdAt).toLocaleDateString() : null
    }
  })

  return (
    <RoleGate allowedRoles={['STUDENT']}>
      <div className="flex flex-col w-full min-h-[calc(100vh-72px)] bg-[#f7f7f8] pt-6 pb-12 px-4 lg:px-8">
        <div className="w-full max-w-[1400px] mx-auto flex flex-col gap-6">
          
          {/* Welcome Card Premium */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-[18px] p-8 text-white shadow-soft relative overflow-hidden border border-slate-800 transition-all duration-300 hover:shadow-md">
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <span className="text-[11px] font-bold tracking-widest text-[#6366f1] uppercase">Estudiante · Panel de Control</span>
                <h1 className="text-2xl font-extrabold mt-1.5 tracking-tight text-white">¡Bienvenido, {student.firstName} {student.lastName}!</h1>
                <p className="text-slate-300 text-[13px] mt-2 max-w-[650px] leading-relaxed">
                  Monitorea tus prácticas preprofesionales, visualiza los detalles de tu tutor y empresa asignada, y descarga tus certificados oficiales tan pronto sean aprobados.
                </p>
              </div>
              <span className={`px-4 py-2 rounded-full text-[12px] font-bold border shrink-0 transition-all shadow-sm
                ${currentPractice?.status === 'COMPLETED' 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                  : currentPractice?.status === 'IN_PROGRESS' 
                    ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' 
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                }
              `}>
                {currentPractice?.status === 'COMPLETED' ? '✓ Estado: Completado' : currentPractice?.status === 'IN_PROGRESS' ? '⚡ Estado: En Curso' : '⏱ Estado: Pendiente'}
              </span>
            </div>
            <div className="absolute right-0 top-0 opacity-5 transform translate-x-1/4 -translate-y-1/4 select-none pointer-events-none">
              <BookOpen className="w-64 h-64 text-white" />
            </div>
          </div>

          {/* Metric KPIs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* KPI 1: Horas Registradas */}
            <div className="bg-white rounded-[18px] border border-[#eef2f7] shadow-soft p-[20px] flex flex-col justify-between transition-all duration-300 hover:scale-[1.01] hover:shadow-md">
              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col">
                  <span className="text-[12px] font-semibold text-[#9ca3af] uppercase tracking-wider">Horas Acumuladas</span>
                  <span className="text-[28px] font-bold text-[#111827] mt-1 leading-none">{currentPractice?.totalHours || 0} <span className="text-[14px] font-medium text-[#6b7280]">/ {requiredHours} hrs</span></span>
                </div>
                <div className="w-[44px] h-[44px] bg-[#eff6ff] rounded-[12px] flex items-center justify-center text-[#2563eb]">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="w-full bg-[#f3f4f6] h-[6px] rounded-full overflow-hidden">
                  <div className="bg-[#2563eb] h-full rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                </div>
                <span className="text-[11px] text-[#6b7280] font-medium self-end">{progressPercent}% completado</span>
              </div>
            </div>

            {/* KPI 2: Tutor Asignado */}
            <div className="bg-white rounded-[18px] border border-[#eef2f7] shadow-soft p-[20px] flex items-center gap-4 transition-all duration-300 hover:scale-[1.01] hover:shadow-md">
              <img 
                src={`https://api.dicebear.com/9.x/notionists/svg?seed=${currentPractice?.tutorName || 'Tutor'}`} 
                className="w-[54px] h-[54px] rounded-full bg-[#f8fafc] border border-slate-100 shrink-0" 
                alt="Tutor Avatar"
              />
              <div className="flex flex-col overflow-hidden">
                <span className="text-[12px] font-semibold text-[#9ca3af] uppercase tracking-wider">Tutor Académico</span>
                <span className="text-[15px] font-bold text-[#111827] mt-1 truncate" title={currentPractice?.tutorName}>{currentPractice?.tutorName || 'Pendiente de asignación'}</span>
                <span className="text-[12px] text-[#6b7280] truncate">Docente ULEAM</span>
              </div>
            </div>

            {/* KPI 3: Empresa */}
            <div className="bg-white rounded-[18px] border border-[#eef2f7] shadow-soft p-[20px] flex items-center gap-4 transition-all duration-300 hover:scale-[1.01] hover:shadow-md">
              <div className="w-[54px] h-[54px] bg-[#f0fdf4] rounded-[16px] flex items-center justify-center text-[#16a34a] shrink-0 border border-[#bbf7d0]/30">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[12px] font-semibold text-[#9ca3af] uppercase tracking-wider">Empresa Asignada</span>
                <span className="text-[15px] font-bold text-[#111827] mt-1 truncate" title={company?.name}>{company?.name || 'Pendiente de asignación'}</span>
                <span className="text-[12px] text-[#6b7280] truncate">{company?.contactName || 'Sin supervisor'}</span>
              </div>
            </div>

          </div>

          {/* Main Content Layout */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            
            {/* Left Column: Details & Profile */}
            <div className="xl:col-span-2 flex flex-col gap-6">
              
              {/* Card: Detalle de mi Práctica */}
              <div className="bg-white rounded-[18px] border border-[#eef2f7] shadow-soft p-[24px] flex flex-col gap-[20px]">
                <h3 className="text-[14px] font-semibold text-[#111827] flex items-center gap-2 pb-3 border-b border-[#f3f4f6]">
                  <User className="w-4 h-4 text-indigo-500" />
                  Información Académica y Práctica
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-4">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Estudiante</span>
                    <span className="text-[13px] font-semibold text-[#374151] mt-1">{student.firstName} {student.lastName}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Identificación DNI</span>
                    <span className="text-[13px] font-semibold text-[#374151] mt-1">{student.dni}</span>
                  </div>
                  <div className="flex flex-col col-span-1 md:col-span-2">
                    <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Carrera</span>
                    <span className="text-[13px] font-semibold text-[#374151] mt-1">{student.program?.name || 'No disponible'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Facultad</span>
                    <span className="text-[13px] font-semibold text-[#374151] mt-1">{student.faculty?.name || 'No disponible'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Periodo Académico</span>
                    <span className="text-[13px] font-semibold text-[#374151] mt-1">{currentPractice?.academicPeriod || 'No disponible'}</span>
                  </div>
                </div>
              </div>

              {/* Card: Detalles de la Empresa */}
              <div className="bg-white rounded-[18px] border border-[#eef2f7] shadow-soft p-[24px] flex flex-col gap-[20px]">
                <h3 className="text-[14px] font-semibold text-[#111827] flex items-center gap-2 pb-3 border-b border-[#f3f4f6]">
                  <Building2 className="w-4 h-4 text-indigo-500" />
                  Información de la Institución / Empresa
                </h3>

                {company ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-[40px] h-[40px] rounded-lg bg-[#f0fdf4] flex items-center justify-center text-[#16a34a] shrink-0 border border-[#bbf7d0]/20">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[14px] font-bold text-[#111827]">{company.name}</span>
                        <span className="text-[12px] text-[#6b7280] mt-1 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#9ca3af]" />
                          {company.address || 'Ubicación no registrada'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="h-[1px] w-full bg-[#f3f4f6]" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-4">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Supervisor / Contacto</span>
                        <span className="text-[13px] font-semibold text-[#374151] mt-1 flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-[#9ca3af]" />
                          {company.contactName || 'No asignado'}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Teléfono de Contacto</span>
                        <span className="text-[13px] font-semibold text-[#374151] mt-1 flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-[#9ca3af]" />
                          {company.phone || 'No registrado'}
                        </span>
                      </div>
                      <div className="flex flex-col col-span-1 md:col-span-2">
                        <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Email Corporativo</span>
                        <span className="text-[13px] font-semibold text-[#374151] mt-1 flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-[#9ca3af]" />
                          {company.email || 'No registrado'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-[#9ca3af] text-[13px] font-medium border border-dashed border-[#eef2f7] rounded-xl bg-slate-50">
                    Aún no tienes una empresa asignada. Por favor, mantente al tanto del proceso de validación.
                  </div>
                )}
              </div>

            </div>

            {/* Right Column: Documents Checklist & Downloads */}
            <div className="flex flex-col gap-6">
              
              {/* Card: Documentos de Prácticas */}
              <div className="bg-white rounded-[18px] border border-[#eef2f7] shadow-soft p-[24px] flex flex-col gap-[20px]">
                <div className="flex items-center justify-between pb-3 border-b border-[#f3f4f6]">
                  <h3 className="text-[14px] font-semibold text-[#111827] flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-indigo-500" />
                    Carpeta de Prácticas
                  </h3>
                </div>

                <div className="flex flex-col gap-4">
                  {allDocs.map((doc, i) => (
                    <div 
                      key={i}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-all duration-300
                        ${doc.isReal 
                          ? 'bg-[#fcfdfe] border-[#eef2f7] hover:border-[#2563eb] hover:shadow-soft' 
                          : 'bg-[#fafafa]/80 border-[#eef2f7] opacity-65'
                        }
                      `}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-[40px] h-[40px] rounded-[10px] flex items-center justify-center shrink-0 border
                          ${doc.isReal 
                            ? (doc.type === 'DOCX' ? 'bg-[#eff6ff] border-[#dbeafe] text-[#2563eb]' : 'bg-[#fff5f5] border-[#ffe3e3] text-[#ef4444]')
                            : 'bg-[#f3f4f6] border-[#e5e7eb] text-[#9ca3af]'
                          }
                        `}>
                          {doc.isReal ? <FileText className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-[13px] font-bold text-[#374151] truncate" title={doc.name}>{doc.name}</span>
                          <span className="text-[10px] text-[#9ca3af] mt-0.5 flex items-center gap-1.5">
                            {doc.isReal ? `Disponible · ${doc.createdAt}` : 'Pendiente de generación'}
                            {doc.isReal && doc.signatureStatus !== 'NONE' && SIGNATURE_LABEL[doc.signatureStatus] && (
                              <span className={`px-1.5 py-[1px] rounded-[6px] border font-bold uppercase tracking-wider ${SIGNATURE_LABEL[doc.signatureStatus].cls}`}>
                                {SIGNATURE_LABEL[doc.signatureStatus].label}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      {doc.isReal && doc.id ? (
                        <button
                          onClick={() => handleDownload(doc.id!)}
                          className="w-8 h-8 rounded-full bg-white border border-[#eef2f7] flex items-center justify-center text-[#6b7280] hover:text-[#2563eb] hover:border-[#2563eb] transition-all hover:scale-[1.05] shadow-sm shrink-0"
                          title="Descargar documento"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider shrink-0 px-2">
                          Bloqueado
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="p-3.5 bg-slate-50 border border-[#eef2f7] rounded-xl text-[12px] text-[#6b7280] leading-relaxed">
                  <p className="font-semibold text-[#374151] mb-1">Nota del sistema:</p>
                  Los documentos y certificados son firmados digitalmente y se activan automáticamente conforme vayas completando los hitos y tus horas con tu supervisor y tutor.
                </div>
              </div>

            </div>

          </div>

        </div>
      </div>
    </RoleGate>
  )
}
