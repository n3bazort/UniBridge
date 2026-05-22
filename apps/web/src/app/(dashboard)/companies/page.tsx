'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { useState } from 'react'
import { Building2, Search } from 'lucide-react'

export default function CompaniesPage() {
  const [search, setSearch] = useState('')

  const { data: companies, isLoading, error } = useQuery({
    queryKey: ['companies', search],
    queryFn: async () => {
      const res = await api.get('/companies', {
        params: { search: search || undefined, limit: 100 }
      })
      return res.data?.data || res.data || []
    }
  })

  const filteredCompanies = Array.isArray(companies) ? companies : []

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Empresas Receptoras</h1>
            <p className="text-muted-foreground mt-1">
              Directorio de empresas e instituciones vinculadas a las prácticas.
              {filteredCompanies.length > 0 && <span className="ml-2 text-xs font-semibold">({filteredCompanies.length} registros)</span>}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar por nombre de empresa..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8"><span className="animate-pulse">Cargando empresas...</span></div>
        ) : error ? (
          <div className="text-destructive bg-destructive/10 p-4 rounded-md">
            Error cargando empresas. Verifica la conexión.
          </div>
        ) : (
          <div className="rounded-md border bg-card overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-[50px]">N°</TableHead>
                  <TableHead>Nombre Empresa</TableHead>
                  <TableHead>Tutor Empresarial</TableHead>
                  <TableHead>Cargo del Tutor Empresarial</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Teléfono</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.map((company: any, idx: number) => (
                  <TableRow key={company.id}>
                    <TableCell className="text-xs text-slate-400 font-medium">{idx + 1}</TableCell>
                    <TableCell className="font-semibold text-sm">{company.name}</TableCell>
                    <TableCell className="text-sm">{company.contactName || '—'}</TableCell>
                    <TableCell className="text-sm text-slate-600">{company.recipientName || '—'}</TableCell>
                    <TableCell className="text-sm text-blue-600">{company.email || '—'}</TableCell>
                    <TableCell className="text-sm font-mono">{company.phone || '—'}</TableCell>
                  </TableRow>
                ))}
                {filteredCompanies.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      No hay empresas registradas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </RoleGate>
  )
}
