'use client'

import { usePathname } from 'next/navigation'
import { Search, X, Menu } from 'lucide-react'
import { useSearchStore } from '@/store/search'
import { useAuthStore } from '@/store/auth-store'
import { useSidebarStore } from '@/store/sidebar'
import { useAuth } from '@/hooks/use-auth'
import { useState } from 'react'
import { ChangePasswordModal } from '@/components/auth/ChangePasswordModal'
import { UserMenu } from '@/components/layout/user-menu'

export function Topbar() {
  const { searchQuery, setSearchQuery } = useSearchStore()
  const pathname = usePathname()
  const user = useAuthStore((state) => state.user)
  const { openMobileSidebar } = useSidebarStore()
  const { logout } = useAuth()
  const [showPasswordModal, setShowPasswordModal] = useState(false)

  const isPractices = pathname === '/practices'

  /* ── Page titles ── */
  const titles: Record<string, string> = {
    '/practices': 'Registro de Prácticas',
    '/documents': 'Documentos y Plantillas',
    '/documents/designer': 'Diseñador de Certificados',
    '/certificates': 'Certificados Emitidos',
    '/companies': 'Empresas e Instituciones',
    '/students': 'Estudiantes',
    '/overview': 'Resumen General',
    '/imports': 'Importación de Datos',
    '/settings': 'Configuraciones del Sistema',
    '/users': 'Gestión de Usuarios',
    '/signer-dashboard': 'Firma de Documentos',
  }
  const currentTitle = titles[pathname] ?? ''

  /* ── User display name ── */
  const fullName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : (user?.email ? user.email.split('@')[0] : '')

  const displayName = (() => {
    if (!fullName) return 'Usuario'
    const parts = fullName.trim().split(' ')
    if (parts.length === 1) return parts[0]
    return `${parts[0].charAt(0)}. ${parts[parts.length - 1]}`
  })()

  return (
    <>
      {/*
        TOPBAR — not sticky, not fixed.
        It's the first child of a flex-col parent, so it sits naturally
        at the top without needing position hacks. The main content below
        scrolls independently because it has overflow-auto + flex-1.
      */}
      <header className="flex h-14 shrink-0 items-center justify-between bg-white px-4 md:px-6 border-b border-gray-200/80">

        {/* LEFT: mobile menu + title */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={openMobileSidebar}
            aria-label="Abrir menú"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-sm md:text-[15px] font-semibold text-gray-900 truncate">
            {currentTitle}
          </h1>
        </div>

        {/* CENTER: search (only on practices page) */}
        {/* min-w-0 lets this flex child actually shrink below its content on narrow
            viewports instead of overflowing the row — flex items default to min-width: auto */}
        <div className="flex-1 min-w-0 flex justify-center px-2 md:px-4">
          {isPractices && (
            <div className="relative flex items-center w-full max-w-md min-w-0">
              <Search className="absolute left-3 h-4 w-4 text-gray-400 shrink-0" strokeWidth={1.8} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar..."
                className="h-9 w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-8 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: user menu */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <div className="ml-1">
            <UserMenu
              side="bottom"
              align="end"
              contentClassName="w-52"
              header={<p className="px-3 py-1.5 text-[11px] font-medium text-gray-400 truncate">{fullName || 'Usuario'}</p>}
              onChangePassword={() => setShowPasswordModal(true)}
              onLogout={logout}
              trigger={
                <button
                  type="button"
                  className="flex h-9 max-w-[9rem] items-center rounded-lg bg-gray-900 px-4 text-[13px] font-semibold text-white hover:bg-gray-800 active:scale-[0.97] transition-all select-none sm:max-w-[14rem]"
                  aria-label={`Usuario: ${fullName || 'Usuario'}`}
                >
                  <span className="truncate">{displayName}</span>
                </button>
              }
            />
          </div>
        </div>
      </header>

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
    </>
  )
}
