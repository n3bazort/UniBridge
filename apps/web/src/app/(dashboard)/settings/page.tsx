'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { RoleGate } from '@/components/shared/role-gate'
import { api } from '@/lib/axios'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePeriodStore } from '@/store/period'
import { Plus, Check, Edit2, Shield, Calendar, Users, Hash, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth-store'
import { ProgramsConfig } from '@/components/settings/programs-config'
import { TeamAccountsConfig } from '@/components/settings/team-accounts-config'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

interface AcademicPeriod {
  id: string
  code: string
  name: string
  startDate: string
  endDate: string
  isActive: boolean
  deanName: string | null
  directorName: string | null
  // Datos de contacto del Responsable que los oficios imprimen bajo su firma
  directorDni: string | null
  directorPhone: string | null
  directorEmail: string | null
}

export default function SettingsPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN'
  const [showModal, setShowModal] = useState(false)
  const [newPeriod, setNewPeriod] = useState({ code: '', name: '', startDate: '', endDate: '' })

  const [expandedPeriods, setExpandedPeriods] = useState<Record<string, boolean>>({})

  const queryClient = useQueryClient()
  const { setSelectedPeriod } = usePeriodStore()

  const { data: signers = [] } = useQuery({
    queryKey: ['users-signers'],
    queryFn: async () => (await api.get('/signatures/users')).data,
  })
  const activeDeans = signers.filter((s: any) => s.role === 'SIGNER' && s.signerRole === 'DEAN' && !s.suspendedAt)
  const activeDirectors = signers.filter((s: any) => s.role === 'SIGNER' && s.signerRole === 'DIRECTOR' && !s.suspendedAt)

  /**
   * La lista de períodos sale de la MISMA caché que el selector del topbar y
   * el aviso de período cerrado (`['academic-periods']`).
   *
   * Antes esta pantalla mantenía su propia copia en estado local, cargada por
   * su cuenta. Eso permitía que las dos versiones se desincronizaran: activar
   * un período refrescaba la copia de aquí —el badge ACTIVO se movía— pero la
   * caché compartida seguía con el período anterior durante cinco minutos, y
   * el resto del sistema seguía escribiendo en el semestre viejo.
   */
  const { data: periods = [], isLoading: loading, isError } = useQuery<AcademicPeriod[]>({
    queryKey: ['academic-periods'],
    queryFn: async () => (await api.get('/academic-periods')).data,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (isError) toast.error('Error al cargar configuraciones')
  }, [isError])

  /**
   * Aquí se muestran con el activo arriba y el resto por código descendente.
   * El orden se calcula sobre una COPIA: el array de la caché lo comparten
   * otros componentes, y ordenarlo en el sitio se lo cambiaría por debajo.
   */
  const periodsOrdenados = useMemo(
    () => [...periods].sort((a, b) => {
      if (a.isActive && !b.isActive) return -1
      if (!a.isActive && b.isActive) return 1
      return b.code.localeCompare(a.code)
    }),
    [periods],
  )

  // El período activo arranca desplegado y los demás plegados, pero solo la
  // primera vez que llega la lista: a partir de ahí manda lo que el usuario
  // haya abierto o cerrado a mano, y un refetch no debe deshacerlo.
  const yaSeDesplegoElActivo = useRef(false)
  useEffect(() => {
    if (yaSeDesplegoElActivo.current || periods.length === 0) return
    yaSeDesplegoElActivo.current = true
    const inicial: Record<string, boolean> = {}
    for (const p of periods) if (p.isActive) inicial[p.id] = true
    setExpandedPeriods(inicial)
  }, [periods])

  /** Vuelve a pedir la lista compartida. Sustituye al antiguo `fetchPeriods`. */
  const refrescarPeriodos = () =>
    queryClient.invalidateQueries({ queryKey: ['academic-periods'] })

  const togglePeriod = (id: string) => {
    setExpandedPeriods(prev => ({ ...prev, [id]: !prev[id] }))
  }

  /**
   * Activar un período es declarar cuál es el semestre en curso, y eso toca
   * tres sitios que antes no se enteraban:
   *
   * 1. La base de datos, que es lo único que se actualizaba antes. Por eso el
   *    toast decía la verdad y aun así el sistema seguía comportándose como si
   *    nada: el aviso de «período cerrado» y los controles de escritura leen
   *    la lista cacheada, que seguía con el período anterior.
   * 2. El selector del topbar. Si se queda en el período viejo, el aviso tiene
   *    razón —estás viendo uno cerrado—, pero se lee como que la activación
   *    falló. Quien activa un período quiere trabajar en él.
   */
  const handleSetActive = async (id: string, code: string) => {
    try {
      await api.put(`/academic-periods/${id}`, { isActive: true })
      await refrescarPeriodos()
      setSelectedPeriod(code)
      toast.success(`Período ${code} activado`)
    } catch (err) {
      toast.error('Error al activar periodo')
    }
  }

  const handleUpdateAuthority = async (
    id: string,
    field: 'deanName' | 'directorName' | 'directorDni' | 'directorPhone' | 'directorEmail',
    value: string,
  ) => {
    try {
      await api.put(`/academic-periods/${id}`, { [field]: value })
      await refrescarPeriodos()
      toast.success('Autoridad actualizada')
    } catch (err) {
      toast.error('Error al actualizar autoridad')
    }
  }

  const handleCreate = async () => {
    try {
      await api.post('/academic-periods', newPeriod)
      // El selector del topbar sale de esta misma lista: sin refrescarla, el
      // período recién creado no aparecía hasta que caducara la caché o hasta
      // recargar la página.
      await refrescarPeriodos()
      toast.success('Periodo creado exitosamente')
      setShowModal(false)
    } catch (err) {
      toast.error('Error al crear periodo')
    }
  }

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <div className="flex flex-col w-full flex-1">
        <PageContainer variant="reading" className="flex flex-col gap-6">
          
          <PageHeader
            description="Gestiona los períodos académicos, las autoridades que firman y los secuenciadores oficiales."
            actions={
              isAdmin ? (
                <Button onClick={() => setShowModal(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Nuevo período
                </Button>
              ) : undefined
            }
          />

          <div className="bg-white rounded-[24px] border border-[#eef2f7] shadow-sm overflow-hidden mt-4 p-8">
            <h2 className="text-[18px] font-semibold text-[#0f172a] flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              Periodos Académicos y Autoridades
            </h2>
            <p className="text-[13px] text-[#64748b] mb-6">
              Los nombres de las autoridades son <span className="font-semibold text-[#0f172a]">obligatorios para generar documentos</span>:
              el certificado de culminación imprime ambas firmas y el oficio de solicitud (DOCX) la del Responsable de Prácticas.
              Si faltan, el sistema bloqueará la generación para ese periodo.
            </p>

            {/* El coordinador consulta esta sección, no la opera.
                Los controles ya están ocultos para él y el servidor rechaza
                la escritura igual, pero sin decirlo la pantalla se lee como
                si algo estuviera fallando: se ve un «requerido» en rojo y no
                aparece con qué resolverlo. Decir de quién es la competencia
                convierte una pantalla rota en una pantalla de consulta. */}
            {!isAdmin && (
              <p className="text-[12.5px] text-[#64748b] mb-6 flex items-start gap-2 rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                <Shield className="w-4 h-4 text-slate-400 shrink-0 mt-px" />
                <span>
                  Esta sección es de <span className="font-semibold text-[#0f172a]">solo lectura</span> para tu rol.
                  Crear períodos, activarlos y designar a las autoridades que firman le corresponde
                  al administrador.
                </span>
              </p>
            )}
            
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : periodsOrdenados.length === 0 ? (
              <div className="text-center py-12 text-[#64748b]">
                No hay periodos registrados. Crea uno para empezar.
              </div>
            ) : (
              <div className="grid gap-6">
                {periodsOrdenados.map(period => (
                  <div key={period.id} className={`p-6 rounded-[16px] border transition-all ${period.isActive ? 'border-indigo-200 bg-indigo-50/30 shadow-sm' : 'border-[#eef2f7] bg-white'}`}>
                    <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => togglePeriod(period.id)}>
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-[16px] font-bold text-[#0f172a]">{period.name}</h3>
                          {period.isActive && (
                            <span className="bg-indigo-100 text-indigo-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">Activo</span>
                          )}
                        </div>
                        <p className="text-sm text-[#64748b] mt-1 font-mono">{period.code}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        {!period.isActive && isAdmin && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleSetActive(period.id, period.code); }}
                            className="text-sm font-medium text-[#64748b] hover:text-indigo-600 bg-white border border-[#eef2f7] hover:border-indigo-200 px-4 py-2 rounded-[10px] transition-colors"
                          >
                            Marcar como Activo
                          </button>
                        )}
                        <button className="text-[#64748b] hover:text-indigo-600 transition-colors p-1">
                          {expandedPeriods[period.id] ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    {expandedPeriods[period.id] && (
                      <div className="grid md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-[#eef2f7]">
                      {/* Decano */}
                      <div className="bg-white border border-[#eef2f7] rounded-[12px] p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-indigo-500" /> Decano(a) de la Facultad
                            {!period.deanName && <span className="text-rose-500 normal-case font-medium">· requerido</span>}
                          </label>
                        </div>
                        {isAdmin ? (
                          <Select
                            onChange={(e) => {
                              const val = e.target.value;
                              handleUpdateAuthority(period.id, 'deanUserId' as any, val);
                            }}
                            value={(period as any).deanUserId || activeDeans.find((d: any) => d.fullName === period.deanName || `${d.title || ''} ${d.fullName}`.trim() === period.deanName)?.id || ''}
                            className="w-full bg-indigo-50/60 border border-indigo-100 rounded-[10px] px-3 py-2 text-xs font-semibold text-indigo-900 cursor-pointer"
                          >
                            <option value="">-- Seleccionar Decano Oficial Registrado --</option>
                            {activeDeans.map((d: any) => (
                              <option key={d.id} value={d.id}>
                                {d.title ? `${d.title} ` : ''}{d.fullName} {d.facultyName ? `(${d.facultyName})` : ''} — {d.email}
                              </option>
                            ))}
                          </Select>
                        ) : null}

                        {/* Tarjeta Oficial de la Autoridad */}
                        <div className="bg-slate-50 border border-slate-100 rounded-[10px] p-3 flex flex-col gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cuenta de Autoridad Vinculada</span>
                          <span className="text-sm font-bold text-slate-900">
                            {period.deanName || 'No asignado'}
                          </span>
                          {(period as any).deanUser?.email && (
                            <span className="text-xs text-slate-500 font-mono">
                              {(period as any).deanUser.email}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Director / Responsable */}
                      <div className="bg-white border border-[#eef2f7] rounded-[12px] p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-blue-500" /> Responsable de Prácticas
                            {!period.directorName && <span className="text-rose-500 normal-case font-medium">· requerido</span>}
                          </label>
                        </div>
                        {isAdmin ? (
                          <Select
                            onChange={(e) => {
                              const val = e.target.value;
                              handleUpdateAuthority(period.id, 'directorUserId' as any, val);
                            }}
                            value={(period as any).directorUserId || activeDirectors.find((d: any) => d.fullName === period.directorName || `${d.title || ''} ${d.fullName}`.trim() === period.directorName)?.id || ''}
                            className="w-full bg-blue-50/60 border border-blue-100 rounded-[10px] px-3 py-2 text-xs font-semibold text-blue-900 cursor-pointer"
                          >
                            <option value="">-- Seleccionar Responsable Oficial Registrado --</option>
                            {activeDirectors.map((d: any) => (
                              <option key={d.id} value={d.id}>
                                {d.title ? `${d.title} ` : ''}{d.fullName} {d.facultyName ? `(${d.facultyName})` : ''} — {d.email}
                              </option>
                            ))}
                          </Select>
                        ) : null}

                        {/* Tarjeta Oficial de la Autoridad */}
                        <div className="bg-slate-50 border border-slate-100 rounded-[10px] p-3 flex flex-col gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cuenta de Autoridad Vinculada</span>
                          <span className="text-sm font-bold text-slate-900">
                            {period.directorName || 'No asignado'}
                          </span>
                          <div className="grid grid-cols-3 gap-2 mt-1 pt-2 border-t border-slate-200/60 text-[11px]">
                            <div>
                              <span className="block text-[9px] font-bold uppercase text-slate-400">Cédula</span>
                              <span className="font-mono text-slate-700">{period.directorDni || '—'}</span>
                            </div>
                            <div>
                              <span className="block text-[9px] font-bold uppercase text-slate-400">Teléfono</span>
                              <span className="text-slate-700">{period.directorPhone || '—'}</span>
                            </div>
                            <div>
                              <span className="block text-[9px] font-bold uppercase text-slate-400">Correo</span>
                              <span className="font-mono text-slate-700 truncate block">{period.directorEmail || '—'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <ProgramsConfig />

          {/* Cuentas del equipo: solo el ADMIN crea coordinadores/administradores */}
          {isAdmin && <TeamAccountsConfig />}

        </PageContainer>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[24px] shadow-xl w-full max-w-md p-6 border border-[#eef2f7]">
            <h2 className="text-xl font-bold text-[#0f172a] mb-6">Crear Periodo Académico</h2>
            
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-[#475569] mb-1.5 block">Código (Ej: 2024-1)</label>
                <Input 
                  type="text" 
                  value={newPeriod.code}
                  onChange={(e) => setNewPeriod({...newPeriod, code: e.target.value})}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[#475569] mb-1.5 block">Nombre Descriptivo</label>
                <Input 
                  type="text" 
                  value={newPeriod.name}
                  onChange={(e) => setNewPeriod({...newPeriod, name: e.target.value})}
                  className="w-full"
                  placeholder="Ej: Primer Semestre 2024"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-[#475569] mb-1.5 block">Fecha Inicio</label>
                  <Input 
                    type="date" 
                    value={newPeriod.startDate}
                    onChange={(e) => setNewPeriod({...newPeriod, startDate: e.target.value})}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#475569] mb-1.5 block">Fecha Fin</label>
                  <Input 
                    type="date" 
                    value={newPeriod.endDate}
                    onChange={(e) => setNewPeriod({...newPeriod, endDate: e.target.value})}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <Button variant="secondary" onClick={() => setShowModal(false)} className="text-sm rounded-[12px]">
                Cancelar
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newPeriod.code || !newPeriod.name || !newPeriod.startDate || !newPeriod.endDate}
                className="text-sm rounded-[12px]"
              >
                Crear Periodo
              </Button>
            </div>
          </div>
        </div>
      )}
    </RoleGate>
  )
}
