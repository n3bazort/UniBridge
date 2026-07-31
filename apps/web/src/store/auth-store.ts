import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, AuthTokens } from '@/types/auth'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  _hasHydrated: boolean
  setHasHydrated: (state: boolean) => void
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
      _hasHydrated: false,
      setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),
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
      logout: () => {
        if (typeof document !== 'undefined') {
          document.cookie = 'unibridge-session=; path=/; max-age=0; SameSite=Lax'
        }
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
      },
    }),
    {
      name: 'ppp-auth-storage',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
