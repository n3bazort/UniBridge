'use client'

import { useAuthStore } from '@/store/auth-store'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { Role } from '@/types/auth'

interface RoleGateProps {
  children: React.ReactNode
  allowedRoles: Role[]
}

export function RoleGate({ children, allowedRoles }: RoleGateProps) {
  const { user, isAuthenticated, _hasHydrated: hasHydrated } = useAuthStore()
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    if (!hasHydrated) return

    if (!isAuthenticated || !user) {
      // Clear the session cookie to prevent infinite redirect loops with middleware if localStorage was cleared
      document.cookie = 'unibridge-session=; path=/; max-age=0; SameSite=Lax'
      router.replace('/login')
      return
    }

    const hasRole = allowedRoles.includes(user.role)
    
    if (!hasRole) {
      // Redirect based on their actual role to prevent infinite loops
      if (user.role === 'SIGNER') {
        if (window.location.pathname !== '/signer-dashboard') router.replace('/signer-dashboard')
      } else {
        if (window.location.pathname !== '/overview') {
          router.replace('/overview')
        } else {
          // Si ya está en overview pero no tiene rol, enviarlo a login para evitar bucles.
          document.cookie = 'unibridge-session=; path=/; max-age=0; SameSite=Lax'
          router.replace('/login')
        }
      }
    } else {
      setIsAuthorized(true)
    }
  }, [isAuthenticated, user, allowedRoles, router, hasHydrated])

  if (isAuthorized === null) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    )
  }

  return <>{children}</>
}
