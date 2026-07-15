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
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const { isCollapsed } = useSidebarStore()

  useEffect(() => {
    setMounted(true)
    if (mounted && !isAuthenticated) {
      router.replace('/login')
    }
  }, [isAuthenticated, router, mounted])

  if (!mounted || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#f7f7f8]">
      <Sidebar />
      <div className={`flex flex-1 flex-col transition-all duration-300 ease-in-out ${isCollapsed ? 'pl-[80px]' : 'pl-[60px] md:pl-[240px]'}`}>
        <Topbar />
        <main className="flex-1 w-full relative">
          {children}
        </main>
      </div>
    </div>
  )
}
