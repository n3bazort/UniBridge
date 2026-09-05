'use client'

import { useQuery } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { api } from '@/lib/axios'
import { usePeriodStore } from '@/store/period'

interface AcademicPeriod {
  id: string
  code: string
  isActive: boolean
}

/**
 * Aviso global de período cerrado.
 *
 * El selector del topbar gobierna lo que se VE; el período activo gobierna lo
 * que se puede ESCRIBIR. Mirando un semestre cerrado, el dashboard entero pasa
 * a consulta — y hay que decirlo una vez, arriba y en todas las pantallas, no
 * repetirlo pantalla por pantalla ni dejar que el usuario lo descubra pulsando
 * un botón que el servidor va a rechazar.
 *
 * Vive en el layout y no en cada página por eso mismo: la regla es del sistema,
 * no de una pantalla concreta.
 */
export function AvisoPeriodoCerrado() {
  const { selectedPeriod } = usePeriodStore()

  const { data: periodos = [] } = useQuery<AcademicPeriod[]>({
    queryKey: ['academic-periods'],
    queryFn: async () => (await api.get('/academic-periods')).data,
    staleTime: 5 * 60 * 1000,
  })

  const periodoActivo = periodos.find((p) => p.isActive) ?? null
  const cerrado = !!selectedPeriod && !!periodoActivo && selectedPeriod !== periodoActivo.code

  if (!cerrado) return null

  return (
    <div className="w-full border-b border-warning/25 bg-warning/10">
      <div className="mx-auto flex max-w-[1600px] items-center gap-2.5 px-6 py-2.5 sm:px-8 lg:px-12">
        <Lock className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        <p className="text-sm text-foreground">
          Estás viendo <strong>{selectedPeriod}</strong>, un período cerrado: aquí solo se consulta.
          Para registrar o modificar, cambia a <strong>{periodoActivo?.code}</strong> en el selector de
          arriba.
        </p>
      </div>
    </div>
  )
}

/**
 * El mismo cálculo, para las pantallas que además necesitan ocultar sus
 * controles de escritura. Comparte el `queryKey` con el aviso, así que la lista
 * de períodos se pide una sola vez.
 */
export function usePeriodoCerrado() {
  const { selectedPeriod } = usePeriodStore()

  const { data: periodos = [] } = useQuery<AcademicPeriod[]>({
    queryKey: ['academic-periods'],
    queryFn: async () => (await api.get('/academic-periods')).data,
    staleTime: 5 * 60 * 1000,
  })

  const periodoActivo = periodos.find((p) => p.isActive) ?? null
  return {
    periodoActivo,
    soloLectura: !!selectedPeriod && !!periodoActivo && selectedPeriod !== periodoActivo.code,
  }
}
