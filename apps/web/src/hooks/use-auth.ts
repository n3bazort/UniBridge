import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { api } from '@/lib/axios'
import type { LoginResponse } from '@/types/auth'

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
      
      // Update global store
      setAuth(data.user, {
        accessToken: (data as any).access_token || data.accessToken,
        refreshToken: (data as any).refresh_token || data.refreshToken
      })

      // Role-based redirects
      if (data.user.role === 'ADMIN') {
        router.push('/overview')
      } else if (data.user.role === 'COORDINATOR') {
        router.push('/students') // Default coordinator view
      } else {
        router.push('/practices') // Default student view
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
        // Attempt to revoke the token in the backend
        await api.post('/auth/logout', { refresh_token: refreshToken }).catch(() => {})
      }
    } finally {
      // Always clear local state even if backend request fails
      zustandLogout()
      router.push('/login')
    }
  }

  return {
    login,
    logout,
    isLoading,
    error
  }
}
