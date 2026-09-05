'use client'

import { useState } from 'react'
import { api } from '@/lib/axios'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  Search, FileText, Download, ShieldCheck, Loader2, FileQuestion, GraduationCap,
} from 'lucide-react'

/* ─────────────── Tipos ─────────────── */

interface DocumentoPublico {
  id: string
  codigo: string | null
  tipo: string | null
  nombre: string
  emitidoEl: string
  firmado: boolean
  firmadoEl: string | null
}

interface Respuesta {
  encontrado: boolean
  estudiante?: { nombre: string; carrera: string | null }
  documentos: DocumentoPublico[]
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })

/**
 * Consulta pública de documentos (RF-27).
 *
 * Vive fuera de `(dashboard)` a propósito: no hay barra lateral, ni sesión, ni
 * nada que suponga que quien entra es del equipo. El estudiante no tiene cuenta
 * en el sistema y este es el único sitio donde alcanza sus propios papeles.
 */
export default function RepositorioPublicoPage() {
  const [dni, setDni] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultado, setResultado] = useState<Respuesta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [descargando, setDescargando] = useState<string | null>(null)

  const cedulaValida = /^\d{10}$/.test(dni)

  const buscar = async () => {
    if (!cedulaValida) return
    setBuscando(true)
    setError(null)
    setResultado(null)
    try {
      const { data } = await api.get<Respuesta>('/public/repository/lookup', { params: { dni } })
      setResultado(data)
    } catch (e: any) {
      setError(
        e?.response?.status === 429
          ? 'Demasiadas consultas seguidas. Espera un minuto y vuelve a intentarlo.'
          : e?.response?.data?.message || 'No se pudo consultar. Inténtalo de nuevo en un momento.',
      )
    } finally {
      setBuscando(false)
    }
  }

  const descargar = async (doc: DocumentoPublico) => {
    setDescargando(doc.id)
    try {
      const { data } = await api.get(`/public/repository/${doc.id}/download`, { params: { dni } })
      window.open(data.url, '_blank', 'noopener')
    } catch {
      setError('No se pudo abrir el documento. Vuelve a buscar tu cédula e inténtalo otra vez.')
    } finally {
      setDescargando(null)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:py-20">
      <div className="mx-auto w-full max-w-2xl">
        <header className="text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <GraduationCap className="h-6 w-6" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">
            Consulta tus documentos de prácticas
          </h1>
          <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-slate-500">
            Escribe tu cédula para ver y descargar los documentos que la Facultad ha emitido
            a tu nombre. No necesitas cuenta.
          </p>
        </header>

        {/* Buscador */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label htmlFor="dni" className="text-[12px] font-semibold text-slate-700">
            Cédula
          </label>
          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="dni"
                inputMode="numeric"
                autoComplete="off"
                value={dni}
                // Solo dígitos y como mucho diez: la cédula no admite otra cosa
                // y corregirlo aquí evita un viaje al servidor para decirlo.
                onChange={(e) => { setDni(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') buscar() }}
                placeholder="1312345678"
                className="w-full pl-9 pr-3 tabular-nums"
              />
            </div>
            <button
              onClick={buscar}
              disabled={!cedulaValida || buscando}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-5 text-[14px] font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar
            </button>
          </div>
          {dni.length > 0 && !cedulaValida && (
            <p className="mt-2 text-[12px] text-slate-500">
              La cédula tiene diez dígitos; llevas {dni.length}.
            </p>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
            {error}
          </p>
        )}

        {/* Resultado */}
        {resultado && (
          resultado.documentos.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <FileQuestion className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-[14px] font-medium text-slate-700">
                No hay documentos disponibles para esa cédula
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-500">
                Puede que todavía no se hayan emitido, o que la cédula esté escrita de otra forma.
                Si crees que debería haber algo, escribe a la coordinación de tu carrera.
              </p>
            </div>
          ) : (
            <section className="mt-6">
              {resultado.estudiante && (
                <div className="mb-3 flex items-baseline justify-between gap-4 px-1">
                  <p className="text-[14px] font-medium text-slate-900">{resultado.estudiante.nombre}</p>
                  {resultado.estudiante.carrera && (
                    <p className="text-[12.5px] text-slate-500">{resultado.estudiante.carrera}</p>
                  )}
                </div>
              )}

              <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {resultado.documentos.map((d) => (
                  <li key={d.id} className="flex items-center gap-4 px-5 py-4">
                    <span className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      d.firmado ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400',
                    )}>
                      <FileText className="h-4.5 w-4.5" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-slate-900">{d.nombre}</p>
                      <p className="mt-0.5 truncate text-[12.5px] text-slate-500">
                        {d.codigo && <span className="tabular-nums">{d.codigo} · </span>}
                        {fecha(d.emitidoEl)}
                      </p>
                      {d.firmado && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-emerald-700">
                          <ShieldCheck className="h-3 w-3" />
                          Firmado electrónicamente
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => descargar(d)}
                      disabled={descargando === d.id}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                    >
                      {descargando === d.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Download className="h-3.5 w-3.5" />}
                      Descargar
                    </button>
                  </li>
                ))}
              </ul>

              <p className="mt-3 px-1 text-[12px] leading-relaxed text-slate-400">
                Solo se muestran los documentos vigentes. Si uno fue anulado y reemplazado,
                aquí aparece la versión que vale.
              </p>
            </section>
          )
        )}
      </div>
    </main>
  )
}
