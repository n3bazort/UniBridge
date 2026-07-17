'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MailCheck, Copy } from 'lucide-react'
import { toast } from 'sonner'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [devLink, setDevLink] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/auth/forgot-password', { email })
      setSent(true)
      // Solo aparece en desarrollo, cuando no hay servidor de correo configurado
      setDevLink(data.devLink || null)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'No se pudo procesar la solicitud')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl bg-background p-8 shadow-lg border border-border">
        {!sent ? (
          <>
            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-tight">Recuperar contraseña</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Escribe tu correo institucional y te enviaremos un enlace para crear una nueva.
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="tu.correo@live.uleam.edu.ec"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !email.includes('@')}>
                {loading ? 'Enviando…' : 'Enviar enlace de recuperación'}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="underline hover:text-foreground">Volver a iniciar sesión</Link>
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <MailCheck className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Revisa tu correo</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Si <span className="font-medium text-foreground">{email}</span> está registrado,
                recibirás un enlace válido por 1 hora para restablecer tu contraseña.
              </p>
            </div>

            {devLink && (
              <div className="w-full text-left bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wide mb-1.5">
                  Modo desarrollo (sin servidor de correo)
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[11px] text-amber-900 break-all leading-snug">{devLink}</code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(devLink); toast.success('Enlace copiado') }}
                    className="p-1.5 rounded-md bg-white border border-amber-200 text-amber-700 hover:bg-amber-100 shrink-0"
                    title="Copiar enlace"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            <Link href="/login" className="text-sm underline text-muted-foreground hover:text-foreground">
              Volver a iniciar sesión
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
