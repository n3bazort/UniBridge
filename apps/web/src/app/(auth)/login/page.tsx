'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useAuthStore } from '@/store/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const loginSchema = z.object({
  email: z.string().email('Ingresa un correo electrónico válido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export default function LoginPage() {
  const { login, isLoading, error } = useAuth()
  const { isAuthenticated, user } = useAuthStore()
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    // Check if the session cookie actually exists to avoid stale localStorage loop
    const hasCookie = document.cookie.includes('unibridge-session=')

    if (isAuthenticated && user && hasCookie) {
      if (user.role === 'ADMIN') {
        router.replace('/overview')
      } else if (user.role === 'COORDINATOR') {
        router.replace('/students')
      } else if (user.role === 'SIGNER') {
        router.replace('/signer-dashboard')
      } else {
        router.replace('/student-dashboard')
      }
    } else if (isAuthenticated && !hasCookie) {
      // Stale Zustand state without valid cookie: clear it
      useAuthStore.getState().logout()
    }
  }, [isAuthenticated, user, router])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = async (data: LoginFormValues) => {
    try {
      await login(data.email, data.password)
    } catch (e) {
      // Error is handled by the hook
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-background p-8 shadow-lg border border-border">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight">UniBridge</h2>
          <p className="text-sm text-muted-foreground mt-2">Ingresa a tu cuenta para continuar</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 text-sm font-medium text-red-700 bg-red-50 rounded-md border border-red-200">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{error}</span>
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="email">Correo Electrónico</Label>
            <Input 
              id="email"
              type="email" 
              placeholder="juan@uleam.edu.ec" 
              {...register('email')}
              className={errors.email ? 'border-destructive focus-visible:ring-destructive' : ''}
              disabled={isLoading}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                {...register('password')}
                className={`pr-10 ${errors.password ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
            <p className="text-right">
              <a href="/forgot-password" className="text-xs text-muted-foreground underline hover:text-foreground">
                ¿Olvidaste tu contraseña?
              </a>
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Iniciando...
              </span>
            ) : (
              'Iniciar Sesión'
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
