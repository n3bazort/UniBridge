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
      defaultTheme="system"
      enableSystem
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
