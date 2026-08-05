'use client'

import React, { useState } from 'react'
import { X, UserCheck, Briefcase, Mail, Phone, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'

interface InlineTutorModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (tutorName: string) => void
}

export function InlineTutorModal({ isOpen, onClose, onCreated }: InlineTutorModalProps) {
  const [titlePrefix, setTitlePrefix] = useState('Ing.')
  const [fullName, setFullName] = useState('')
  const [tutorType, setTutorType] = useState<'ACADEMICO' | 'EMPRESARIAL'>('ACADEMICO')
  const [department, setDepartment] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) {
      toast.error('Ingresa el nombre completo del tutor.')
      return
    }

    const formattedTutor = `${titlePrefix.trim()} ${fullName.trim()}`.trim()
    toast.success(`Tutor "${formattedTutor}" registrado e integrado a la práctica`)
    onCreated(formattedTutor)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-bold">Registrar Nuevo Tutor</h3>
              <p className="text-[11px] text-slate-300">Asignación in-situ de tutor académico o supervisor</p>
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
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {/* Tipo de Tutor */}
          <div>
            <label className="text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">
              Tipo de Tutor <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTutorType('ACADEMICO')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                  tutorType === 'ACADEMICO'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 ring-2 ring-indigo-500/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Tutor Académico (ULEAM)
              </button>
              <button
                type="button"
                onClick={() => setTutorType('EMPRESARIAL')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                  tutorType === 'EMPRESARIAL'
                    ? 'bg-amber-50 border-amber-300 text-amber-700 ring-2 ring-amber-500/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Supervisor Empresarial
              </button>
            </div>
          </div>

          {/* Título y Nombre Completo */}
          <div>
            <label className="text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
              Nombre Completo del Tutor <span className="text-rose-500">*</span>
            </label>
            <div className="flex gap-2">
              <select
                value={titlePrefix}
                onChange={(e) => setTitlePrefix(e.target.value)}
                className="w-24 h-10 px-2 text-sm rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-bold text-slate-800 bg-slate-50"
              >
                <option value="Ing.">Ing.</option>
                <option value="Lcdo.">Lcdo.</option>
                <option value="Lcda.">Lcda.</option>
                <option value="Dr.">Dr.</option>
                <option value="Dra.">Dra.</option>
                <option value="Mgs.">Mgs.</option>
                <option value="Arq.">Arq.</option>
                <option value="Prof.">Prof.</option>
              </select>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej. Marcos Mendoza Palma"
                className="flex-1 h-10 px-3 text-sm rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium text-slate-900"
              />
            </div>
          </div>

          {/* Departamento / Empresa */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              Departamento o Empresa (Opcional)
            </label>
            <div className="relative">
              <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Ej. Facultad de Tecnologías / Depto. de Desarrollo"
                className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium text-slate-900"
              />
            </div>
          </div>

          {/* Correo y Teléfono */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                Correo (Opcional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tutor@uleam.edu.ec"
                className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 font-medium text-slate-800"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                Teléfono (Opcional)
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0998765432"
                className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 font-medium text-slate-800"
              />
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
              className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Guardar y Seleccionar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
