import React from 'react'
import { Building2 } from 'lucide-react'

export interface Company {
  id: string
  name: string
  contactName?: string
  recipientName?: string
  email?: string
  phone?: string
}

interface CompanyListProps {
  companies: Company[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function CompanyList({ companies, selectedId, onSelect }: CompanyListProps) {
  if (companies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-[#eef2f7] rounded-[24px] bg-white/50">
        <div className="w-16 h-16 bg-[#f8fafc] rounded-full flex items-center justify-center mb-4">
          <Building2 size={32} className="text-[#94a3b8]" />
        </div>
        <h3 className="text-[16px] font-semibold text-[#1e293b] mb-1">No se encontraron empresas</h3>
        <p className="text-[14px] text-[#64748b] max-w-[250px]">
          Intenta ajustar los filtros de búsqueda para encontrar lo que buscas.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {companies.map((company) => {
        const isSelected = selectedId === company.id

        return (
          <button
            key={company.id}
            onClick={() => onSelect(company.id)}
            className={`flex items-start gap-4 p-4 rounded-[16px] border transition-all text-left w-full
              ${isSelected 
                ? 'bg-white border-[#3b82f6] shadow-[0_4px_20px_-4px_rgba(59,130,246,0.1)] ring-1 ring-[#3b82f6]/20' 
                : 'bg-white border-[#eef2f7] hover:border-[#cbd5e1] hover:bg-[#f8fafc] hover:shadow-sm'
              }
            `}
          >
            <div className="relative shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100/50">
              <Building2 size={24} className="text-indigo-500" />
            </div>
            
            <div className="flex flex-col min-w-0 flex-1 gap-1">
              <h4 className="font-semibold text-[#1e293b] text-[15px] leading-tight truncate">
                {company.name}
              </h4>
              
              <div className="flex flex-col gap-0.5 mt-0.5">
                {company.contactName && (
                  <span className="truncate text-[13px] text-[#64748b] font-medium">
                    Tutor: {company.contactName}
                  </span>
                )}
                {company.email && (
                  <span className="truncate text-[12px] text-[#3b82f6]">
                    {company.email}
                  </span>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
