'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Check, AlertCircle, RotateCcw } from 'lucide-react'
import { api } from '@/lib/axios'
import { usePeriodStore } from '@/store/period'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

interface AcademicPeriod {
  id: string
  code: string
  name: string
  isActive: boolean
}

/**
 * Punto de estado del periodo: abierto o cerrado, sin una sola palabra.
 *
 * Son dos cosas distintas y hasta ahora solo se dibujaba una. El ✓ dice cuál
 * estás MIRANDO; este punto dice cuál está ABIERTO, que es el único donde se
 * puede escribir. Media app depende de esa diferencia («estás viendo 2023-2
 * pero el abierto es 2024-1»), y no se veía por ninguna parte.
 *
 * Relleno + halo = abierto. Anillo hueco = cerrado. La distinción es de FORMA
 * antes que de color: con daltonismo o en escala de grises se sigue leyendo,
 * que es lo que un punto verde a secas no consigue.
 */
function PuntoPeriodo({ abierto }: { abierto: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'h-2 w-2 shrink-0 rounded-full transition-colors',
        abierto
          ? 'bg-success ring-[3px] ring-success/20'
          : 'border-[1.5px] border-muted-foreground/50 bg-transparent',
      )}
    />
  )
}

/**
 * Selector de periodo académico, siempre visible en el topbar — el
 * "workspace" de la app. Cambiar de periodo aquí es lo único que dispara
 * consultas nuevas; las listas (prácticas, certificados, dashboard) leen
 * `selectedPeriod` y lo mandan como filtro server-side, así que nunca
 * traen más de un periodo a la vez.
 *
 * REGLA: este componente NUNCA se oculta.
 *
 * Antes hacía `if (periods.length === 0) return null`, y cuando la consulta
 * fallaba (sesión expirada, API reiniciándose) desaparecía sin dejar rastro:
 * el usuario veía un hueco en el topbar y no tenía forma de saber si estaba
 * roto o si la función se había quitado. Peor aún, sin periodo resuelto las
 * demás consultas quedan bloqueadas y la app entera se ve vacía sin explicar
 * por qué. Ahora el fallo se muestra y se puede reintentar.
 */
export function PeriodSwitcher() {
  const { selectedPeriod, setSelectedPeriod } = usePeriodStore()

  const { data: periods = [], isLoading, isError, refetch, isFetching } = useQuery<AcademicPeriod[]>({
    queryKey: ['academic-periods'],
    queryFn: async () => (await api.get('/academic-periods')).data,
    staleTime: 5 * 60 * 1000, // el catálogo de periodos casi no cambia
  })

  // Primera carga (o localStorage vacío): cae al periodo activo. Si ya no
  // existe (se borró), cae al primero de la lista para no quedar en blanco.
  useEffect(() => {
    if (selectedPeriod || periods.length === 0) return
    const active = periods.find((p) => p.isActive) || periods[0]
    if (active) setSelectedPeriod(active.code)
  }, [periods, selectedPeriod, setSelectedPeriod])

  const current = periods.find((p) => p.code === selectedPeriod)

  // Qué se lee en el botón: el periodo elegido manda (viene de localStorage,
  // así que sobrevive aunque la lista todavía no cargue).
  const etiqueta = selectedPeriod || (isLoading ? 'Cargando…' : isError ? 'Sin periodos' : 'Periodo')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            // Contorno en línea, sin relleno: en el marco de la app un botón
            // macizo compite con las acciones reales de la pantalla.
            'flex items-center gap-1.5 h-9 pl-3 pr-2.5 rounded-lg border bg-transparent text-sm font-medium transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isError
              ? 'border-destructive/40 text-destructive hover:bg-destructive/5'
              : 'border-border text-foreground hover:bg-muted/60',
          )}
          title={
            isError
              ? 'No se pudo cargar la lista de periodos — clic para reintentar'
              : current && !current.isActive
                ? `${current.code} está cerrado: aquí solo se consulta`
                : 'Cambiar de periodo académico'
          }
        >
          {isError && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
          {/* El mismo punto que en la lista: de un vistazo, y sin abrir nada,
              se sabe si el periodo que se está mirando admite escritura. */}
          {!isError && current && <PuntoPeriodo abierto={current.isActive} />}
          <span className={cn('truncate max-w-[110px]', isLoading && !selectedPeriod && 'opacity-60')}>
            {etiqueta}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="bottom" align="start" className="w-64">
        <DropdownMenuLabel>Periodo académico</DropdownMenuLabel>

        {isError && (
          <>
            <div className="px-3 py-2 text-[12px] text-destructive leading-snug">
              No se pudo cargar la lista de periodos.
              {selectedPeriod && (
                <span className="block text-muted-foreground mt-1">
                  Sigues viendo <strong>{selectedPeriod}</strong>.
                </span>
              )}
            </div>
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); refetch() }}>
              <RotateCcw className={cn('h-4 w-4 text-gray-500', isFetching && 'animate-spin')} />
              <span>{isFetching ? 'Reintentando…' : 'Reintentar'}</span>
            </DropdownMenuItem>
          </>
        )}

        {isLoading && (
          <div className="px-3 py-2 text-[12px] text-muted-foreground">Cargando periodos…</div>
        )}

        {!isLoading && !isError && periods.length === 0 && (
          <div className="px-3 py-2 text-[12px] text-muted-foreground leading-snug">
            No hay periodos académicos creados. Créalos en Configuraciones.
          </div>
        )}

        {periods.length > 0 && isError && <DropdownMenuSeparator />}

        {periods.map((p) => {
          const elegido = p.code === selectedPeriod
          return (
            <DropdownMenuItem
              key={p.id}
              onSelect={() => setSelectedPeriod(p.code)}
              className={cn('gap-2.5', elegido && 'bg-accent')}
              // Lo visual manda; esto es solo para el lector de pantalla.
              aria-label={`${p.code}, ${p.name}, ${p.isActive ? 'abierto' : 'cerrado'}`}
            >
              <PuntoPeriodo abierto={p.isActive} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn('truncate', p.isActive ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>
                  {p.code}
                </span>
                <span className="truncate text-[11px] font-normal text-muted-foreground">{p.name}</span>
              </span>
              {elegido && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
