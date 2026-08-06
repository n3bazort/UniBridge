'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Briefcase, Building2, FileText, Settings, Upload, BookOpen, Files, BarChart3, ChevronLeft, ChevronRight, GraduationCap, PenLine, UserCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { useAuth } from '@/hooks/use-auth'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { useSidebarStore } from '@/store/sidebar'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { ChangePasswordModal } from '@/components/auth/ChangePasswordModal'
import { UserMenu } from '@/components/layout/user-menu'
import { useState, useEffect } from 'react'

const navItems = [
  { name: 'Dashboard', href: '/overview', icon: LayoutDashboard, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Prácticas', href: '/practices', icon: Briefcase, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Estudiantes', href: '/students', icon: GraduationCap, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Empresas', href: '/companies', icon: Building2, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Documentos', href: '/documents', icon: Files, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Certificados', href: '/certificates', icon: FileText, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Importaciones', href: '/imports', icon: Upload, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Usuarios', href: '/users', icon: UserCheck, roles: ['ADMIN'] },
  { name: 'Firma de Documentos', href: '/signer-dashboard', icon: PenLine, roles: ['SIGNER'] },
  { name: 'Configuraciones', href: '/settings', icon: Settings, roles: ['ADMIN', 'COORDINATOR'] },
]

export function Sidebar() {
  const pathname = usePathname()
  const user = useAuthStore((state) => state.user)
  const { logout } = useAuth()
  const { isCollapsed, toggleSidebar, isMobileOpen, closeMobileSidebar } = useSidebarStore()
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)

  /* Close the mobile drawer on Escape */
  useEffect(() => {
    if (!isMobileOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMobileSidebar() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isMobileOpen, closeMobileSidebar])

  /*
   * The mobile drawer always shows full labels — "collapsed" is a desktop
   * density preference and doesn't apply to a temporary overlay. Without this,
   * the drawer defaulted to icon-only (isCollapsed persists as true) and slid
   * in nearly empty on phones.
   */
  const collapsedVisual = isCollapsed && !isMobileOpen

  const userName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : (user?.email ? user.email.split('@')[0] : 'Usuario');
  
  const userRole = user?.role === 'ADMIN' 
    ? 'Administrador' 
    : user?.role === 'COORDINATOR' 
      ? 'Coordinador' 
      : user?.role === 'STUDENT'
        ? 'Estudiante'
        : user?.role === 'SIGNER'
          ? 'Firmante'
          : 'Usuario';
  
  const avatarSeed = user?.firstName && user?.lastName 
    ? `${user.firstName}${user.lastName}` 
    : (user?.email || 'Maria');

  // Use all items for development if user is not fully populated, or filter
  const filteredNav = navItems.filter(item => 
    !user?.role || item.roles.includes(user.role)
  )

  const { data: missingAbbreviations } = useQuery({
    queryKey: ['missing-abbreviations'],
    queryFn: async () => {
      const res = await api.get('/programs/misc/missing-abbreviations')
      return res.data
    },
    enabled: !!user && (user.role === 'ADMIN' || user.role === 'COORDINATOR'),
  })
  
  const missingCount = missingAbbreviations?.length || 0;

  return (
    <aside className={cn(
      // Mobile: fixed drawer, fixed width, off-canvas by default, slides in above the backdrop.
      "fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col bg-[#fafafa] border-r border-[#f0f0f0] pt-[24px] pb-[24px] px-[16px] transition-transform duration-300 ease-in-out",
      isMobileOpen ? "translate-x-0" : "-translate-x-full",
      // Desktop (md+): back to a permanently visible column, width driven by the collapse toggle.
      "md:translate-x-0 md:z-20 md:transition-[width,padding]",
      isCollapsed ? "md:w-[80px] md:px-[12px]" : "md:w-[240px] md:px-[16px]"
    )}>
      <div className={cn("flex h-12 items-center mb-4 shrink-0", collapsedVisual ? "md:justify-center md:px-0" : "px-4")}>
        <Link href="/" className="flex items-center gap-3 min-w-0" onClick={closeMobileSidebar}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#2563eb] text-white shadow-soft">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
              <path d="M3 20V6m18 14V6" />
              <path d="M2 13Q3.5 8 4 6Q12 16 20 6Q20.5 8 22 13" strokeWidth="1.6" />
              <path d="M2 17h20" />
              <path d="M8 11.5v5.5m8-5.5v5.5m-4 0v-3.5" strokeWidth="1.2" />
            </svg>
          </div>
          {!collapsedVisual && (
            <div className="flex flex-col overflow-hidden">
              <span className="text-[14px] font-semibold text-[#111827] leading-tight truncate">UniBridge</span>
              <span className="text-[12px] font-medium text-[#6b7280] leading-tight truncate">Plataforma PPP</span>
            </div>
          )}
        </Link>
        {/* Mobile-only close button — the desktop collapse toggle lives at the bottom and doesn't apply here */}
        <button
          type="button"
          onClick={closeMobileSidebar}
          aria-label="Cerrar menú"
          className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 md:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto overflow-x-hidden mt-2 space-y-[4px] no-scrollbar">
        <nav className="grid items-start">
          {filteredNav.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobileSidebar}
                title={collapsedVisual ? item.name : undefined}
                className={cn(
                  "group flex items-center rounded-[12px] py-2.5 transition-all duration-180 ease-[cubic-bezier(.2,.8,.2,1)]",
                  collapsedVisual ? "justify-center px-0 relative" : "gap-3 px-4",
                  isActive
                    ? "bg-[#111827] text-white shadow-soft"
                    : "text-[#374151] hover:bg-[#f3f4f6] hover:translate-x-[2px]"
                )}
              >
                <item.icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    isActive ? "text-white" : "text-[#6b7280] group-hover:text-[#374151]"
                  )}
                  strokeWidth={1.8}
                />
                {!collapsedVisual && <span className="text-[14px] font-medium truncate">{item.name}</span>}
                {item.name === 'Configuraciones' && missingCount > 0 && (
                  <span className={cn(
                    "flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm",
                    collapsedVisual
                      ? "absolute -top-1 -right-1 h-4 min-w-4 px-1"
                      : "ml-auto h-5 min-w-5 px-1.5"
                  )}>
                    {missingCount > 99 ? '99+' : missingCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="mt-auto pt-4 flex flex-col gap-2 relative">
        <UserMenu
          side="top"
          align="start"
          contentClassName={collapsedVisual ? 'w-56' : 'w-[208px]'}
          onOpenChange={setIsUserMenuOpen}
          onChangePassword={() => setShowPasswordModal(true)}
          onLogout={logout}
          header={
            <div className="flex items-center gap-3 p-2 border-b border-gray-100 mb-1">
              <img src={`https://api.dicebear.com/9.x/notionists/svg?seed=${avatarSeed}`} alt="Avatar" className="w-9 h-9 rounded-full bg-slate-100 shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-semibold text-gray-900 truncate">{userName}</span>
                <span className="text-[11px] text-gray-500 truncate">{user?.email || userRole}</span>
                <span className="mt-0.5 inline-flex items-center w-fit rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                  {userRole}
                </span>
              </div>
            </div>
          }
          trigger={
            <button
              type="button"
              className={cn(
                "flex items-center rounded-xl p-2 text-left hover:bg-[#f3f4f6] transition-all select-none group border border-transparent hover:border-gray-200/60 cursor-pointer",
                collapsedVisual ? "justify-center" : "justify-between"
              )}
            >
              <div className={cn("flex items-center gap-3 min-w-0 flex-1", collapsedVisual && "justify-center")}>
                <img src={`https://api.dicebear.com/9.x/notionists/svg?seed=${avatarSeed}`} alt="Avatar" className="w-9 h-9 rounded-full bg-white shadow-soft shrink-0" />
                {!collapsedVisual && (
                  <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                    <span className="text-[13px] font-medium text-[#111827] leading-tight truncate block">{userName}</span>
                    <span className="text-[12px] text-[#6b7280] leading-tight truncate block">{userRole}</span>
                  </div>
                )}
              </div>
              {!collapsedVisual && (
                <div className="text-gray-400 group-hover:text-gray-700 transition-colors shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("transition-transform duration-200", isUserMenuOpen && "rotate-180")}>
                    <polyline points="18 15 12 9 6 15"></polyline>
                  </svg>
                </div>
              )}
            </button>
          }
        />

        {/* Toggle Button — desktop density only; the mobile drawer closes via the X above or the backdrop */}
        <button
          onClick={toggleSidebar}
          title={isCollapsed ? "Expandir menú" : "Colapsar menú"}
          className="hidden md:flex mt-1 mx-auto items-center justify-center w-8 h-8 rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827] shadow-sm transition-all"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
    </aside>
  )
}
