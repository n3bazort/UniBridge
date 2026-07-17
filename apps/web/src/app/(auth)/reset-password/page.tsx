'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { toast } from 'sonner'

function ResetPasswordForm() {
  const router = useRouter()
  const token = useSearchParams().get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/auth/reset-password', { token, password })
      toast.success(data.message)
      router.push('/login')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'No se pudo restablecer la contraseña')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="text-center space-y-3">
        <h2 className="text-xl font-bold">Enlace incompleto</h2>
        <p className="text-sm text-muted-foreground">Este enlace no contiene el código de recuperación.</p>
        <Link href="/forgot-password" className="text-sm underline">Solicitar uno nuevo</Link>
      </div>
    )
  }

  return (
    <>
      <div className="text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
          <KeyRound className="w-6 h-6 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Nueva contraseña</h2>
        <p className="text-sm text-muted-foreground mt-2">Crea una contraseña de al menos 8 caracteres.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Nueva contraseña</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              tabIndex={-1}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmar contraseña</Label>
          <Input
            id="confirm"
            type={showPassword ? 'text' : 'password'}
            required
            minLength={8}
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={loading}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading || password.length < 8}>
          {loading ? 'Guardando…' : 'Guardar nueva contraseña'}
        </Button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl bg-background p-8 shadow-lg border border-border">
        <Suspense fallback={<p className="text-center text-sm text-muted-foreground">Cargando…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
