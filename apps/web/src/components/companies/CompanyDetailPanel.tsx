import React from 'react'
import { Company } from './CompanyList'
import { Building2, Mail, Phone, Briefcase, UserCircle } from 'lucide-react'

interface CompanyDetailPanelProps {
  company: Company | null
}

export function CompanyDetailPanel({ company }: CompanyDetailPanelProps) {
  if (!company) {
    return (
      <div className="sticky top-[96px] flex flex-col items-center justify-center gap-4 w-full h-[calc(100vh-120px)] bg-white rounded-[24px] border border-dashed border-[#eef2f7]">
        <div className="w-16 h-16 bg-[#f8fafc] rounded-full flex items-center justify-center text-[#94a3b8]">
          <Building2 size={32} />
        </div>
        <p className="text-[#64748b] font-medium">Selecciona una empresa para ver sus detalles</p>
      </div>
    )
  }

  return (
    <div className="sticky top-[96px] flex flex-col w-full h-[calc(100vh-120px)] bg-white rounded-[24px] border border-[#eef2f7] shadow-sm overflow-y-auto hide-scrollbar">
      {/* Top Section */}
      <div className="relative flex flex-col items-center p-8 border-b border-[#eef2f7] bg-gradient-to-b from-[#f8fafc] to-white">
        <div className="relative mb-4 flex items-center justify-center w-24 h-24 rounded-[20px] bg-indigo-50 border-2 border-indigo-100 shadow-sm">
          <Building2 size={48} className="text-indigo-500" />
        </div>
        
        <h2 className="text-[20px] font-bold text-[#1e293b] text-center mb-1 leading-tight">
          {company.name}
        </h2>
        <span className="inline-flex items-center font-medium text-[12px] text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-[8px] mb-4 border border-emerald-200">
          Activa
        </span>
      </div>

      {/* Info Sections */}
      <div className="flex flex-col p-6 gap-6">
        
        {/* Contact Person Info */}
        <div>
          <h3 className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-wider mb-3">
            Representante / Tutor Empresarial
          </h3>
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-[#cbd5e1]">
                <UserCircle size={18} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-[#64748b] font-medium">Nombre de Contacto</span>
                <span className="text-[14px] text-[#1e293b] font-medium">{company.contactName || 'No registrado'}</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-[#cbd5e1]">
                <Briefcase size={18} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-[#64748b] font-medium">Cargo</span>
                <span className="text-[14px] text-[#1e293b] font-medium">{company.recipientName || 'No registrado'}</span>
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
                <span className="text-[13px] text-[#64748b] font-medium">Correo Electrónico</span>
                <span className="text-[14px] text-[#3b82f6] font-medium break-all">
                  {company.email || 'No registrado'}
                </span>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-[#cbd5e1]">
                <Phone size={18} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-[#64748b] font-medium">Teléfono</span>
                <span className="text-[14px] text-[#1e293b] font-mono">
                  {company.phone || 'No registrado'}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
