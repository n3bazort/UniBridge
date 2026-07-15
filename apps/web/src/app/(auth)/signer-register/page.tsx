'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/axios'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function SignerRegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [validating, setValidating] = useState(true)
  const [invalid, setInvalid] = useState<string | null>(null)
  const [signerRole, setSignerRole] = useState<'DEAN' | 'DIRECTOR' | null>(null)
  const [emailLocked, setEmailLocked] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', confirm: '', fullName: '', title: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (!token) {
      setInvalid('Falta el token de invitación en el enlace.')
      setValidating(false)
      return
    }
    api.get('/signatures/invitations/validate', { params: { token } })
      .then(({ data }) => {
        setSignerRole(data.signerRole)
        if (data.email) {
          setForm((f) => ({ ...f, email: data.email }))
          setEmailLocked(true)
        }
        if (data.fullName) setForm((f) => ({ ...f, fullName: data.fullName }))
      })
      .catch((err) => setInvalid(err.response?.data?.message || 'Invitación no válida o expirada.'))
      .finally(() => setValidating(false))
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (form.password !== form.confirm) {
      setFormError('Las contraseñas no coinciden')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/signatures/register', {
        token,
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        title: form.title || undefined,
      })
      toast.success('Registro completado. Inicia sesión con tus credenciales.')
      router.replace('/login')
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Error al completar el registro')
    } finally {
      setSubmitting(false)
    }
  }

  if (validating) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground animate-pulse">Validando invitación...</p>
      </div>
    )
  }

  if (invalid) {
    return (
      <div className="text-center py-4">
        <p className="text-base font-semibold">Invitación no válida</p>
        <p className="text-sm text-muted-foreground mt-2">{invalid}</p>
        <p className="text-sm text-muted-foreground mt-4">Solicita un nuevo enlace al administrador de UniBridge.</p>
      </div>
    )
  }

  return (
    <>
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">UniBridge</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Registro de firmante · Invitación válida como{' '}
          <span className="font-semibold text-foreground">{signerRole === 'DEAN' ? 'Decano' : 'Director'}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div className="p-3 text-sm text-destructive-foreground bg-destructive/10 rounded-md border border-destructive/20">
            {formError}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Correo Electrónico</Label>
          <Input
            id="email"
            type="email"
            required
            disabled={emailLocked || submitting}
            placeholder="decano@uleam.edu.ec"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="fullName">Nombre Completo</Label>
          <Input
            id="fullName"
            required
            disabled={submitting}
            placeholder="Dr. Nombre Apellido"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Cargo (opcional)</Label>
          <Input
            id="title"
            disabled={submitting}
            placeholder="Decano de la Facultad de..."
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                disabled={submitting}
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="pr-9"
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar</Label>
            <Input
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              disabled={submitting}
              placeholder="••••••••"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            />
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Registrando...
            </span>
          ) : (
            'Completar Registro'
          )}
        </Button>
      </form>
    </>
  )
}

export default function SignerRegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-background p-8 shadow-lg border border-border">
        <Suspense fallback={<p className="text-sm text-muted-foreground text-center">Cargando...</p>}>
          <SignerRegisterForm />
        </Suspense>
      </div>
    </div>
  )
}
