'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { StudentList, Student } from '@/components/students/StudentList'
import { StudentDetailPanel } from '@/components/students/StudentDetailPanel'

export default function StudentsPage() {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

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

  const filteredStudents = useMemo(() => {
    return rawStudents.filter((student) => {
      const searchStr = search.toLowerCase()
      if (!searchStr) return true
      return (
        student.dni?.toLowerCase().includes(searchStr) ||
        student.firstName?.toLowerCase().includes(searchStr) ||
        student.lastName?.toLowerCase().includes(searchStr) ||
        student.user?.email?.toLowerCase().includes(searchStr) ||
        student.program?.name?.toLowerCase().includes(searchStr)
      )
    }).sort((a, b) => {
      const nameA = `${a.lastName} ${a.firstName}`.toLowerCase()
      const nameB = `${b.lastName} ${b.firstName}`.toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [rawStudents, search])

  const selectedStudent = useMemo(() => {
    return rawStudents.find(s => s.id === selectedId) || null
  }, [rawStudents, selectedId])

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <div className="flex flex-col w-full min-h-[calc(100vh-72px)] bg-[#f7f7f8]">
        
        {/* TOP HEADER */}
        <div className="flex flex-col gap-4 pt-6 px-4 lg:px-8 max-w-[1600px] mx-auto w-full">
          <div>
            <h1 className="text-[24px] font-bold text-[#111827] tracking-tight">Directorio de Estudiantes</h1>
            <p className="text-[#6b7280] mt-1 text-[15px] font-medium">
              Gestiona la información de todos los estudiantes registrados.
              {rawStudents.length > 0 && <span className="ml-2 font-semibold">({filteredStudents.length} registros)</span>}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
              <Input 
                placeholder="Buscar por cédula, nombre, correo o carrera..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-10 bg-white border-[#eef2f7] focus:ring-[#3b82f6]/20 focus:border-[#3b82f6] rounded-[10px]"
              />
            </div>
          </div>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 w-full max-w-[1600px] mx-auto px-4 lg:px-8 py-6">
          {isLoading ? (
            <div className="flex justify-center p-12 text-[#6b7280] animate-pulse font-medium">Cargando datos...</div>
          ) : error ? (
            <div className="text-red-500 bg-red-50 p-4 rounded-xl border border-red-100">
              Error cargando estudiantes. Verifica la conexión.
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row items-stretch gap-6 w-full">
              
              {/* LEFT COLUMN: LIST */}
              <div className="w-full lg:w-[60%] shrink-0">
                <StudentList 
                  students={filteredStudents}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </div>
              
              {/* RIGHT COLUMN: DETAILS PANEL */}
              <div className="hidden lg:block w-full lg:w-[40%] shrink-0">
                <StudentDetailPanel student={selectedStudent} />
              </div>
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  )
}
