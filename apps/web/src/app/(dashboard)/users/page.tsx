'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { toast } from 'sonner'
import {
  UserCheck,
  Link2,
  Copy,
  Plus,
  KeyRound,
  Mail,
  Ban,
  Trash2,
  RotateCcw,
} from 'lucide-react'

interface UserItem {
  id: string
  email: string
  role: 'ADMIN' | 'COORDINATOR' | 'SIGNER'
  suspendedAt?: string | null
  createdAt: string
  signerRole?: 'DEAN' | 'DIRECTOR'
  fullName?: string
  title?: string
  facultyName?: string
}

interface Invitation {
  id: string
  role: 'ADMIN' | 'COORDINATOR' | 'SIGNER'
  signerRole?: 'DEAN' | 'DIRECTOR'
  email?: string
  expiresAt: string
  usedAt?: string
  createdAt: string
  isActive?: boolean
  isExpired?: boolean
  link?: string | null
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  COORDINATOR: 'Coordinador',
  SIGNER_DEAN: 'Decano',
  SIGNER_DIRECTOR: 'Responsable de Prácticas',
}

export default function UsersPage() {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'direct' | 'invite'>('invite')
  const [form, setForm] = useState({
    email: '',
    fullName: '',
    title: '',
    role: 'SIGNER' as 'ADMIN' | 'COORDINATOR' | 'SIGNER',
    signerRole: 'DEAN' as 'DEAN' | 'DIRECTOR',
    facultyId: '',
    programId: '',
  })
  const [lastResult, setLastResult] = useState<{ link?: string; temporaryPassword?: string; email?: string } | null>(null)

  const { data: users = [] } = useQuery<UserItem[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/signatures/users')).data,
  })

  const { data: invitations = [] } = useQuery<Invitation[]>({
    queryKey: ['user-invitations'],
    queryFn: async () => (await api.get('/signatures/invitations')).data,
  })

  const { data: faculties = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['faculties'],
    queryFn: async () => (await api.get('/practices/faculties')).data,
  })

  // El coordinador se asigna a una CARRERA; la facultad se deriva del programa.
  const { data: programs = [] } = useQuery<{ id: string; name: string; facultyId: string }[]>({
    queryKey: ['programs'],
    queryFn: async () => (await api.get('/programs', { params: { limit: 200 } })).data.data,
  })
  const facultyIdOfProgram = (programId: string) =>
    programs.find(p => p.id === programId)?.facultyId || ''

  const createUser = useMutation({
    mutationFn: async () => (await api.post('/signatures/users', {
      email: form.email,
      fullName: form.fullName || undefined,
      title: form.title || undefined,
      role: form.role,
      signerRole: form.role === 'SIGNER' ? form.signerRole : undefined,
      // El coordinador se declara por carrera; la facultad se deriva de ella
      facultyId: form.role === 'COORDINATOR' ? facultyIdOfProgram(form.programId) : undefined,
      programId: form.role === 'COORDINATOR' ? form.programId : undefined,
    })).data,
    onSuccess: (data) => {
      toast.success('Usuario creado exitosamente')
      setLastResult({ temporaryPassword: data.temporaryPassword, email: data.email })
      setForm({ ...form, email: '', fullName: '', title: '' })
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Error al crear usuario'),
  })

  const createInvitation = useMutation({
    mutationFn: async () => (await api.post('/signatures/invitations', {
      role: form.role,
      signerRole: form.role === 'SIGNER' ? form.signerRole : undefined,
      email: form.email || undefined,
      fullName: form.fullName || undefined,
      facultyId: form.role === 'COORDINATOR' ? facultyIdOfProgram(form.programId) : undefined,
      programId: form.role === 'COORDINATOR' ? form.programId : undefined,
    })).data,
    onSuccess: (data) => {
      toast.success('Invitación generada')
      setLastResult({ link: data.link })
      queryClient.invalidateQueries({ queryKey: ['user-invitations'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Error al generar invitación'),
  })

  const setSuspended = useMutation({
    mutationFn: async ({ userId, suspended }: { userId: string; suspended: boolean }) =>
      (await api.patch(`/signatures/users/${userId}/suspend`, { suspended })).data,
    onSuccess: (data) => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'No se pudo cambiar el estado'),
  })

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => (await api.delete(`/signatures/users/${userId}`)).data,
    onSuccess: (data) => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'No se pudo eliminar la cuenta'),
  })

  const deleteInvitation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/signatures/invitations/${id}`)).data,
    onSuccess: (data) => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ['user-invitations'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'No se pudo eliminar la invitación'),
  })

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copiado al portapapeles')
  }

  const isPending = createUser.isPending || createInvitation.isPending
  const inputCls = 'w-full mt-1 px-3.5 py-2 bg-[#f9fafb] border border-[#eef2f7] rounded-[12px] text-[13px] font-medium text-[#374151] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all'

  return (
    <RoleGate allowedRoles={['ADMIN']}>
      <div className="flex flex-col w-full min-h-[calc(100vh-72px)] bg-[#f7f7f8] pt-6 pb-12 px-4 lg:px-8">
        <div className="w-full max-w-[1400px] mx-auto flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-[#eef2f7]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[12px] bg-white border border-[#eef2f7] flex items-center justify-center text-[#111827] shadow-sm">
                <UserCheck className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-[20px] font-bold text-[#111827]">Gestión de Usuarios</h1>
                <p className="text-[13px] text-[#6b7280]">Crea cuentas e invitaciones para Administradores, Coordinadores y Autoridades.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── Alta de usuarios ── */}
            <div className="bg-white rounded-[18px] border border-[#eef2f7] shadow-soft p-[24px] flex flex-col gap-5 h-fit">
              <div className="flex items-center gap-1 bg-[#f1f5f9] p-1 rounded-[10px] w-fit">
                <button
                  onClick={() => { setMode('invite'); setLastResult(null) }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition-all ${
                    mode === 'invite' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#64748b] hover:text-[#111827]'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" /> Link de invitación
                </button>
                <button
                  onClick={() => { setMode('direct'); setLastResult(null) }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition-all ${
                    mode === 'direct' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#64748b] hover:text-[#111827]'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" /> Crear directamente
                </button>
              </div>

              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Rol</label>
                    <select
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value as any })}
                      className={inputCls + ' cursor-pointer'}
                    >
                      <option value="SIGNER">Firmante (Decano / Responsable)</option>
                      <option value="COORDINATOR">Coordinador de Facultad</option>
                      <option value="ADMIN">Administrador</option>
                    </select>
                  </div>
                  
                  {form.role === 'SIGNER' && (
                    <div className="col-span-2">
                      <label className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Tipo de Autoridad</label>
                      <select
                        value={form.signerRole}
                        onChange={(e) => setForm({ ...form, signerRole: e.target.value as any })}
                        className={inputCls + ' cursor-pointer'}
                      >
                        <option value="DEAN">Decano (firma primero)</option>
                        <option value="DIRECTOR">Responsable de Prácticas (firma después)</option>
                      </select>
                    </div>
                  )}

                  {form.role === 'COORDINATOR' && (
                    <div className="col-span-2">
                      <label className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Carrera a coordinar</label>
                      <select
                        value={form.programId}
                        onChange={(e) => setForm({ ...form, programId: e.target.value })}
                        className={inputCls + ' cursor-pointer'}
                      >
                        <option value="">Selecciona una carrera...</option>
                        {programs.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      {form.programId && (
                        <p className="text-[11px] text-[#9ca3af] mt-1">
                          Facultad: {faculties.find(f => f.id === facultyIdOfProgram(form.programId))?.name || '—'}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">
                    Correo {mode === 'invite' && '(opcional: restringe la invitación)'}
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="ejemplo@uleam.edu.ec"
                    className={inputCls}
                  />
                </div>
                {(mode === 'direct' || form.role === 'SIGNER') && (
                  <div>
                    <label className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">
                      Nombre completo {mode === 'invite' && '(opcional)'}
                    </label>
                    <input
                      value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      placeholder="Nombre Apellido"
                      className={inputCls}
                    />
                  </div>
                )}
                {mode === 'direct' && form.role === 'SIGNER' && (
                  <div>
                    <label className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Cargo (opcional)</label>
                    <input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="Decano de la Facultad de..."
                      className={inputCls}
                    />
                  </div>
                )}

                <button
                  onClick={() => (mode === 'direct' ? createUser.mutate() : createInvitation.mutate())}
                  disabled={isPending ||
                    (mode === 'direct' && (!form.email || (form.role === 'SIGNER' && !form.fullName) || (form.role === 'COORDINATOR' && !form.programId))) ||
                    (mode === 'invite' && form.role === 'COORDINATOR' && !form.programId)
                  }
                  className="w-full flex items-center justify-center gap-2 h-[42px] bg-[#111827] hover:bg-[#1f2937] rounded-[12px] text-[13px] font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
                >
                  {isPending && <div className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-white animate-spin" />}
                  {mode === 'direct' ? 'Crear Usuario' : 'Generar Link de Invitación'}
                </button>

                {lastResult?.link && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-[12px]">
                    <p className="text-[12px] font-semibold text-emerald-700 mb-1.5">
                      Comparte este link (expira en 7 días):
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[11px] text-emerald-800 truncate">{lastResult.link}</code>
                      <button onClick={() => copy(lastResult.link!)} className="p-1.5 hover:bg-emerald-100 rounded-[8px] transition-colors">
                        <Copy className="w-3.5 h-3.5 text-emerald-600" />
                      </button>
                    </div>
                  </div>
                )}
                {lastResult?.temporaryPassword && (
                  <div className="p-3.5 bg-amber-50 border border-amber-100 rounded-[12px]">
                    <p className="text-[12px] font-semibold text-amber-700 mb-1.5 flex items-center gap-1">
                      <KeyRound className="w-3.5 h-3.5" />
                      Contraseña temporal de {lastResult.email}:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[13px] font-mono text-amber-800">{lastResult.temporaryPassword}</code>
                      <button onClick={() => copy(lastResult.temporaryPassword!)} className="p-1.5 hover:bg-amber-100 rounded-[8px] transition-colors">
                        <Copy className="w-3.5 h-3.5 text-amber-600" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Listados ── */}
            <div className="flex flex-col gap-6">
              <div className="bg-white rounded-[18px] border border-[#eef2f7] shadow-soft p-[24px]">
                <h3 className="text-[14px] font-semibold text-[#111827] pb-3 border-b border-[#f3f4f6] mb-1">Usuarios Activos</h3>
                {users.length === 0 ? (
                  <p className="text-[13px] text-[#9ca3af] py-4">No hay usuarios registrados.</p>
                ) : (
                  <div className="divide-y divide-[#f3f4f6]">
                    {users.map((u) => {
                      const suspended = !!u.suspendedAt
                      const roleKey = u.role === 'SIGNER' ? `SIGNER_${u.signerRole}` : u.role
                      return (
                      <div key={u.id} className={`py-3 flex items-center justify-between gap-2 group ${suspended ? 'opacity-60' : ''}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-[13px] shrink-0 shadow-sm border border-slate-200/50">
                            {u.fullName?.[0] || u.email[0].toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] font-semibold text-[#111827] truncate leading-snug flex items-center gap-1.5">
                              {u.fullName || u.email.split('@')[0]}
                              {suspended && (
                                <span className="text-[9.5px] font-bold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">
                                  Inhabilitada
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] text-[#9ca3af] tracking-wide mt-0.5 flex items-center gap-1 truncate">
                              <Mail className="w-3 h-3 shrink-0" /> {u.email}
                              {u.facultyName && ` · ${u.facultyName}`}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-[6px] uppercase tracking-wider border ${
                            u.role === 'ADMIN' ? 'text-red-600 bg-red-50 border-red-100' :
                            u.role === 'COORDINATOR' ? 'text-orange-600 bg-orange-50 border-orange-100' :
                            u.signerRole === 'DEAN' ? 'text-purple-600 bg-purple-50 border-purple-100' :
                            'text-blue-600 bg-blue-50 border-blue-100'
                          }`}>
                            {ROLE_LABEL[roleKey]}
                          </span>

                          <button
                            onClick={() => setSuspended.mutate({ userId: u.id, suspended: !suspended })}
                            disabled={setSuspended.isPending}
                            className={`p-1.5 rounded-md transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40 ${
                              suspended
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : 'text-[#9ca3af] hover:text-amber-600 hover:bg-amber-50'
                            }`}
                            title={suspended ? 'Reactivar cuenta' : 'Inhabilitar cuenta'}
                          >
                            {suspended ? <RotateCcw className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            onClick={() => {
                              if (confirm(`¿Eliminar definitivamente la cuenta de ${u.email}?`)) {
                                deleteUser.mutate(u.id)
                              }
                            }}
                            disabled={deleteUser.isPending}
                            className="p-1.5 rounded-md text-[#9ca3af] hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40"
                            title="Eliminar cuenta definitivamente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-[18px] border border-[#eef2f7] shadow-soft p-[24px]">
                <h3 className="text-[14px] font-semibold text-[#111827] pb-3 border-b border-[#f3f4f6] mb-1">Invitaciones</h3>
                {invitations.length === 0 ? (
                  <p className="text-[13px] text-[#9ca3af] py-4">No hay invitaciones emitidas.</p>
                ) : (
                  <div className="divide-y divide-[#f3f4f6]">
                    {invitations.slice(0, 8).map((inv) => {
                      const expired = inv.isExpired ?? (!inv.usedAt && new Date(inv.expiresAt) < new Date())
                      const active = inv.isActive ?? (!inv.usedAt && !expired)
                      const roleKey = inv.role === 'SIGNER' ? `SIGNER_${inv.signerRole}` : inv.role
                      return (
                        <div key={inv.id} className="py-3 flex items-center justify-between gap-2 group">
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] font-semibold text-[#374151] truncate">{inv.email || 'Sin correo restringido'}</span>
                            <span className="text-[11px] text-[#9ca3af] tracking-wide mt-0.5">
                              {ROLE_LABEL[roleKey]} · {inv.usedAt ? 'usada' : expired ? 'expiró' : 'expira'} {new Date(inv.usedAt || inv.expiresAt).toLocaleDateString('es-ES')}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-[6px] uppercase tracking-wider border ${
                              inv.usedAt
                                ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                                : expired
                                  ? 'text-red-600 bg-red-50 border-red-100'
                                  : 'text-amber-600 bg-amber-50 border-amber-100'
                            }`}>
                              {inv.usedAt ? 'Usada' : expired ? 'Expirada' : 'Activa'}
                            </span>

                            {active && inv.link && (
                              <button
                                onClick={() => copy(inv.link!)}
                                className="p-1.5 rounded-md text-[#9ca3af] hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                title="Copiar link"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              onClick={() => {
                                if (confirm('¿Eliminar esta invitación?')) deleteInvitation.mutate(inv.id)
                              }}
                              disabled={deleteInvitation.isPending}
                              className="p-1.5 rounded-md text-[#9ca3af] hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40"
                              title="Eliminar invitación"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </RoleGate>
  )
}
