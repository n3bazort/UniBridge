import React from 'react'
import { Student } from './StudentList'
import { Mail, Briefcase, GraduationCap, Phone, MapPin, UserCircle } from 'lucide-react'

interface StudentDetailPanelProps {
  student: Student | null
}

export function StudentDetailPanel({ student }: StudentDetailPanelProps) {
  if (!student) {
    return (
      <div className="sticky top-[96px] flex flex-col items-center justify-center gap-4 w-full h-[calc(100vh-120px)] bg-white rounded-[24px] border border-dashed border-[#eef2f7]">
        <div className="w-16 h-16 bg-[#f8fafc] rounded-full flex items-center justify-center text-[#94a3b8]">
          <UserCircle size={32} />
        </div>
        <p className="text-[#64748b] font-medium">Selecciona un estudiante para ver sus detalles</p>
      </div>
    )
  }

  const fullName = `${student.firstName} ${student.lastName}`
  const avatarUrl = `https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(fullName)}&backgroundColor=f8fafc`

  return (
    <div className="sticky top-[96px] flex flex-col w-full h-[calc(100vh-120px)] bg-white rounded-[24px] border border-[#eef2f7] shadow-sm overflow-y-auto hide-scrollbar">
      {/* Top Section - Avatar and Name */}
      <div className="relative flex flex-col items-center p-8 border-b border-[#eef2f7] bg-gradient-to-b from-[#f8fafc] to-white">
        <div className="relative mb-4">
          <img 
            src={avatarUrl} 
            alt={`Avatar de ${fullName}`}
            className="w-24 h-24 rounded-full border-4 border-white shadow-sm bg-white"
          />
          <div className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-500 border-2 border-white rounded-full"></div>
        </div>
        
        <h2 className="text-[20px] font-bold text-[#1e293b] text-center mb-1 leading-tight">
          {fullName}
        </h2>
        <span className="inline-flex items-center font-mono text-[13px] text-[#64748b] bg-[#f1f5f9] px-2.5 py-1 rounded-[8px] mb-4">
          C.I. {student.dni}
        </span>
      </div>

      {/* Info Sections */}
      <div className="flex flex-col p-6 gap-6">
        
        {/* Academic Info */}
        <div>
          <h3 className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-wider mb-3">
            Información Académica
          </h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-[#cbd5e1]">
                <GraduationCap size={18} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-[#64748b] font-medium">Carrera</span>
                <span className="text-[14px] text-[#1e293b] font-medium">{student.program?.name || 'No registrada'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-[#f1f5f9]"></div>

        {/* Contact Info */}
        <div>
          <h3 className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-wider mb-3">
            Información de Contacto
          </h3>
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-[#cbd5e1]">
                <Mail size={18} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-[#64748b] font-medium">Correo Institucional</span>
                <span className="text-[14px] text-[#3b82f6] font-medium break-all">
                  {student.user?.email || 'No registrado'}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-[#cbd5e1]">
                <Phone size={18} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-[#64748b] font-medium">Teléfono / Celular</span>
                <span className="text-[14px] text-[#1e293b] font-medium">
                  {student.phone || 'No registrado'}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
