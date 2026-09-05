'use client'

import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { useAuthStore } from '@/store/auth-store'
import { useSidebarStore } from '@/store/sidebar'
import { useAuth } from '@/hooks/use-auth'
import { useState } from 'react'
import { ChangePasswordModal } from '@/components/auth/ChangePasswordModal'
import { UserMenu } from '@/components/layout/user-menu'
import { PeriodSwitcher } from '@/components/layout/period-switcher'
import { pageTitle } from '@/lib/page-titles'

export function Topbar() {
  const pathname = usePathname()
  const user = useAuthStore((state) => state.user)
  const { openMobileSidebar } = useSidebarStore()
  const { logout } = useAuth()
  const [showPasswordModal, setShowPasswordModal] = useState(false)


  /* ── Nombre de la pantalla: viene de la fuente única (@/lib/page-titles),
        la misma que usa PageHeader, para que no puedan discrepar. ── */
  const currentTitle = pageTitle(pathname)

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

  // Único menú de cuenta de la app — el de la sidebar (abajo-izquierda) se
  // quitó por ser el mismo menú duplicado; esto trae lo que solo tenía esa
  // versión (avatar, correo, badge de rol) para no perder esa información.
  // Un firmante se nombra por la autoridad que ejerce, no por el rol técnico:
  // «Firmante» a secas no distingue a quien firma primero de quien cierra.
  const userRole = user?.role === 'ADMIN'
    ? 'Administrador'
    : user?.role === 'COORDINATOR'
      ? 'Coordinador'
      : user?.role === 'SIGNER'
        ? user?.signerRole === 'DEAN'
          ? 'Decano'
          : user?.signerRole === 'DIRECTOR'
            ? 'Responsable de Prácticas'
            : 'Firmante'
        : 'Usuario'

  const avatarSeed = user?.firstName && user?.lastName
    ? `${user.firstName}${user.lastName}`
    : (user?.email || 'Maria')

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
          {/* El título solo aparece en móvil. En escritorio la pantalla ya se
              nombra dos veces —la sidebar marca el ítem activo y la página
              tiene su propio <h1>—, y repetirlo a 40px de distancia era la
              causa de que el mismo sitio se llamara de dos formas distintas.
              En móvil la sidebar está plegada, así que aquí sí hace falta. */}
          <span className="text-sm font-semibold text-gray-900 truncate md:hidden">
            {currentTitle}
          </span>
          <div className="w-px h-5 bg-gray-200 shrink-0 md:hidden" />
          <PeriodSwitcher />
        </div>

        {/* El buscador vivía aquí, pero SOLO en /practices: aparecía y
            desaparecía del marco al navegar, lo que hace parecer que la app se
            está rompiendo. Ahora vive dentro de su pantalla, junto a los
            filtros que gobiernan la misma lista. */}
        <div className="flex-1 min-w-0" />

        {/* RIGHT: user menu */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <div className="ml-1">
            <UserMenu
              side="bottom"
              align="end"
              contentClassName="w-52"
              header={
                <div className="flex items-center gap-3 p-2 border-b border-gray-100 mb-1">
                  <img src={`https://api.dicebear.com/9.x/notionists/svg?seed=${avatarSeed}`} alt="Avatar" className="w-9 h-9 rounded-full bg-slate-100 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-semibold text-gray-900 truncate">{fullName || 'Usuario'}</span>
                    <span className="text-[11px] text-gray-500 truncate">{user?.email || userRole}</span>
                    <span className="mt-0.5 inline-flex items-center w-fit rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                      {userRole}
                    </span>
                  </div>
                </div>
              }
              onChangePassword={() => setShowPasswordModal(true)}
              onLogout={logout}
              trigger={
                <button
                  type="button"
                  className="flex h-9 max-w-[9rem] items-center rounded-lg border border-border bg-transparent px-3.5 text-sm font-medium text-foreground hover:bg-muted/60 active:scale-[0.97] transition-all select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[14rem]"
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
