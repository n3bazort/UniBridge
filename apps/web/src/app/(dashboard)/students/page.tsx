'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState } from 'react'

export default function StudentsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['students', page, search],
    queryFn: async () => {
      const res = await api.get('/students', {
        params: { page, limit: 20, search: search || undefined }
      })
      return res.data
    }
  })

  const students = response?.data || []
  const meta = response?.meta

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Estudiantes</h1>
            <p className="text-muted-foreground mt-1">
              Directorio de estudiantes registrados en el sistema.
              {meta && <span className="ml-2 text-xs font-semibold">({meta.total} registros)</span>}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Input 
            placeholder="Buscar por nombre, apellido o cédula..." 
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="max-w-md"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8"><span className="animate-pulse">Cargando datos...</span></div>
        ) : error ? (
          <div className="text-destructive bg-destructive/10 p-4 rounded-md">
            Error cargando estudiantes. Verifica la conexión.
          </div>
        ) : (
          <>
            <div className="rounded-md border bg-card overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-[50px]">N°</TableHead>
                    <TableHead>Cédula</TableHead>
                    <TableHead>Apellidos y Nombres</TableHead>
                    <TableHead>Correo Institucional</TableHead>
                    <TableHead>Carrera</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student: any, idx: number) => (
                    <TableRow key={student.id}>
                      <TableCell className="text-xs text-slate-400 font-medium">{(page - 1) * 20 + idx + 1}</TableCell>
                      <TableCell className="font-mono text-xs font-medium">{student.dni}</TableCell>
                      <TableCell className="font-medium text-sm">
                        {student.lastName} {student.firstName}
                      </TableCell>
                      <TableCell className="text-sm text-blue-600">{student.user?.email || '—'}</TableCell>
                      <TableCell className="text-sm text-slate-500">{student.program?.name || '—'}</TableCell>
                    </TableRow>
                  ))}
                  {students.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        No hay estudiantes registrados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {meta && meta.totalPages > 1 && (
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-muted-foreground">
                  Página {meta.page} de {meta.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    ← Anterior
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>
                    Siguiente →
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </RoleGate>
  )
}
