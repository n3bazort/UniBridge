'use client'

import { useState } from 'react'
import { api } from '@/lib/axios'
import { toast } from 'sonner'
import { X, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  
  const [isLoading, setIsLoading] = useState(false)

  // Validation rules for secure password
  const rules = [
    { label: 'Al menos 8 caracteres', test: (str: string) => str.length >= 8 },
    { label: 'Una letra mayúscula', test: (str: string) => /[A-Z]/.test(str) },
    { label: 'Un número', test: (str: string) => /[0-9]/.test(str) },
    { label: 'Un carácter especial (!@#$%^&*)', test: (str: string) => /[!@#$%^&*]/.test(str) },
  ]

  const isValid = rules.every(r => r.test(newPassword)) && newPassword === confirmPassword && currentPassword.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return

    setIsLoading(true)
    try {
      const res = await api.post('/auth/change-password', {
        currentPassword,
        newPassword
      })
      toast.success(res.data.message || 'Contraseña actualizada correctamente')
      onClose()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al cambiar la contraseña')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        className="bg-white rounded-[20px] shadow-xl w-full max-w-md p-6 border border-[#eef2f7]"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <Lock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-[#0f172a] leading-tight">Cambiar Contraseña</h2>
              <p className="text-[13px] text-[#64748b] leading-tight mt-0.5">Asegura tu cuenta con una contraseña fuerte</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Contraseña actual</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full pl-3 pr-10 py-2.5 bg-white border border-[#cbd5e1] rounded-[10px] text-[13.5px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-[#333]"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Nueva contraseña</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-3 pr-10 py-2.5 bg-white border border-[#cbd5e1] rounded-[10px] text-[13.5px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-[#333]"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {rules.map((rule, idx) => {
                const passed = rule.test(newPassword)
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border transition-colors ${passed ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-transparent border-slate-300'}`}>
                      {passed && <svg viewBox="0 0 14 14" fill="none" className="w-2.5 h-2.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4L5.5 9.5L3 7" /></svg>}
                    </div>
                    <span className={`text-[12px] transition-colors ${passed ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>{rule.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Confirmar nueva contraseña</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-3 pr-10 py-2.5 bg-white border border-[#cbd5e1] rounded-[10px] text-[13.5px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-[#333]"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword.length > 0 && confirmPassword !== newPassword && (
              <p className="text-[12px] text-red-500 font-medium mt-1.5">Las contraseñas no coinciden</p>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-[13px] font-semibold text-[#64748b] bg-slate-100 hover:bg-slate-200 rounded-[10px] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isValid || isLoading}
              className="px-4 py-2.5 flex items-center gap-2 text-[13px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-[10px] transition-colors"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoading ? 'Guardando...' : 'Cambiar Contraseña'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
