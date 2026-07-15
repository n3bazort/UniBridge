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
} from 'lucide-react'

interface Signer {
  id: string
  signerRole: 'DEAN' | 'DIRECTOR'
  fullName: string
  title?: string
  user: { id: string; email: string; createdAt: string }
}

interface Invitation {
  id: string
  signerRole: 'DEAN' | 'DIRECTOR'
  email?: string
  expiresAt: string
  usedAt?: string
  createdAt: string
}

const ROLE_LABEL = { DEAN: 'Decano', DIRECTOR: 'Director' }

export default function SignersPage() {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'direct' | 'invite'>('invite')
  const [form, setForm] = useState({ email: '', fullName: '', title: '', signerRole: 'DEAN' as 'DEAN' | 'DIRECTOR' })
  const [lastResult, setLastResult] = useState<{ link?: string; temporaryPassword?: string; email?: string } | null>(null)

  const { data: signers = [] } = useQuery<Signer[]>({
    queryKey: ['signers'],
    queryFn: async () => (await api.get('/signatures/signers')).data,
  })

  const { data: invitations = [] } = useQuery<Invitation[]>({
    queryKey: ['signer-invitations'],
    queryFn: async () => (await api.get('/signatures/invitations')).data,
  })

  const createSigner = useMutation({
    mutationFn: async () => (await api.post('/signatures/signers', {
      email: form.email,
      fullName: form.fullName,
      title: form.title || undefined,
      signerRole: form.signerRole,
    })).data,
    onSuccess: (data) => {
      toast.success('Firmante creado exitosamente')
      setLastResult({ temporaryPassword: data.temporaryPassword, email: data.email })
      setForm({ email: '', fullName: '', title: '', signerRole: form.signerRole })
      queryClient.invalidateQueries({ queryKey: ['signers'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Error al crear firmante'),
  })

  const createInvitation = useMutation({
    mutationFn: async () => (await api.post('/signatures/invitations', {
      signerRole: form.signerRole,
      email: form.email || undefined,
      fullName: form.fullName || undefined,
    })).data,
    onSuccess: (data) => {
      toast.success('Invitación generada')
      setLastResult({ link: data.link })
      queryClient.invalidateQueries({ queryKey: ['signer-invitations'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Error al generar invitación'),
  })

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copiado al portapapeles')
  }

  const isPending = createSigner.isPending || createInvitation.isPending
  const inputCls = 'w-full mt-1 px-3.5 py-2 bg-[#f9fafb] border border-[#eef2f7] rounded-[12px] text-[13px] font-medium text-[#374151] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all'

  return (
    <RoleGate allowedRoles={['ADMIN']}>
      <div className="flex flex-col w-full min-h-[calc(100vh-72px)] bg-[#f7f7f8] pt-6 pb-12 px-4 lg:px-8">
        <div className="w-full max-w-[1400px] mx-auto flex flex-col gap-6">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-[#eef2f7]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[12px] bg-white border border-[#eef2f7] flex items-center justify-center text-[#111827] shadow-sm">
                <UserCheck className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-[20px] font-bold text-[#111827]">Firmantes</h1>
                <p className="text-[13px] text-[#6b7280]">Autoridades que firman digitalmente los documentos (Decano y Director).</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── Alta de firmantes ── */}
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
                <div>
                  <label className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Autoridad</label>
                  <select
                    value={form.signerRole}
                    onChange={(e) => setForm({ ...form, signerRole: e.target.value as 'DEAN' | 'DIRECTOR' })}
                    className={inputCls + ' cursor-pointer'}
                  >
                    <option value="DEAN">Decano (firma primero)</option>
                    <option value="DIRECTOR">Director (firma después)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">
                    Correo {mode === 'invite' && '(opcional: restringe la invitación)'}
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="decano@uleam.edu.ec"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">
                    Nombre completo {mode === 'invite' && '(opcional)'}
                  </label>
                  <input
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    placeholder="Dr. Nombre Apellido"
                    className={inputCls}
                  />
                </div>
                {mode === 'direct' && (
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
                  onClick={() => (mode === 'direct' ? createSigner.mutate() : createInvitation.mutate())}
                  disabled={isPending || (mode === 'direct' && (!form.email || !form.fullName))}
                  className="w-full flex items-center justify-center gap-2 h-[42px] bg-[#111827] hover:bg-[#1f2937] rounded-[12px] text-[13px] font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
                >
                  {isPending && <div className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-white animate-spin" />}
                  {mode === 'direct' ? 'Crear Firmante' : 'Generar Link de Invitación'}
                </button>

                {lastResult?.link && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-[12px]">
                    <p className="text-[12px] font-semibold text-emerald-700 mb-1.5">
                      Comparte este link con la autoridad (expira en 7 días):
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
                      Contraseña temporal de {lastResult.email} (guárdala, no se mostrará de nuevo):
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
                <h3 className="text-[14px] font-semibold text-[#111827] pb-3 border-b border-[#f3f4f6] mb-1">Firmantes Activos</h3>
                {signers.length === 0 ? (
                  <p className="text-[13px] text-[#9ca3af] py-4">Aún no hay firmantes registrados.</p>
                ) : (
                  <div className="divide-y divide-[#f3f4f6]">
                    {signers.map((s) => (
                      <div key={s.id} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-[13px] shrink-0 shadow-sm border border-slate-200/50">
                            {s.fullName?.[0] || 'F'}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] font-semibold text-[#111827] truncate leading-snug">{s.fullName}</span>
                            <span className="text-[11px] text-[#9ca3af] tracking-wide mt-0.5 flex items-center gap-1 truncate">
                              <Mail className="w-3 h-3" /> {s.user.email}
                            </span>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-[6px] uppercase tracking-wider border shrink-0 ${
                          s.signerRole === 'DEAN'
                            ? 'text-purple-600 bg-purple-50 border-purple-100'
                            : 'text-blue-600 bg-blue-50 border-blue-100'
                        }`}>
                          {ROLE_LABEL[s.signerRole]}
                        </span>
                      </div>
                    ))}
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
                      const expired = new Date(inv.expiresAt) < new Date()
                      return (
                        <div key={inv.id} className="py-3 flex items-center justify-between">
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] font-semibold text-[#374151] truncate">{inv.email || 'Sin correo restringido'}</span>
                            <span className="text-[11px] text-[#9ca3af] tracking-wide mt-0.5">
                              {ROLE_LABEL[inv.signerRole]} · expira {new Date(inv.expiresAt).toLocaleDateString('es-ES')}
                            </span>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-[6px] uppercase tracking-wider border shrink-0 ${
                            inv.usedAt
                              ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                              : expired
                                ? 'text-red-600 bg-red-50 border-red-100'
                                : 'text-amber-600 bg-amber-50 border-amber-100'
                          }`}>
                            {inv.usedAt ? 'Usada' : expired ? 'Expirada' : 'Activa'}
                          </span>
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
