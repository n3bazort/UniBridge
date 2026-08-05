'use client'

import React, { useState } from 'react'
import { X, Building2, User, Mail, Phone, MapPin, Briefcase, Loader2, Check } from 'lucide-react'
import { api } from '@/lib/axios'
import { toast } from 'sonner'

interface InlineCompanyModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (company: { id: string; name: string }) => void
}

export function InlineCompanyModal({ isOpen, onClose, onCreated }: InlineCompanyModalProps) {
  const [name, setName] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !recipientName.trim() || !contactName.trim() || !email.trim()) {
      toast.error('Completa los campos obligatorios: Nombre, Destinatario de Oficios, Contacto y Correo.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await api.post('/companies', {
        name: name.trim(),
        recipientName: recipientName.trim(),
        contactName: contactName.trim(),
        email: email.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
      })

      toast.success(`Empresa "${res.data.name}" registrada con éxito`)
      onCreated({ id: res.data.id, name: res.data.name })
      onClose()
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Error al crear la empresa'
      toast.error(typeof msg === 'string' ? msg : 'Error al crear la empresa')
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
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-bold">Registrar Nueva Empresa</h3>
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
          {/* Nombre Razón Social */}
          <div>
            <label className="text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
              Nombre de la Empresa / Razón Social <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. EPAM E.P. Manta"
                className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-900"
              />
            </div>
          </div>

          {/* Destinatario y Cargo para Oficios */}
          <div>
            <label className="text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
              Destinatario y Cargo de Oficios <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                required
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Ej. Ing. Juan Pérez - Gerente de Talento Humano"
                className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-900"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Este texto se imprime en las solicitudes institucionales (PAP-001).</p>
          </div>

          {/* Contacto Operativo y Correo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                Contacto Operativo <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Ej. Lcda. María López"
                  className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                Correo Electrónico <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contacto@empresa.gob.ec"
                  className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Campos Opcionales: Dirección y Teléfono */}
          <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                Dirección (Opcional)
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Av. 4 de Noviembre, Manta"
                  className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-900"
                />
              </div>
            </div>

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
                  placeholder="052620000"
                  className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-900"
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
              className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
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
