'use client'

import { useAuthStore } from '@/store/auth-store'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { useSidebarStore } from '@/store/sidebar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const hasHydrated = useAuthStore((state) => state._hasHydrated)
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const { isCollapsed, isMobileOpen, closeMobileSidebar } = useSidebarStore()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!hasHydrated || !mounted) return
    
    if (!isAuthenticated) {
      // Clear cookie to break middleware infinite loops
      document.cookie = 'unibridge-session=; path=/; max-age=0; SameSite=Lax'
      router.replace('/login')
    }
  }, [isAuthenticated, router, hasHydrated, mounted])

  if (!mounted || !hasHydrated || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    )
  }

  /* ─────────────────────────────────────────────────────
     Layout structure (CSS Grid):
     
     ┌──────────┬──────────────────────────┐
     │          │  TOPBAR (fixed h-14)     │
     │ SIDEBAR  ├──────────────────────────┤
     │ (fixed)  │  MAIN CONTENT            │
     │          │  (scrollable)            │
     └──────────┴──────────────────────────┘

     - Sidebar is position:fixed, pushes content via grid column
     - Right column uses a simple flex-col: topbar then main
     - Topbar is NOT sticky/fixed — it's just the first child in flex-col
       so it never overlaps or floats incorrectly
     ───────────────────────────────────────────────────── */
  return (
    <div className="h-screen overflow-hidden bg-[#f7f7f8]">
      {/* Sidebar — fixed, out of flow */}
      <Sidebar />

      {/* Mobile overlay */}
      {isMobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú de navegación"
          onClick={closeMobileSidebar}
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[1px] md:hidden"
        />
      )}

      {/* Main content area — offset by sidebar width */}
      <div
        className="flex flex-col h-screen transition-all duration-300 ease-in-out"
        style={{ marginLeft: 'var(--sidebar-w)' }}
      >
        {/* Topbar: simple block element, no sticky/fixed needed */}
        <Topbar />

        {/* Page content: fills remaining height, scrolls internally */}
        <main className="flex-1 min-h-0 w-full relative overflow-auto">
          {children}
        </main>
      </div>

      {/* CSS custom property for sidebar width, driven by state */}
      <style>{`
        :root {
          --sidebar-w: ${isCollapsed ? '80px' : '240px'};
        }
        @media (max-width: 767px) {
          :root {
            --sidebar-w: 0px;
          }
        }
      `}</style>
    </div>
  )
}
