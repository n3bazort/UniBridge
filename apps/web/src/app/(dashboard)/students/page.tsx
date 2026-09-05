'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { RoleGate } from '@/components/shared/role-gate'
import { Search, Users, XCircle, ChevronDown } from 'lucide-react'
import { StudentList, Student } from '@/components/students/StudentList'
import { StudentDetailPanel } from '@/components/students/StudentDetailPanel'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'

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
      <div className="flex flex-col w-full flex-1">
        <PageContainer variant="wide" className="flex-1">
          <div className="flex flex-col lg:flex-row items-stretch gap-6 w-full">
            
            {/* LEFT COLUMN: HEADER + LIST */}
            <div className="flex flex-col gap-6 w-full lg:w-[60%] shrink-0">
              {/* TOP HEADER */}
              <div className="flex flex-col gap-4">
                <PageHeader
                  description="Registro de estudiantes con práctica en el período."
                  meta={rawStudents.length > 0 ? `${filteredStudents.length} registros` : undefined}
                />

                {/* Buscador y filtro, misma altura y mismos tokens que la barra
                    de Prácticas. El filtro era un FilterChip: tres <div> con
                    onClick que Tab no alcanzaba, y donde pulsar el texto en vez
                    del chevrón saltaba al siguiente valor sin avisar. Ahora es
                    un <select> con su <label>. */}
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1 sm:max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Buscar"
                      aria-label="Buscar por cédula, nombre o correo"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3"
                    />
                  </div>

                  <div className="flex min-w-0 items-center gap-2">
                    <label htmlFor="filtro-carrera" className="hidden shrink-0 text-sm text-muted-foreground sm:block">
                      Carrera
                    </label>
                    <div className="relative min-w-0 flex-1 sm:flex-none">
                      <Select
                        id="filtro-carrera"
                        value={filterProgram ?? ''}
                        onChange={(e) => setFilterProgram(e.target.value || null)}
                        className="w-full sm:w-56"
                      >
                        <option value="">Todas las carreras</option>
                        {programs.map((p) => (
                          <option key={p as string} value={p as string}>{p as string}</option>
                        ))}
                      </Select>
                    </div>
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
        </PageContainer>
      </div>
    </RoleGate>
  )
}
