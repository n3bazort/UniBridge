import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Rutas que requieren autenticación y el rol mínimo para acceder.
 * El middleware protege estas rutas ANTES de que el componente se renderice,
 * eliminando el flash de contenido no autorizado que ocurre con useEffect.
 */
const PROTECTED_ROUTES: { path: string; roles: string[] }[] = [
  { path: '/overview', roles: ['ADMIN', 'COORDINATOR'] },
  { path: '/practices', roles: ['ADMIN', 'COORDINATOR'] },
  { path: '/students', roles: ['ADMIN', 'COORDINATOR'] },
  { path: '/companies', roles: ['ADMIN', 'COORDINATOR'] },
  { path: '/documents', roles: ['ADMIN', 'COORDINATOR'] },
  { path: '/certificates', roles: ['ADMIN', 'COORDINATOR'] },
  { path: '/imports', roles: ['ADMIN', 'COORDINATOR'] },
  { path: '/settings', roles: ['ADMIN', 'COORDINATOR'] },
  { path: '/student-dashboard', roles: ['STUDENT'] },
  { path: '/signer-dashboard', roles: ['SIGNER'] },
  { path: '/signers', roles: ['ADMIN'] },
]

/** Rutas públicas que nunca redirigen */
const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/signer-register']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Ignorar rutas internas de Next.js y archivos estáticos
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // archivos estáticos (favicon.ico, etc.)
  ) {
    return NextResponse.next()
  }

  // Leer el estado de autenticación del localStorage (persistido por Zustand)
  // Next.js middleware no tiene acceso a localStorage, pero sí a cookies.
  // Para esta arquitectura, usamos una cookie ligera de sesión que se sincroniza al login.
  const authCookie = request.cookies.get('unibridge-session')

  let isAuthenticated = false
  let userRole: string | null = null

  if (authCookie?.value) {
    try {
      const session = JSON.parse(decodeURIComponent(authCookie.value))
      isAuthenticated = !!session.isAuthenticated
      userRole = session.role ?? null
    } catch {
      // Cookie malformada — tratamos como no autenticado
      isAuthenticated = false
    }
  }

  // Si ya está autenticado y trata de ir a login → redirigir al dashboard
  if (isAuthenticated && PUBLIC_ROUTES.includes(pathname)) {
    const destination = userRole === 'STUDENT'
      ? '/student-dashboard'
      : userRole === 'SIGNER'
        ? '/signer-dashboard'
        : '/overview'
    return NextResponse.redirect(new URL(destination, request.url))
  }

  // Verificar si la ruta actual requiere protección
  const matchedRoute = PROTECTED_ROUTES.find((r) => pathname.startsWith(r.path))

  if (matchedRoute) {
    // No autenticado → ir a login
    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Autenticado pero sin el rol correcto → 403
    if (userRole && !matchedRoute.roles.includes(userRole)) {
      const destination = userRole === 'STUDENT'
        ? '/student-dashboard'
        : userRole === 'SIGNER'
          ? '/signer-dashboard'
          : '/overview'
      return NextResponse.redirect(new URL(destination, request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Coincide con todas las rutas excepto:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
