import React from 'react'

export interface Student {
  id: string
  dni: string
  firstName: string
  lastName: string
  phone?: string
  user?: {
    email: string
  }
  program?: {
    name: string
  }
}

interface StudentListProps {
  students: Student[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function StudentList({ students, selectedId, onSelect }: StudentListProps) {
  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-[#eef2f7] rounded-[24px] bg-white/50">
        <div className="w-16 h-16 bg-[#f8fafc] rounded-full flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#94a3b8]">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <line x1="19" y1="8" x2="19" y2="14"></line>
            <line x1="22" y1="11" x2="16" y2="11"></line>
          </svg>
        </div>
        <h3 className="text-[16px] font-semibold text-[#1e293b] mb-1">No se encontraron estudiantes</h3>
        <p className="text-[14px] text-[#64748b] max-w-[250px]">
          Intenta ajustar los filtros de búsqueda para encontrar lo que buscas.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {students.map((student) => {
        const isSelected = selectedId === student.id
        const fullName = `${student.firstName} ${student.lastName}`
        const avatarUrl = `https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(fullName)}&backgroundColor=f8fafc`

        return (
          <button
            key={student.id}
            onClick={() => onSelect(student.id)}
            className={`flex items-start gap-4 p-4 rounded-[16px] border transition-all text-left w-full
              ${isSelected 
                ? 'bg-white border-[#3b82f6] shadow-[0_4px_20px_-4px_rgba(59,130,246,0.1)] ring-1 ring-[#3b82f6]/20' 
                : 'bg-white border-[#eef2f7] hover:border-[#cbd5e1] hover:bg-[#f8fafc] hover:shadow-sm'
              }
            `}
          >
            <div className="relative shrink-0">
              <img 
                src={avatarUrl} 
                alt={`Avatar de ${fullName}`}
                className="w-12 h-12 rounded-full border border-[#eef2f7] bg-white shadow-sm"
              />
            </div>
            
            <div className="flex flex-col min-w-0 flex-1 gap-1">
              <h4 className="font-semibold text-[#1e293b] text-[15px] leading-tight truncate">
                {student.lastName} {student.firstName}
              </h4>
              
              <div className="flex items-center gap-2 mt-0.5">
                <span className="inline-flex items-center font-mono text-[13px] text-[#64748b] bg-[#f1f5f9] px-2 py-0.5 rounded-[6px]">
                  {student.dni}
                </span>
                {student.program?.name && (
                  <span className="truncate text-[13px] text-[#3b82f6] font-medium">
                    {student.program.name}
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
