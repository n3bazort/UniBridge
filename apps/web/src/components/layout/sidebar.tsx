'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Briefcase, Building2, FileText, Settings, Upload, BookOpen, Files, BarChart3, ChevronLeft, ChevronRight, GraduationCap, PenLine, UserCheck, ClipboardCheck, X } from 'lucide-react'
import { LogoUniBridge } from '@/components/brand/logo'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { useSidebarStore } from '@/store/sidebar'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { useEffect } from 'react'

const navItems = [
  { name: 'Dashboard', href: '/overview', icon: LayoutDashboard, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Prácticas', href: '/practices', icon: Briefcase, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Estudiantes', href: '/students', icon: GraduationCap, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Empresas', href: '/companies', icon: Building2, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Documentos', href: '/documents', icon: Files, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Certificados', href: '/certificates', icon: FileText, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Actas de Culminación', href: '/completion-records', icon: ClipboardCheck, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Importaciones', href: '/imports', icon: Upload, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Usuarios', href: '/users', icon: UserCheck, roles: ['ADMIN'] },
  { name: 'Firma de Documentos', href: '/signer-dashboard', icon: PenLine, roles: ['SIGNER'] },
  { name: 'Configuraciones', href: '/settings', icon: Settings, roles: ['ADMIN', 'COORDINATOR'] },
]

export function Sidebar() {
  const pathname = usePathname()
  const user = useAuthStore((state) => state.user)
  const { isCollapsed, toggleSidebar, isMobileOpen, closeMobileSidebar } = useSidebarStore()

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
          {/* La marca vive en un solo sitio: antes este SVG estaba escrito a
              mano aquí y en ninguna parte más, así que la pantalla de acceso
              —la primera que ve cualquiera— no tenía logo. */}
          <LogoUniBridge size="sm" />
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
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground/80 hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
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

      {/* La cuenta del usuario (avatar, cambiar contraseña, cerrar sesión)
          vive solo en el topbar (arriba-derecha) — antes este mismo menú
          estaba duplicado aquí abajo. Un solo lugar, siempre visible incluso
          con la sidebar colapsada o cerrada en móvil. */}
      <div className="mt-auto pt-4 flex flex-col gap-2 relative">
        <button
          onClick={toggleSidebar}
          title={isCollapsed ? "Expandir menú" : "Colapsar menú"}
          className="hidden md:flex mx-auto items-center justify-center w-8 h-8 rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827] shadow-sm transition-all"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  )
}
