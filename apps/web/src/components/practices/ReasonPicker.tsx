'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { Select } from '@/components/ui/select'

export interface Reason {
  id: string
  code: string
  label: string
}

/**
 * Selector de motivo tipificado (RF-24).
 *
 * Vive aparte porque lo comparten el diálogo de baja y el de reasignación, y
 * porque el catálogo se cachea una sola vez por ámbito en lugar de pedirse en
 * cada apertura.
 */
export function ReasonPicker({
  scope,
  value,
  onChange,
  note,
  onNoteChange,
  disabled,
}: {
  scope: 'PRACTICE' | 'DOCUMENT'
  value: string
  onChange: (id: string) => void
  note: string
  onNoteChange: (v: string) => void
  disabled?: boolean
}) {
  const { data: motivos = [], isLoading } = useQuery<Reason[]>({
    queryKey: ['reasons', scope],
    queryFn: async () => (await api.get('/reasons', { params: { scope } })).data,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">Motivo</label>
        <Select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || isLoading}
          className="w-full"
        >
          <option value="">{isLoading ? 'Cargando…' : 'Elige un motivo…'}</option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </Select>
      </div>

      <div>
        <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">
          Nota <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="Lo que la etiqueta no dice"
          className="w-full resize-none border border-slate-300 rounded-[10px] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50"
        />
      </div>
    </div>
  )
}
