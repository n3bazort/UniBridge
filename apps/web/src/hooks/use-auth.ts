import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth-store'
import { api } from '@/lib/axios'
import type { LoginResponse } from '@/types/auth'

/** Escribe una cookie ligera que lee el middleware.ts de Next.js para proteger rutas SSR */
function setSessionCookie(role: string, isAuthenticated: boolean) {
  const value = encodeURIComponent(JSON.stringify({ isAuthenticated, role }))
  // SameSite=Lax protege contra CSRF, HttpOnly=false porque el middleware Edge runtime sí puede leerla
  document.cookie = `unibridge-session=${value}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`
}

function clearSessionCookie() {
  document.cookie = 'unibridge-session=; path=/; max-age=0; SameSite=Lax'
}

export function useAuth() {
  const router = useRouter()
  const { setAuth, logout: zustandLogout, refreshToken } = useAuthStore()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = async (email: string, password: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', { email, password })
      
      // Actualizar store global de Zustand
      setAuth(data.user, {
        accessToken: (data as any).access_token || data.accessToken,
        refreshToken: (data as any).refresh_token || data.refreshToken
      })

      // Escribir cookie de sesión para el middleware de Next.js
      setSessionCookie(data.user.role, true)

      // Redirección basada en rol
      if (data.user.role === 'ADMIN') {
        router.replace('/overview')
      } else if (data.user.role === 'COORDINATOR') {
        router.replace('/students')
      } else if (data.user.role === 'SIGNER') {
        router.replace('/signer-dashboard')
      } else {
        router.replace('/student-dashboard')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al iniciar sesión. Verifica tus credenciales.')
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refresh_token: refreshToken }).catch(() => {})
      }
    } finally {
      // Limpiar store y cookie de sesión
      zustandLogout()
      clearSessionCookie()
      router.replace('/login')
    }
  }

  return {
    login,
    logout,
    isLoading,
    error
  }
}
