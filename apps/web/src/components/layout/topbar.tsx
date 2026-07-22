'use client'

import { usePathname } from 'next/navigation'
import { Bell, HelpCircle, Search, X, Menu, KeyRound, LogOut } from 'lucide-react'
import { useSearchStore } from '@/store/search'
import { useAuthStore } from '@/store/auth-store'
import { useSidebarStore } from '@/store/sidebar'
import { useAuth } from '@/hooks/use-auth'
import { useState } from 'react'
import { ChangePasswordModal } from '@/components/auth/ChangePasswordModal'

export function Topbar() {
  const { searchQuery, setSearchQuery } = useSearchStore()
  const pathname = usePathname()
  const user = useAuthStore((state) => state.user)
  const { openMobileSidebar } = useSidebarStore()
  const { logout } = useAuth()
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)

  const isPractices = pathname === '/practices'

  const titles: Record<string, string> = {
    '/practices': 'Registro de Prácticas',
    '/documents': 'Documentos y Plantillas',
    '/documents/designer': '',
    '/certificates': 'Certificados Emitidos',
    '/companies': 'Empresas e Instituciones',
    '/students': 'Estudiantes',
    '/overview': 'Resumen General',
    '/imports': 'Importación de Datos',
    '/settings': 'Configuraciones del Sistema'
  }

  const fallbackTitles: Record<string, string> = {
    '/users': 'Gestión de Usuarios',
    '/signer-dashboard': 'Firma de Documentos',
    '/documents/designer': 'Diseñador de Certificados',
  }
  const currentTitle = titles[pathname] ?? fallbackTitles[pathname] ?? ''

  // Generar iniciales o abreviación del nombre dinámicamente
  const fullName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : (user?.email ? user.email.split('@')[0] : '')

  const getDisplayName = (): string => {
    if (!fullName) return 'Usuario'
    const parts = fullName.trim().split(' ')
    if (parts.length === 1) return parts[0]
    // "Juan Carlos Pérez García" → "J. Pérez"
    const firstName = parts[0]
    const lastName = parts[parts.length - 1]
    return `${firstName.charAt(0)}. ${lastName}`
  }

  return (
    <header className="sticky top-0 z-[100] flex h-[72px] items-center justify-between bg-white px-4 md:px-[32px] border-b border-[#eef2f7]">
      <div className="flex items-center min-w-0 gap-2 md:min-w-[200px]">
        <button
          type="button"
          onClick={openMobileSidebar}
          aria-label="Abrir menú de navegación"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[#374151] transition-colors hover:bg-[#f3f4f6] focus:outline-none focus:ring-2 focus:ring-[#2563eb] md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
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
        <button className="text-[#6b7280] hover:text-[#111827] transition-colors relative hidden sm:block" aria-label="Notificaciones">
          <div className="absolute top-0 right-0 h-1.5 w-1.5 rounded-full bg-red-500" />
          <Bell className="h-[20px] w-[20px]" strokeWidth={1.8} />
        </button>
        <button className="text-[#6b7280] hover:text-[#111827] transition-colors hidden sm:block" aria-label="Ayuda">
          <HelpCircle className="h-[20px] w-[20px]" strokeWidth={1.8} />
        </button>
        <div className="relative ml-2 flex h-[40px] items-center justify-center rounded-[12px] group transition-all hover:scale-[0.98] active:scale-[0.95] select-none">
          <style>{`
            @keyframes led-rotate {
              0% { transform: translate(-50%, -50%) rotate(0deg); }
              100% { transform: translate(-50%, -50%) rotate(360deg); }
            }
            .beam-container-top {
              position: absolute;
              inset: 0;
              border-radius: 12px;
              padding: 5px;
              pointer-events: none;
              -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
              -webkit-mask-composite: xor;
              mask-composite: exclude;
              overflow: hidden;
              z-index: 20;
            }
            .beam-light-top {
              position: absolute;
              top: 50%;
              left: 50%;
              width: 250%;
              aspect-ratio: 1 / 1;
              background: conic-gradient(
                from 0deg,
                #fef08a 0%,
                #eab308 6%,
                #d97706 12%,
                transparent 16%,
                transparent 100%
              );
              animation: led-rotate 4s linear infinite;
              filter: blur(1px);
            }
          `}</style>

          <button
            type="button"
            onClick={() => setIsUserMenuOpen((value) => !value)}
            className="relative z-10 flex h-[40px] w-full items-center justify-center rounded-[12px] bg-[#111827] px-5 text-[14px] font-semibold text-white transition-all duration-200 group-hover:bg-[#1a2235]"
            style={{ filter: 'drop-shadow(0 0 6px rgba(234, 179, 8, 0.45))' }}
            aria-label={`Usuario: ${fullName || 'Usuario'}`}
            aria-expanded={isUserMenuOpen}
          >
            {getDisplayName()}
          </button>

          <div className="beam-container-top">
            <div className="beam-light-top" />
          </div>
          {isUserMenuOpen && (
            <div className="absolute right-0 top-12 z-50 w-56 rounded-[14px] border border-[#eef2f7] bg-white p-2 shadow-lg">
              <p className="px-3 py-2 text-xs font-medium text-[#6b7280]">{fullName || 'Usuario'}</p>
              <button type="button" onClick={() => { setIsUserMenuOpen(false); setShowPasswordModal(true) }} className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 text-sm text-[#374151] hover:bg-[#f3f4f6]">
                <KeyRound className="h-4 w-4" /> Cambiar contraseña
              </button>
              <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 text-sm text-rose-600 hover:bg-rose-50">
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
    </header>
  )
}

