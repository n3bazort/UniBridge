'use client'

import React, { useState } from 'react'
import { X, User, CreditCard, GraduationCap, Phone, Mail, Loader2, Check } from 'lucide-react'
import { api } from '@/lib/axios'
import { toast } from 'sonner'

interface InlineStudentModalProps {
  isOpen: boolean
  onClose: () => void
  programs: Array<{ id: string; name: string }>
  onCreated: (student: { id: string; name: string; dni: string }) => void
}

export function InlineStudentModal({ isOpen, onClose, programs, onCreated }: InlineStudentModalProps) {
  const [dni, setDni] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [programId, setProgramId] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dni.trim() || !firstName.trim() || !lastName.trim() || !programId) {
      toast.error('Completa los campos obligatorios: Cédula, Nombres, Apellidos y Carrera.')
      return
    }

    if (dni.trim().length !== 10) {
      toast.error('La cédula de identidad debe contener exactamente 10 dígitos.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await api.post('/students', {
        dni: dni.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        programId,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
      })

      const fullName = `${res.data.firstName} ${res.data.lastName}`.trim()
      toast.success(`Estudiante "${fullName}" registrado con éxito`)
      onCreated({ id: res.data.id, name: fullName, dni: res.data.dni })
      onClose()
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Error al registrar al estudiante'
      toast.error(typeof msg === 'string' ? msg : 'Error al registrar al estudiante')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
              <User className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-bold">Registrar Nuevo Estudiante</h3>
              <p className="text-[11px] text-slate-300">Creación in-situ para asignación de prácticas</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
          {/* Cédula DNI */}
          <div>
            <label className="text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
              Cédula de Identidad (10 dígitos) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                required
                maxLength={10}
                value={dni}
                onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                placeholder="1312345678"
                className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono font-medium text-slate-900"
              />
            </div>
          </div>

          {/* Nombres y Apellidos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                Nombres <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ej. Juan Carlos"
                className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium text-slate-900"
              />
            </div>

            <div>
              <label className="text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                Apellidos <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Ej. Pérez Mendoza"
                className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium text-slate-900"
              />
            </div>
          </div>

          {/* Carrera / Programa Académico */}
          <div>
            <label className="text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
              Carrera / Programa Académico <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <GraduationCap className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <select
                required
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium text-slate-900 bg-white"
              >
                <option value="">Selecciona una carrera...</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Opcionales: Teléfono y Correo */}
          <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                Teléfono (Opcional)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0991234567"
                  className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                Correo (Opcional)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e1312345678@live.uleam.edu.ec"
                  className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 mt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Guardar y Seleccionar</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
