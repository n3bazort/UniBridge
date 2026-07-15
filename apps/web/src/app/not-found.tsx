'use client'

import Link from 'next/link'
import { Search, Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f7f7f8] flex items-center justify-center p-6">
      <div className="max-w-md w-full flex flex-col items-center text-center gap-8">

        {/* Número 404 grande */}
        <div className="relative select-none">
          <span className="text-[160px] font-black text-[#111827] leading-none tracking-tighter opacity-[0.04]">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-white border border-[#eef2f7] shadow-sm flex items-center justify-center">
              <Search className="w-8 h-8 text-[#9ca3af]" strokeWidth={1.5} />
            </div>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-[#111827] mb-2">Página no encontrada</h1>
          <p className="text-[#6b7280] text-sm leading-relaxed">
            La página que buscas no existe o fue movida. Verifica la URL o regresa al inicio.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/overview"
            className="flex items-center gap-2 h-10 px-5 rounded-xl bg-[#111827] text-white text-sm font-medium hover:bg-[#1f2937] transition-colors"
          >
            <Home className="w-4 h-4" />
            Ir al inicio
          </Link>
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 h-10 px-5 rounded-xl border border-[#eef2f7] text-[#374151] text-sm font-medium hover:bg-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
        </div>

      </div>
    </div>
  )
}
