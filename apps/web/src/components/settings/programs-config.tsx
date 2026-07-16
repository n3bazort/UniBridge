'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { Input } from '@/components/ui/input'
import { Search, BookOpen, XCircle, AlertCircle, Check, X, Edit2, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Program {
  id: string
  name: string
  abbreviation: string | null
  facultyId: string
  faculty?: {
    name: string
    abbreviation: string | null
  }
}

export function ProgramsConfig() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['programs-all'],
    queryFn: async () => {
      const res = await api.get('/programs', {
        params: { limit: 1000 } // Get all programs for client-side search
      })
      return res.data?.data || res.data || []
    }
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, abbreviation }: { id: string; abbreviation: string }) => {
      await api.patch(`/programs/${id}/abbreviation`, { abbreviation })
    },
    onSuccess: () => {
      toast.success('Abreviatura actualizada')
      queryClient.invalidateQueries({ queryKey: ['programs-all'] })
      queryClient.invalidateQueries({ queryKey: ['missing-abbreviations'] })
      setEditingId(null)
    },
    onError: () => {
      toast.error('Error al actualizar la abreviatura')
    }
  })

  const [deleteModal, setDeleteModal] = useState<{ show: boolean, programId: string | null }>({ show: false, programId: null })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/programs/${id}`)
    },
    onSuccess: () => {
      toast.success('Carrera eliminada')
      queryClient.invalidateQueries({ queryKey: ['programs-all'] })
      queryClient.invalidateQueries({ queryKey: ['missing-abbreviations'] })
      setDeleteModal({ show: false, programId: null })
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Error al eliminar la carrera'
      toast.error(message)
      setDeleteModal({ show: false, programId: null })
    }
  })

  const rawPrograms: Program[] = Array.isArray(response) ? response : []

  const filteredPrograms = useMemo(() => {
    return rawPrograms.filter((program) => {
      const searchStr = search.toLowerCase()
      if (!searchStr) return true
      return (
        program.name?.toLowerCase().includes(searchStr) ||
        program.abbreviation?.toLowerCase().includes(searchStr) ||
        program.faculty?.name?.toLowerCase().includes(searchStr)
      )
    }).sort((a, b) => {
      // Missing abbreviations first, then alphabetically
      if (!a.abbreviation && b.abbreviation) return -1;
      if (a.abbreviation && !b.abbreviation) return 1;
      const nameA = a.name?.toLowerCase() || ''
      const nameB = b.name?.toLowerCase() || ''
      return nameA.localeCompare(nameB)
    })
  }, [rawPrograms, search])

  const missingCount = rawPrograms.filter(p => !p.abbreviation).length

  const handleEdit = (program: Program) => {
    setEditingId(program.id)
    setEditValue(program.abbreviation || '')
  }

  const handleSave = (id: string) => {
    updateMutation.mutate({ id, abbreviation: editValue })
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditValue('')
  }

  return (
    <div className="bg-white rounded-[24px] border border-[#eef2f7] shadow-sm overflow-hidden mt-6 p-8 relative">
      {missingCount > 0 && (
        <span className="absolute -top-3 -right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 text-[12px] font-bold text-white px-2 shadow-md border-2 border-white z-10 animate-bounce">
          {missingCount}
        </span>
      )}
      <div className="flex flex-col gap-6 w-full">
        {/* TOP HEADER */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <h1 className="text-[18px] font-semibold text-[#0f172a] flex items-center gap-2 mb-2">
                <BookOpen className="w-5 h-5 text-indigo-500" />
                Gestión de Abreviaturas de Carreras
              </h1>
              <p className="text-[#64748b] text-[13px] max-w-3xl">
                Configura las abreviaturas de cada carrera. Estas abreviaturas se utilizan automáticamente para generar la numeración de los oficios y certificados.
              </p>
            </div>
            {missingCount > 0 && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 px-4 py-2.5 rounded-[12px] shadow-sm">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span className="font-semibold text-[14px]">
                  {missingCount} {missingCount === 1 ? 'carrera' : 'carreras'} sin abreviatura
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
              <Input 
                placeholder="Buscar carrera o abreviatura..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-[48px] bg-slate-50 border-[#eef2f7] focus:ring-[#3b82f6]/20 focus:border-[#3b82f6] rounded-[12px] shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* LIST */}
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1,2,3,4,5].map(i => (
              <Skeleton key={i} className="h-16 w-full rounded-[16px] bg-slate-50 border border-[#eef2f7]" />
            ))}
          </div>
        ) : error ? (
          <div className="mt-2">
            <EmptyState 
              icon={XCircle} 
              title="Error de conexión" 
              description="No se pudieron cargar las carreras. Revisa tu conexión." 
            />
          </div>
        ) : filteredPrograms.length === 0 ? (
          <div className="mt-2">
            <EmptyState 
              icon={BookOpen} 
              title="No hay carreras" 
              description="No se encontraron carreras que coincidan con tu búsqueda." 
              actionLabel="Limpiar Búsqueda"
              onAction={() => setSearch('')}
            />
          </div>
        ) : (
          <div className="bg-white rounded-[20px] shadow-sm border border-[#eef2f7] overflow-hidden">
            <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-[#f9fafb] border-b border-[#eef2f7] text-[13px] font-semibold text-[#6b7280] uppercase tracking-wider">
              <div className="col-span-6 lg:col-span-5">Carrera</div>
              <div className="col-span-6 lg:col-span-3">Abreviatura</div>
              <div className="hidden lg:block lg:col-span-4">Facultad</div>
            </div>
            
            <div className="divide-y divide-[#eef2f7]">
              {filteredPrograms.map(program => (
                <div key={program.id} className={`grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-[#f9fafb] transition-colors ${!program.abbreviation ? 'bg-red-50/20' : ''}`}>
                  <div className="col-span-6 lg:col-span-5 font-medium text-[#111827] flex items-center gap-3">
                    {!program.abbreviation && (
                      <div title="Falta configurar abreviatura" className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    )}
                    <span className="truncate">{program.name}</span>
                  </div>
                  
                  <div className="col-span-6 lg:col-span-3">
                    {editingId === program.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value.toUpperCase())}
                          className="h-8 w-24 px-2 uppercase font-mono text-[14px]"
                          placeholder="Ej: IS"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave(program.id)
                            if (e.key === 'Escape') handleCancel()
                          }}
                        />
                        <button
                          onClick={() => handleSave(program.id)}
                          disabled={updateMutation.isPending}
                          className="p-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleCancel}
                          className="p-1.5 bg-gray-50 text-gray-500 rounded-md hover:bg-gray-100 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 group">
                        {program.abbreviation ? (
                          <span className="font-mono bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md text-[13px] font-semibold border border-indigo-100">
                            {program.abbreviation}
                          </span>
                        ) : (
                          <span className="text-red-500 text-[13px] font-medium italic">
                            Sin configurar
                          </span>
                        )}
                        <button
                          onClick={() => handleEdit(program)}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                          title="Editar abreviatura"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteModal({ show: true, programId: program.id })}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                          title="Eliminar carrera"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="hidden lg:flex lg:col-span-4 text-[#6b7280] text-[14px] truncate items-center">
                    <span className="truncate">{program.faculty?.name || '---'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* DELETE MODAL */}
        {deleteModal.show && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={() => setDeleteModal({ show: false, programId: null })}>
            <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-[400px] p-6 transform transition-all border border-[#eef2f7]" onClick={e => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-[18px] font-bold text-[#111827] mb-2">Eliminar Carrera</h3>
              <p className="text-[14px] text-[#6b7280] mb-6 leading-relaxed">
                ¿Estás seguro de que deseas eliminar esta carrera? Esta acción no se puede deshacer.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button 
                  onClick={() => setDeleteModal({ show: false, programId: null })}
                  className="px-4 py-2 text-[14px] font-medium text-[#374151] bg-white hover:bg-[#f8fafc] border border-[#eef2f7] rounded-[10px] transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => deleteModal.programId && deleteMutation.mutate(deleteModal.programId)}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 text-[14px] font-medium text-white bg-red-600 hover:bg-red-700 rounded-[10px] transition-colors shadow-soft disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
