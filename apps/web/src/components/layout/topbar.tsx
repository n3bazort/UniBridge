'use client'

import { usePathname } from 'next/navigation'
import { Bell, HelpCircle, Search, ChevronDown, X } from 'lucide-react'
import { useSearchStore } from '@/store/search'

export function Topbar() {
  const { searchQuery, setSearchQuery } = useSearchStore()
  const pathname = usePathname()

  const isPractices = pathname === '/practices'

  const titles: Record<string, string> = {
    '/practices': 'Registro de Prácticas',
    '/documents': 'Documentos y Plantillas',
    '/certificates': 'Certificados Emitidos',
    '/companies': 'Empresas e Instituciones',
    '/students': 'Estudiantes',
    '/overview': 'Resumen General',
    '/imports': 'Importación de Datos'
  }

  const currentTitle = titles[pathname] || 'Dashboard'

  return (
    <header className="sticky top-0 z-[100] flex h-[72px] items-center justify-between bg-white px-4 md:px-[32px] border-b border-[#eef2f7]">
      <div className="flex items-center min-w-fit md:min-w-[200px]">
        <h1 className="text-lg md:text-[24px] font-semibold text-[#111827] truncate max-w-[120px] sm:max-w-none">{currentTitle}</h1>
      </div>

      <div className="flex-1 flex justify-end md:justify-center px-2 md:px-4">
        {isPractices && (
          <div className="relative flex items-center w-full max-w-[200px] md:max-w-[520px]">
            <Search className="absolute left-3 md:left-3.5 h-[16px] w-[16px] md:h-[18px] md:w-[18px] text-[#9ca3af]" strokeWidth={1.8} />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar..." 
              className="h-[36px] md:h-[44px] w-full rounded-[10px] md:rounded-[14px] border border-[#f1f5f9] bg-[#f9fafb] pl-9 md:pl-10 pr-8 md:pr-10 text-[13px] md:text-[14px] text-[#111827] placeholder:text-[#9ca3af] outline-none transition-all focus:border-[#2563eb] focus:ring-[4px] focus:ring-[#2563eb]/10"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 flex items-center justify-center text-[#9ca3af] hover:text-[#111827] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 md:gap-5 min-w-fit md:min-w-[200px]">
        <button className="text-[#6b7280] hover:text-[#111827] transition-colors relative hidden sm:block">
          <div className="absolute top-0 right-0 h-1.5 w-1.5 rounded-full bg-red-500" />
          <Bell className="h-[20px] w-[20px]" strokeWidth={1.8} />
        </button>
        <button className="text-[#6b7280] hover:text-[#111827] transition-colors hidden sm:block">
          <HelpCircle className="h-[20px] w-[20px]" strokeWidth={1.8} />
        </button>
        <button className="ml-2 flex h-[40px] items-center gap-2 rounded-[12px] bg-[#111827] px-4 text-[14px] font-medium text-white shadow-soft hover:bg-[#1f2937] transition-all hover:scale-[0.98] active:scale-[0.95]">
          Acciones
          <ChevronDown className="h-4 w-4 opacity-80" strokeWidth={2} />
        </button>
      </div>
    </header>
  )
}
