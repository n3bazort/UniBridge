'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { toast } from 'sonner'
import { UserPlus, Mail, Eye, EyeOff, ShieldCheck, Briefcase } from 'lucide-react'

interface TeamUser {
  id: string
  email: string
  role: 'ADMIN' | 'COORDINATOR' | 'STUDENT' | 'SIGNER'
  createdAt: string
  suspendedAt?: string | null
  coordinator?: { faculty?: { name: string } | null } | null
}

interface Faculty {
  id: string
  name: string
}

const ROLE_META: Record<string, { label: string; cls: string }> = {
  ADMIN: { label: 'Administrador', cls: 'text-rose-600 bg-rose-50 border-rose-100' },
  COORDINATOR: { label: 'Coordinador', cls: 'text-blue-600 bg-blue-50 border-blue-100' },
}

/**
 * Gestión de cuentas del equipo (solo ADMIN): coordinadores y administradores.
 * Los estudiantes se crean por importación y los firmantes en su propia página;
 * aquí solo vive el personal operativo.
 */
export function TeamAccountsConfig() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ email: '', password: '', role: 'COORDINATOR' as 'COORDINATOR' | 'ADMIN', facultyId: '' })
  const [showPassword, setShowPassword] = useState(false)

  const { data: users = [] } = useQuery<TeamUser[]>({
    queryKey: ['team-users'],
    queryFn: async () => (await api.get('/users')).data,
  })

  const { data: faculties = [] } = useQuery<Faculty[]>({
    queryKey: ['faculties'],
    queryFn: async () => (await api.get('/faculties')).data,
  })

  const teamUsers = users.filter(u => u.role === 'ADMIN' || u.role === 'COORDINATOR')

  const createUser = useMutation({
    mutationFn: async () => (await api.post('/users', {
      email: form.email,
      password: form.password,
      role: form.role,
      facultyId: form.role === 'COORDINATOR' ? form.facultyId : undefined,
    })).data,
    onSuccess: (data) => {
      toast.success(`Cuenta de ${ROLE_META[data.role]?.label || data.role} creada: ${data.email}`)
      setForm({ email: '', password: '', role: 'COORDINATOR', facultyId: '' })
      queryClient.invalidateQueries({ queryKey: ['team-users'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Error al crear la cuenta'),
  })

  const canSubmit =
    form.email.includes('@') &&
    form.password.length >= 8 &&
    (form.role === 'ADMIN' || form.facultyId)

  const inputCls = 'w-full mt-1 px-3.5 py-2 bg-[#f9fafb] border border-[#eef2f7] rounded-[12px] text-[13px] font-medium text-[#374151] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all'

  return (
    <div className="bg-white rounded-[24px] border border-[#eef2f7] shadow-sm overflow-hidden p-8">
      <h2 className="text-[18px] font-semibold text-[#0f172a] flex items-center gap-2 mb-1">
        <ShieldCheck className="w-5 h-5 text-rose-500" />
        Cuentas del Equipo
      </h2>
      <p className="text-[13px] text-[#64748b] mb-6">
        Crea las cuentas de los <span className="font-semibold">coordinadores</span> (operan las prácticas de su facultad) y
        de otros administradores. Elige el rol con cuidado: el Administrador configura el sistema; el Coordinador
        hace el trabajo diario.
      </p>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Formulario de creación */}
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Correo institucional</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="coordinador@uleam.edu.ec"
              className={inputCls}
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Contraseña temporal (mín. 8)</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                className={`${inputCls} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-[#9ca3af] hover:text-[#374151]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Rol</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as 'COORDINATOR' | 'ADMIN' })}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="COORDINATOR">Coordinador</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">
                Facultad {form.role === 'COORDINATOR' ? '(requerida)' : ''}
              </label>
              <select
                value={form.facultyId}
                onChange={(e) => setForm({ ...form, facultyId: e.target.value })}
                disabled={form.role === 'ADMIN'}
                className={`${inputCls} cursor-pointer disabled:opacity-50`}
              >
                <option value="">Selecciona…</option>
                {faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>

          {form.role === 'ADMIN' && (
            <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-100 rounded-[10px] px-3 py-2">
              ⚠ Un Administrador puede configurar autoridades, plantillas y cuentas. Asigna este rol solo a quien gobierna el sistema.
            </p>
          )}

          <button
            onClick={() => createUser.mutate()}
            disabled={!canSubmit || createUser.isPending}
            className="mt-1 flex items-center justify-center gap-2 h-[42px] bg-[#111827] hover:bg-[#1f2937] disabled:opacity-50 text-white text-[13px] font-semibold rounded-[12px] transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            {createUser.isPending ? 'Creando…' : `Crear cuenta de ${form.role === 'ADMIN' ? 'Administrador' : 'Coordinador'}`}
          </button>
        </div>

        {/* Lista del equipo */}
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-2">Equipo actual ({teamUsers.length})</span>
          <div className="divide-y divide-[#f3f4f6] border border-[#eef2f7] rounded-[14px] overflow-hidden">
            {teamUsers.map(u => (
              <div key={u.id} className="flex items-center justify-between gap-2 px-4 py-3 bg-white">
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-semibold text-[#111827] truncate flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-[#9ca3af] shrink-0" /> {u.email}
                  </span>
                  {u.coordinator?.faculty?.name && (
                    <span className="text-[11px] text-[#9ca3af] flex items-center gap-1 mt-0.5">
                      <Briefcase className="w-3 h-3" /> {u.coordinator.faculty.name}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-[6px] uppercase tracking-wider border shrink-0 ${ROLE_META[u.role]?.cls || 'text-slate-500 bg-slate-50 border-slate-200'}`}>
                  {ROLE_META[u.role]?.label || u.role}
                </span>
              </div>
            ))}
            {teamUsers.length === 0 && (
              <p className="text-[13px] text-[#9ca3af] px-4 py-6 text-center">Aún no hay cuentas de equipo.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
