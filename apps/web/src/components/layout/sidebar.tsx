'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, BookOpen, Building2, Upload, FileText, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useAuth } from '@/hooks/use-auth'

const navItems = [
  { name: 'Dashboard', href: '/overview', icon: LayoutDashboard, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Mi Práctica', href: '/student-dashboard', icon: LayoutDashboard, roles: ['STUDENT'] },
  { name: 'Estudiantes', href: '/students', icon: Users, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Empresas', href: '/companies', icon: Building2, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Prácticas', href: '/practices', icon: BookOpen, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Importaciones', href: '/imports', icon: Upload, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Documentos', href: '/documents', icon: FileText, roles: ['ADMIN', 'COORDINATOR'] },
  { name: 'Configuración', href: '/settings', icon: Settings, roles: ['ADMIN'] },
]

export function Sidebar() {
  const pathname = usePathname()
  const user = useAuthStore((state) => state.user)
  const { logout } = useAuth()

  const filteredNav = navItems.filter(item => 
    user?.role && item.roles.includes(user.role)
  )

  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-14 flex-col border-r bg-background sm:flex md:w-64">
      <div className="flex h-14 items-center border-b px-4 lg:h-[60px]">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <div className="h-6 w-6 rounded-sm bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">P</div>
          <span className="hidden md:block">Sistema PPP</span>
        </Link>
      </div>
      
      <div className="flex-1 overflow-auto py-2">
        <nav className="grid items-start px-2 text-sm font-medium">
          {filteredNav.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 transition-all",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="hidden md:block">{item.name}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="mt-auto p-4 border-t">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden md:block">Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  )
}
