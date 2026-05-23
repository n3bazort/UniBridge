'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Briefcase, Building2, FileText, Settings, LogOut, Upload, BookOpen, Files, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useAuth } from '@/hooks/use-auth'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { useSidebarStore } from '@/store/sidebar'

const navItems = [
  { name: 'Dashboard', href: '/overview', icon: LayoutDashboard, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Prácticas', href: '/practices', icon: Briefcase, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Estudiantes', href: '/students', icon: Users, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Empresas', href: '/companies', icon: Building2, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Documentos', href: '/documents', icon: Files, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Reportes', href: '/reports', icon: BarChart3, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Configuración', href: '/settings', icon: Settings, roles: ['ADMIN'] },
]

export function Sidebar() {
  const pathname = usePathname()
  const user = useAuthStore((state) => state.user)
  const { logout } = useAuth()
  const { isCollapsed, toggleSidebar } = useSidebarStore()

  // Use all items for development if user is not fully populated, or filter
  const filteredNav = navItems.filter(item => 
    !user?.role || item.roles.includes(user.role)
  )

  return (
    <aside className={cn(
      "fixed inset-y-0 left-0 z-20 flex flex-col bg-[#fafafa] border-r border-[#f0f0f0] pt-[24px] pb-[24px] transition-all duration-300 ease-in-out",
      isCollapsed ? "w-[80px] px-[12px]" : "w-[240px] px-[16px]"
    )}>
      <div className={cn("flex h-12 items-center mb-4", isCollapsed ? "justify-center px-0" : "px-4")}>
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#2563eb] text-white shadow-soft">
            <BookOpen className="h-4 w-4" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="text-[14px] font-semibold text-[#111827] leading-tight truncate">Prácticas</span>
              <span className="text-[12px] font-medium text-[#6b7280] leading-tight truncate">Universidad</span>
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
                  isCollapsed ? "justify-center px-0" : "gap-3 px-4",
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
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="mt-auto pt-4 flex flex-col gap-2">
        <div className={cn("flex items-center", isCollapsed ? "justify-center px-0" : "justify-between px-2")}>
          <div className={cn("flex items-center gap-3", isCollapsed && "justify-center")}>
             <img src="https://api.dicebear.com/9.x/notionists/svg?seed=Maria" alt="Avatar" className="w-9 h-9 rounded-full bg-white shadow-soft shrink-0" />
             {!isCollapsed && (
               <div className="flex flex-col overflow-hidden">
                  <span className="text-[13px] font-medium text-[#111827] leading-tight truncate">María Fernanda</span>
                  <span className="text-[12px] text-[#6b7280] leading-tight truncate">Coordinadora</span>
               </div>
             )}
          </div>
          {!isCollapsed && (
            <button
              onClick={logout}
              title="Cerrar sesión"
              className="p-2 text-[#6b7280] hover:bg-[#f3f4f6] hover:text-red-500 rounded-[10px] transition-all shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Toggle Button */}
        <button
          onClick={toggleSidebar}
          className="mt-2 mx-auto flex items-center justify-center w-8 h-8 rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827] shadow-sm transition-all"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {isCollapsed && (
          <button
            onClick={logout}
            title="Cerrar sesión"
            className="mt-2 mx-auto flex items-center justify-center w-8 h-8 rounded-full bg-white text-[#6b7280] hover:bg-red-50 hover:text-red-500 transition-all"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  )
}
