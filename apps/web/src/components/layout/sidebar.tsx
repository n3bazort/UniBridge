'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Briefcase, Building2, FileText, Settings, LogOut, Upload, BookOpen, Files, BarChart3, ChevronLeft, ChevronRight, GraduationCap, PenLine, UserCheck, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { useAuth } from '@/hooks/use-auth'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { useSidebarStore } from '@/store/sidebar'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { ChangePasswordModal } from '@/components/auth/ChangePasswordModal'
import { useState, useRef, useEffect } from 'react'

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
  const { isCollapsed, toggleSidebar } = useSidebarStore()
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isUserMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isUserMenuOpen])

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
      "fixed inset-y-0 left-0 z-20 flex flex-col bg-[#fafafa] border-r border-[#f0f0f0] pt-[24px] pb-[24px] transition-all duration-300 ease-in-out",
      isCollapsed ? "w-[80px] px-[12px]" : "w-[240px] px-[16px]"
    )}>
      <div className={cn("flex h-12 items-center mb-4", isCollapsed ? "justify-center px-0" : "px-4")}>
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#2563eb] text-white shadow-soft">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
              <path d="M3 20V6m18 14V6" />
              <path d="M2 13Q3.5 8 4 6Q12 16 20 6Q20.5 8 22 13" strokeWidth="1.6" />
              <path d="M2 17h20" />
              <path d="M8 11.5v5.5m8-5.5v5.5m-4 0v-3.5" strokeWidth="1.2" />
            </svg>
          </div>
          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="text-[14px] font-semibold text-[#111827] leading-tight truncate">UniBridge</span>
              <span className="text-[12px] font-medium text-[#6b7280] leading-tight truncate">Plataforma PPP</span>
            </div>
          )}
        </Link>
      </div>
      
      <div className="flex-1 overflow-y-auto overflow-x-hidden mt-2 space-y-[4px] no-scrollbar">
        <nav className="grid items-start">
          {filteredNav.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={isCollapsed ? item.name : undefined}
                className={cn(
                  "group flex items-center rounded-[12px] py-2.5 transition-all duration-180 ease-[cubic-bezier(.2,.8,.2,1)]",
                  isCollapsed ? "justify-center px-0 relative" : "gap-3 px-4",
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
                {!isCollapsed && <span className="text-[14px] font-medium truncate">{item.name}</span>}
                {item.name === 'Configuraciones' && missingCount > 0 && (
                  <span className={cn(
                    "flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm",
                    isCollapsed 
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

      <div className="mt-auto pt-4 flex flex-col gap-2 relative" ref={userMenuRef}>
        {/* Desplegable de usuario */}
        {isUserMenuOpen && (
          <div className={cn(
            "absolute bottom-full mb-2 z-50 rounded-xl border border-gray-200 bg-white p-2 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-150",
            isCollapsed ? "left-12 w-56" : "left-0 right-0 w-full"
          )}>
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

            <button
              type="button"
              onClick={() => { setIsUserMenuOpen(false); setShowPasswordModal(true) }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Lock className="h-4 w-4 text-gray-500" />
              <span>Cambiar contraseña</span>
            </button>

            <button
              type="button"
              onClick={() => { setIsUserMenuOpen(false); logout() }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <LogOut className="h-4 w-4 text-rose-600" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        )}

        {/* User Card Button */}
        <button
          type="button"
          onClick={() => setIsUserMenuOpen((prev) => !prev)}
          className={cn(
            "flex items-center rounded-xl p-2 text-left hover:bg-[#f3f4f6] transition-all select-none group border border-transparent hover:border-gray-200/60 cursor-pointer",
            isCollapsed ? "justify-center" : "justify-between"
          )}
        >
          <div className={cn("flex items-center gap-3 min-w-0 flex-1", isCollapsed && "justify-center")}>
            <img src={`https://api.dicebear.com/9.x/notionists/svg?seed=${avatarSeed}`} alt="Avatar" className="w-9 h-9 rounded-full bg-white shadow-soft shrink-0" />
            {!isCollapsed && (
              <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                <span className="text-[13px] font-medium text-[#111827] leading-tight truncate block">{userName}</span>
                <span className="text-[12px] text-[#6b7280] leading-tight truncate block">{userRole}</span>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <div className="text-gray-400 group-hover:text-gray-700 transition-colors shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("transition-transform duration-200", isUserMenuOpen && "rotate-180")}>
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
            </div>
          )}
        </button>

        {/* Toggle Button */}
        <button
          onClick={toggleSidebar}
          title={isCollapsed ? "Expandir menú" : "Colapsar menú"}
          className="mt-1 mx-auto flex items-center justify-center w-8 h-8 rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827] shadow-sm transition-all"
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
