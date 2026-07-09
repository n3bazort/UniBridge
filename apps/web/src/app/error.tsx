'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Aquí se podría enviar el error a un servicio de monitoring (Sentry, etc.)
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#f7f7f8] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-[24px] border border-[#eef2f7] shadow-sm p-10 flex flex-col items-center text-center gap-6">
        <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-rose-500" />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-[#111827] mb-2">Algo salió mal</h1>
          <p className="text-[#6b7280] text-sm leading-relaxed">
            Ocurrió un error inesperado. Si el problema persiste, por favor contacta al administrador del sistema.
          </p>
          {error.digest && (
            <p className="text-[11px] text-[#9ca3af] mt-3 font-mono bg-slate-50 px-3 py-1 rounded-full inline-block">
              Código: {error.digest}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 w-full">
          <button
            onClick={reset}
            className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-[#111827] text-white text-sm font-medium hover:bg-[#1f2937] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reintentar
          </button>
          <Link
            href="/overview"
            className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border border-[#eef2f7] text-[#374151] text-sm font-medium hover:bg-[#f9fafb] transition-colors"
          >
            <Home className="w-4 h-4" />
            Inicio
          </Link>
        </div>
      </div>
    </div>
  )
}
