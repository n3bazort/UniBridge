'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { queryClient } from '@/lib/query-client'
import { useAuthStore } from '@/store/auth-store'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      // Fijado en claro: los tokens .dark existen en globals.css pero casi
      // ningún componente los consume todavía (sin variantes dark: reales),
      // y no hay selector de tema en la UI. Con "system" activo, cualquier
      // usuario con el SO en oscuro veía una interfaz a medio pintar. Migrar
      // los ~34 archivos con colores hardcodeados es un trabajo aparte;
      // hasta entonces, una sola apariencia consistente es mejor que una rota.
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {children}
        {/* 6s: da tiempo real a leer el mensaje completo (códigos de lote,
            nombres de estudiantes) antes de que desaparezca */}
        <Toaster richColors position="top-right" duration={6000} closeButton />
      </QueryClientProvider>
    </NextThemesProvider>
  )
}
