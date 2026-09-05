import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Periodo académico seleccionado — el "workspace" de toda la app, igual que
 * el selector de modelo en la esquina de ChatGPT. Se persiste en localStorage
 * para que no salte al periodo activo cada vez que alguien abre una sesión
 * nueva: si un coordinador estaba revisando 2024-2, quiere seguir ahí mañana.
 *
 * Por qué existe: antes cada lista (prácticas, certificados) traía TODOS los
 * periodos de la base de datos y filtraba en el navegador. Con esto, el
 * componente que arma la query solo pide `?academicPeriod=<seleccionado>`, y
 * React Query solo refetchea cuando cambia — no hay consulta pesada de fondo
 * cada vez que se abre una pantalla.
 */
interface PeriodState {
  /** null = todavía no se resolvió (antes de que cargue /academic-periods) */
  selectedPeriod: string | null
  setSelectedPeriod: (code: string) => void
}

export const usePeriodStore = create<PeriodState>()(
  persist(
    (set) => ({
      selectedPeriod: null,
      setSelectedPeriod: (code) => set({ selectedPeriod: code }),
    }),
    {
      name: 'period-storage',
    }
  )
)
