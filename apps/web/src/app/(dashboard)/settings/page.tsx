'use client'

import React, { useEffect, useState } from 'react'
import { RoleGate } from '@/components/shared/role-gate'
import { api } from '@/lib/axios'
import { Plus, Check, Edit2, Shield, Calendar, Users, Hash } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth-store'

interface AcademicPeriod {
  id: string
  code: string
  name: string
  startDate: string
  endDate: string
  isActive: boolean
  deanName: string | null
  directorName: string | null
}

export default function SettingsPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN'
  const [periods, setPeriods] = useState<AcademicPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newPeriod, setNewPeriod] = useState({ code: '', name: '', startDate: '', endDate: '' })

  const fetchPeriods = async () => {
    try {
      const res = await api.get('/academic-periods')
      setPeriods(res.data)
    } catch (err) {
      console.error(err)
      toast.error('Error al cargar configuraciones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPeriods()
  }, [])

  const handleSetActive = async (id: string) => {
    try {
      await api.put(`/academic-periods/${id}`, { isActive: true })
      toast.success('Periodo activado')
      fetchPeriods()
    } catch (err) {
      toast.error('Error al activar periodo')
    }
  }

  const handleUpdateAuthority = async (id: string, field: 'deanName' | 'directorName', value: string) => {
    try {
      await api.put(`/academic-periods/${id}`, { [field]: value })
      toast.success('Autoridad actualizada')
      fetchPeriods()
    } catch (err) {
      toast.error('Error al actualizar autoridad')
    }
  }

  const handleCreate = async () => {
    try {
      await api.post('/academic-periods', newPeriod)
      toast.success('Periodo creado exitosamente')
      setShowModal(false)
      fetchPeriods()
    } catch (err) {
      toast.error('Error al crear periodo')
    }
  }

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <div className="flex flex-col w-full min-h-[calc(100vh-72px)] bg-[#f7f7f8] pt-6 pb-12 px-4 lg:px-8">
        <div className="w-full max-w-[1200px] mx-auto flex flex-col gap-6">
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[24px] font-bold text-[#0f172a] flex items-center gap-2">
                <Shield className="w-6 h-6 text-indigo-600" />
                Configuraciones del Sistema
              </h1>
              <p className="text-[#64748b] text-sm mt-1">
                Gestiona los periodos académicos, autoridades y secuenciadores oficiales.
              </p>
            </div>
            {isAdmin && (
              <button 
                onClick={() => setShowModal(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-[12px] text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Nuevo Periodo
              </button>
            )}
          </div>

          <div className="bg-white rounded-[24px] border border-[#eef2f7] shadow-sm overflow-hidden mt-4 p-8">
            <h2 className="text-[18px] font-semibold text-[#0f172a] flex items-center gap-2 mb-6">
              <Calendar className="w-5 h-5 text-blue-500" />
              Periodos Académicos y Autoridades
            </h2>
            
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : periods.length === 0 ? (
              <div className="text-center py-12 text-[#64748b]">
                No hay periodos registrados. Crea uno para empezar.
              </div>
            ) : (
              <div className="grid gap-6">
                {periods.map(period => (
                  <div key={period.id} className={`p-6 rounded-[16px] border ${period.isActive ? 'border-indigo-200 bg-indigo-50/30 shadow-sm' : 'border-[#eef2f7] bg-white'}`}>
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-[16px] font-bold text-[#0f172a]">{period.name}</h3>
                          {period.isActive && (
                            <span className="bg-indigo-100 text-indigo-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">Activo</span>
                          )}
                        </div>
                        <p className="text-sm text-[#64748b] mt-1 font-mono">{period.code}</p>
                      </div>
                      {!period.isActive && isAdmin && (
                        <button 
                          onClick={() => handleSetActive(period.id)}
                          className="text-sm font-medium text-[#64748b] hover:text-indigo-600 bg-white border border-[#eef2f7] hover:border-indigo-200 px-4 py-2 rounded-[10px] transition-colors"
                        >
                          Marcar como Activo
                        </button>
                      )}
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Decano */}
                      <div className="bg-white border border-[#eef2f7] rounded-[12px] p-4 flex flex-col gap-2">
                        <label className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" /> Nombre Decano(a)
                        </label>
                        <input
                          type="text"
                          defaultValue={period.deanName || ''}
                          onBlur={(e) => {
                            if (e.target.value !== period.deanName) {
                              handleUpdateAuthority(period.id, 'deanName', e.target.value)
                            }
                          }}
                          placeholder="Ej: Dr. Juan Pérez"
                          className="w-full bg-slate-50 border-none rounded-[8px] px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-100 transition-shadow text-[#0f172a]"
                        />
                      </div>

                      {/* Director */}
                      <div className="bg-white border border-[#eef2f7] rounded-[12px] p-4 flex flex-col gap-2">
                        <label className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" /> Nombre Director(a) Carrera
                        </label>
                        <input
                          type="text"
                          defaultValue={period.directorName || ''}
                          onBlur={(e) => {
                            if (e.target.value !== period.directorName) {
                              handleUpdateAuthority(period.id, 'directorName', e.target.value)
                            }
                          }}
                          placeholder="Ej: Ing. María Gómez"
                          className="w-full bg-slate-50 border-none rounded-[8px] px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-100 transition-shadow text-[#0f172a]"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[24px] shadow-xl w-full max-w-md p-6 border border-[#eef2f7]">
            <h2 className="text-xl font-bold text-[#0f172a] mb-6">Crear Periodo Académico</h2>
            
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-[#475569] mb-1.5 block">Código (Ej: 2024-1)</label>
                <input 
                  type="text" 
                  value={newPeriod.code}
                  onChange={(e) => setNewPeriod({...newPeriod, code: e.target.value})}
                  className="w-full border border-[#cbd5e1] rounded-[12px] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[#475569] mb-1.5 block">Nombre Descriptivo</label>
                <input 
                  type="text" 
                  value={newPeriod.name}
                  onChange={(e) => setNewPeriod({...newPeriod, name: e.target.value})}
                  className="w-full border border-[#cbd5e1] rounded-[12px] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ej: Primer Semestre 2024"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-[#475569] mb-1.5 block">Fecha Inicio</label>
                  <input 
                    type="date" 
                    value={newPeriod.startDate}
                    onChange={(e) => setNewPeriod({...newPeriod, startDate: e.target.value})}
                    className="w-full border border-[#cbd5e1] rounded-[12px] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#475569] mb-1.5 block">Fecha Fin</label>
                  <input 
                    type="date" 
                    value={newPeriod.endDate}
                    onChange={(e) => setNewPeriod({...newPeriod, endDate: e.target.value})}
                    className="w-full border border-[#cbd5e1] rounded-[12px] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button 
                onClick={() => setShowModal(false)}
                className="px-5 py-2.5 text-sm font-medium text-[#64748b] bg-slate-100 hover:bg-slate-200 rounded-[12px] transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleCreate}
                disabled={!newPeriod.code || !newPeriod.name || !newPeriod.startDate || !newPeriod.endDate}
                className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-[12px] transition-colors"
              >
                Crear Periodo
              </button>
            </div>
          </div>
        </div>
      )}
    </RoleGate>
  )
}
