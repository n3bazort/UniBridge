'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { Input } from '@/components/ui/input'
import { Search, Users, XCircle } from 'lucide-react'
import { StudentList, Student } from '@/components/students/StudentList'
import { StudentDetailPanel } from '@/components/students/StudentDetailPanel'
import { FilterChip } from '@/components/ui/filter-chip'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'

export default function StudentsPage() {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  
  const [filterProgram, setFilterProgram] = useState<string | null>(null)

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['students-all'],
    queryFn: async () => {
      const res = await api.get('/students', {
        params: { limit: 1000 }
      })
      return res.data
    }
  })

  const rawStudents: Student[] = response?.data || []
  
  const programs = useMemo(() => Array.from(new Set(rawStudents.map(s => s.program?.name || 'Desconocido'))).sort(), [rawStudents])

  const filteredStudents = useMemo(() => {
    return rawStudents.filter((student) => {
      const searchStr = search.toLowerCase()
      const pProgram = student.program?.name || 'Desconocido'
      
      const matchesSearch = !searchStr || (
        student.dni?.toLowerCase().includes(searchStr) ||
        student.firstName?.toLowerCase().includes(searchStr) ||
        student.lastName?.toLowerCase().includes(searchStr) ||
        student.user?.email?.toLowerCase().includes(searchStr) ||
        pProgram.toLowerCase().includes(searchStr)
      )
      
      const matchesProgram = !filterProgram || pProgram === filterProgram
      
      return matchesSearch && matchesProgram
    }).sort((a, b) => {
      const nameA = `${a.lastName} ${a.firstName}`.toLowerCase()
      const nameB = `${b.lastName} ${b.firstName}`.toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [rawStudents, search, filterProgram])

  const selectedStudent = useMemo(() => {
    return rawStudents.find(s => s.id === selectedId) || null
  }, [rawStudents, selectedId])

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <div className="flex flex-col w-full min-h-[calc(100vh-72px)] bg-[#f7f7f8]">
        <div className="flex-1 w-full max-w-[1600px] mx-auto px-4 lg:px-8 py-6">
          <div className="flex flex-col lg:flex-row items-stretch gap-6 w-full">
            
            {/* LEFT COLUMN: HEADER + LIST */}
            <div className="flex flex-col gap-6 w-full lg:w-[60%] shrink-0">
              {/* TOP HEADER */}
              <div className="flex flex-col gap-4">
                <div>
                  <h1 className="text-[24px] font-bold text-[#111827] tracking-tight">Directorio de Estudiantes</h1>
                  <p className="text-[#6b7280] mt-1 text-[15px] font-medium">
                    Gestiona la información de todos los estudiantes registrados.
                    {rawStudents.length > 0 && <span className="ml-2 font-semibold">({filteredStudents.length} registros)</span>}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative max-w-md w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
                    <Input 
                      placeholder="Buscar por cédula, nombre o correo..." 
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10 h-[48px] bg-white border-[#eef2f7] focus:ring-[#3b82f6]/20 focus:border-[#3b82f6] rounded-[12px] shadow-sm"
                    />
                  </div>
                  
                  <div className="flex items-center shrink-0">
                    <FilterChip 
                      label="Carrera" 
                      value={filterProgram} 
                      onChange={setFilterProgram}
                      options={[
                        { value: null, label: 'Todas' },
                        ...programs.map(p => ({ value: p as string, label: p as string === 'Tecnologías de la Información' ? 'TI' : p as string }))
                      ]} 
                    />
                  </div>
                </div>
              </div>

              {/* LIST */}
              {isLoading ? (
                <div className="flex flex-col gap-3">
                  {[1,2,3,4,5].map(i => (
                    <Skeleton key={i} className="h-20 w-full rounded-[16px] bg-white border border-[#eef2f7]" />
                  ))}
                </div>
              ) : error ? (
                <div className="mt-2">
                  <EmptyState 
                    icon={XCircle} 
                    title="Error de conexión" 
                    description="No se pudieron cargar los estudiantes. Revisa tu conexión." 
                  />
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="mt-2">
                  <EmptyState 
                    icon={Users} 
                    title="No hay estudiantes" 
                    description="No se encontraron estudiantes que coincidan con tu búsqueda." 
                    actionLabel="Limpiar Filtros"
                    onAction={() => {
                      setSearch('')
                      setFilterProgram(null)
                    }}
                  />
                </div>
              ) : (
                <StudentList 
                  students={filteredStudents}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              )}
            </div>
            
            {/* RIGHT COLUMN: DETAILS PANEL */}
            <div className="hidden lg:block w-full lg:w-[40%] shrink-0 sticky top-6 self-start h-[calc(100vh-40px)] overflow-y-auto no-scrollbar pb-6">
              {isLoading ? (
                <Skeleton className="h-full min-h-[600px] w-full rounded-[24px] bg-white border border-[#eef2f7]" />
              ) : (
                <StudentDetailPanel student={selectedStudent} />
              )}
            </div>
          </div>
        </div>
      </div>
    </RoleGate>
  )
}
