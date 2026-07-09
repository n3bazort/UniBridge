import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, AuthTokens } from '@/types/auth'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  setAuth: (user: User, tokens: AuthTokens) => void
  updateTokens: (tokens: AuthTokens) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, tokens) =>
        set({ 
          user, 
          accessToken: tokens.accessToken, 
          refreshToken: tokens.refreshToken, 
          isAuthenticated: true 
        }),
      updateTokens: (tokens) =>
        set({ 
          accessToken: tokens.accessToken, 
          refreshToken: tokens.refreshToken 
        }),
      logout: () => set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
    }),
    {
      name: 'ppp-auth-storage',
    }
  )
)
