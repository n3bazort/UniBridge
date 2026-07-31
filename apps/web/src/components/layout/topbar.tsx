'use client'

import { usePathname } from 'next/navigation'
import { Search, X, Menu, KeyRound, LogOut } from 'lucide-react'
import { useSearchStore } from '@/store/search'
import { useAuthStore } from '@/store/auth-store'
import { useSidebarStore } from '@/store/sidebar'
import { useAuth } from '@/hooks/use-auth'
import { useState, useRef, useEffect } from 'react'
import { ChangePasswordModal } from '@/components/auth/ChangePasswordModal'

export function Topbar() {
  const { searchQuery, setSearchQuery } = useSearchStore()
  const pathname = usePathname()
  const user = useAuthStore((state) => state.user)
  const { openMobileSidebar } = useSidebarStore()
  const { logout } = useAuth()
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isPractices = pathname === '/practices'

  /* ── Close user menu on outside click ── */
  useEffect(() => {
    if (!isUserMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isUserMenuOpen])

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
        <div className="flex-1 flex justify-center px-4">
          {isPractices && (
            <div className="relative flex items-center w-full max-w-md">
              <Search className="absolute left-3 h-4 w-4 text-gray-400" strokeWidth={1.8} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar..."
                className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-8 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
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
          {/* User button + dropdown */}
          <div ref={menuRef} className="relative ml-1">
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((v) => !v)}
              className="flex h-9 items-center rounded-lg bg-gray-900 px-4 text-[13px] font-semibold text-white hover:bg-gray-800 active:scale-[0.97] transition-all select-none"
              aria-label={`Usuario: ${fullName || 'Usuario'}`}
              aria-expanded={isUserMenuOpen}
            >
              {displayName}
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
                <p className="px-3 py-1.5 text-[11px] font-medium text-gray-400 truncate">{fullName || 'Usuario'}</p>
                <button
                  type="button"
                  onClick={() => { setIsUserMenuOpen(false); setShowPasswordModal(true) }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <KeyRound className="h-4 w-4" /> Cambiar contraseña
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
    </>
  )
}
