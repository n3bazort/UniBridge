'use client'

import React, { useState } from 'react'
import { X, User, CreditCard, GraduationCap, Phone, Loader2, Check } from 'lucide-react'
import { api } from '@/lib/axios'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FloatingInput } from '@/components/ui/floating-input'
import { Select } from '@/components/ui/select'

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

    const firstNameWords = firstName.trim().split(/\s+/).filter(Boolean)
    if (firstNameWords.length < 2) {
      toast.error('Debe ingresar los 2 nombres del estudiante (ej: Dilian Alexander).')
      return
    }

    const lastNameWords = lastName.trim().split(/\s+/).filter(Boolean)
    if (lastNameWords.length < 2) {
      toast.error('Debe ingresar los 2 apellidos del estudiante (ej: García López).')
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
    <div className="fixed inset-0 z-[300] bg-slate-900/15 flex items-center justify-center p-4 animate-in fade-in duration-150">
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
          <FloatingInput
            label="Cédula de identidad"
            required
            hint="1312345678"
            icon={<CreditCard className="h-4 w-4" />}
            maxLength={10}
            inputMode="numeric"
            value={dni}
            onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
            className="font-mono"
          />

          {/* Nombres y Apellidos */}
          <div className="flex flex-col gap-4">
            <FloatingInput
              label="Nombres"
              required
              hint="Dilian Alexander — los dos, como en la cédula"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />

            <FloatingInput
              label="Apellidos"
              required
              hint="García López — los dos"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          {/* Carrera / Programa Académico */}
          <div>
            <label className="text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
              Carrera <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Select
                required
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                className="w-full"
                icon={<GraduationCap className="h-4 w-4" />}
              >
                <option value="">Selecciona una carrera...</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          </div>

          {/* Opcionales: Teléfono y Correo */}
          {/* El correo se quitó: el servidor lo descarta al crear el estudiante
              —`const { email, ...dtoData } = createStudentDto`— porque el
              estudiante no tiene cuenta ni la va a tener. Pedir un dato que el
              sistema tira es una fijación regalada. */}
          <div className="pt-2 border-t border-slate-100">
            <FloatingInput
              label="Teléfono (opcional)"
              hint="0991234567"
              icon={<Phone className="h-4 w-4" />}
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="font-mono"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 mt-2 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={onClose} className="text-xs rounded-xl">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="text-xs gap-2 rounded-xl shadow-md">
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
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
