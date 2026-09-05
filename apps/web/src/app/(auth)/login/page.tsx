'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { AlertCircle, Eye, EyeOff, FileCheck2, Loader2, PenLine, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useAuthStore } from '@/store/auth-store'
import { Button } from '@/components/ui/button'
import { FloatingInput } from '@/components/ui/floating-input'
import { LogoUniBridge, LogoMarca } from '@/components/brand/logo'

const loginSchema = z.object({
  email: z.string().email('Ingresa un correo electrónico válido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export default function LoginPage() {
  const { login, isLoading, error } = useAuth()
  const { isAuthenticated, user, _hasHydrated: hasHydrated } = useAuthStore()
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (!hasHydrated) return
    if (isAuthenticated && user) {
      if (user.role === 'ADMIN') router.replace('/overview')
      else if (user.role === 'COORDINATOR') router.replace('/students')
      else if (user.role === 'SIGNER') router.replace('/signer-dashboard')
    }
  }, [isAuthenticated, user, router, hasHydrated])

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (data: LoginFormValues) => {
    try {
      await login(data.email, data.password)
    } catch {
      // El hook ya expone el error
    }
  }

  return (
    /* Dos mitades: a la izquierda el trámite, a la derecha la marca.
       En pantallas estrechas la mitad de marca desaparece del todo en vez de
       apilarse: en un móvil, media pantalla de decoración empuja el formulario
       fuera de la vista y obliga a desplazarse para poder escribir. */
    <div className="flex h-screen overflow-hidden bg-app p-0 lg:p-4 xl:p-6">
      <div className="flex h-full w-full overflow-hidden rounded-none bg-card lg:rounded-2xl lg:border lg:border-border lg:shadow-sm">

        {/* ───────── Izquierda · Acceso ───────── */}
        <div className="flex w-full flex-col justify-center overflow-y-auto px-6 py-10 sm:px-12 lg:w-[46%] lg:px-10 xl:px-16 [@media(min-height:800px)]:py-14">
          <div className="mx-auto w-full max-w-sm">

            <div className="flex flex-col items-center text-center">
              <LogoUniBridge size="md" className="[@media(min-height:800px)]:h-14 [@media(min-height:800px)]:w-14" />
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground xl:text-3xl">UniBridge</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Prácticas preprofesionales · ULEAM
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-7 flex flex-col gap-4 [@media(min-height:800px)]:mt-9 [@media(min-height:800px)]:gap-5">
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <FloatingInput
                id="email"
                type="email"
                label="Correo institucional"
                hint="nombre@uleam.edu.ec"
                autoComplete="username"
                disabled={isLoading}
                error={errors.email?.message}
                {...register('email')}
              />

              <div className="relative">
                <FloatingInput
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  label="Contraseña"
                  autoComplete="current-password"
                  disabled={isLoading}
                  error={errors.password?.message}
                  className="pr-11"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 top-6 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <Button type="submit" className="h-11 w-full text-sm" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando…
                  </>
                ) : (
                  'Entrar'
                )}
              </Button>
            </form>

            {/* Un sistema cerrado no ofrece «regístrate», ni acceso con Google,
                ni recuperación por correo: las cuentas las crea la coordinación
                y no hay autoservicio. Se dice, en vez de dejar al usuario
                buscando un enlace que no existe. */}
            <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
              El acceso lo otorga la coordinación de la carrera.
              <br />
              Si no puedes entrar, solicita el restablecimiento al administrador.
            </p>
          </div>
        </div>

        {/* ───────── Derecha · Marca ───────── */}
        {/* El panel azul es una pieza en sí: va separado del borde de la
            tarjeta, redondeado por sus cuatro esquinas y con una sombra que lo
            despega del fondo. Pegado a los bordes se leía como el fondo de la
            página, no como un elemento. */}
        <div className="relative m-3 hidden w-[54%] overflow-hidden rounded-2xl bg-primary shadow-md lg:flex lg:flex-col lg:justify-center">
          {/* Trama de fondo: el propio puente, muy tenue y a gran escala.
              Es el motivo de la marca haciendo de textura, no un adorno
              genérico traído de fuera. */}
          <LogoMarca className="pointer-events-none absolute -right-24 -top-20 h-[28rem] w-[28rem] text-primary-foreground/[0.07]" />
          <LogoMarca className="pointer-events-none absolute -bottom-32 -left-24 h-[24rem] w-[24rem] text-primary-foreground/[0.05]" />

          <div className="relative z-10 flex flex-col gap-6 px-10 py-10 xl:gap-8 xl:px-16 [@media(min-height:800px)]:gap-10 [@media(min-height:800px)]:py-14">
            <div className="flex flex-col gap-4">
              <h2 className="max-w-[18ch] text-[clamp(1.6rem,1.1rem+1.4vw,2.5rem)] font-semibold leading-[1.15] tracking-tight text-primary-foreground">
                Del primer oficio al certificado firmado.
              </h2>
              <p className="max-w-[46ch] text-sm leading-relaxed text-primary-foreground/75 xl:text-base">
                Expedientes de prácticas preprofesionales con numeración oficial, firma
                electrónica de las autoridades y trazabilidad de cada cambio.
              </p>
            </div>

            {/* Hueco reservado para la ilustración que vas a enviar. Mantiene la
                proporción para que al colocarla no salte el resto del panel. */}
            <div
              className="flex aspect-[16/10] max-h-[34vh] w-full max-w-xl items-center justify-center rounded-2xl border border-dashed border-primary-foreground/20 bg-primary-foreground/[0.04]"
              aria-hidden="true"
            >
              <span className="text-xs font-medium text-primary-foreground/40">
                Ilustración
              </span>
            </div>

            <ul className="hidden flex-col gap-3 [@media(min-height:860px)]:flex">
              {[
                { icono: FileCheck2, texto: 'Solicitud, designación y certificado con numeración correlativa' },
                { icono: PenLine, texto: 'Firma electrónica del Responsable y del Decano, verificada al recibirla' },
                { icono: ShieldCheck, texto: 'Cada reasignación y cada baja quedan registradas con su motivo y su autor' },
              ].map(({ icono: Icono, texto }) => (
                <li key={texto} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-foreground/10">
                    <Icono className="h-3.5 w-3.5 text-primary-foreground/80" />
                  </span>
                  <span className="max-w-[44ch] text-sm leading-relaxed text-primary-foreground/75">{texto}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
