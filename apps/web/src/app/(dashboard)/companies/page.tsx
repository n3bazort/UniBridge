'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { Input } from '@/components/ui/input'
import { RoleGate } from '@/components/shared/role-gate'
import { Search, Building2, XCircle } from 'lucide-react'
import { CompanyList, Company } from '@/components/companies/CompanyList'
import { CompanyDetailPanel } from '@/components/companies/CompanyDetailPanel'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'

export default function CompaniesPage() {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['companies-all'],
    queryFn: async () => {
      const res = await api.get('/companies', {
        params: { limit: 1000 }
      })
      return res.data?.data || res.data || []
    }
  })

  const rawCompanies: Company[] = Array.isArray(response) ? response : []

  const filteredCompanies = useMemo(() => {
    return rawCompanies.filter((company) => {
      const searchStr = search.toLowerCase()
      if (!searchStr) return true
      return (
        company.name?.toLowerCase().includes(searchStr) ||
        company.contactName?.toLowerCase().includes(searchStr) ||
        company.recipientName?.toLowerCase().includes(searchStr) ||
        company.email?.toLowerCase().includes(searchStr)
      )
    }).sort((a, b) => {
      const nameA = a.name?.toLowerCase() || ''
      const nameB = b.name?.toLowerCase() || ''
      return nameA.localeCompare(nameB)
    })
  }, [rawCompanies, search])

  const selectedCompany = useMemo(() => {
    return rawCompanies.find(c => c.id === selectedId) || null
  }, [rawCompanies, selectedId])

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
                  description="Empresas e instituciones receptoras vinculadas a las prácticas."
                  meta={rawCompanies.length > 0 ? `${filteredCompanies.length} registros` : undefined}
                />

                {/* Mismo buscador, misma altura y mismos tokens que Prácticas y
                    Estudiantes: eran tres campos con tres alturas distintas. El
                    detalle de qué se busca vive en el aria-label, no en un
                    placeholder largo que se corta. */}
                <div className="flex items-center gap-3">
                  <div className="relative w-full sm:max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Buscar"
                      aria-label="Buscar por nombre de empresa o contacto"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3"
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
                    description="No se pudieron cargar las empresas. Revisa tu conexión." 
                  />
                </div>
              ) : filteredCompanies.length === 0 ? (
                <div className="mt-2">
                  <EmptyState 
                    icon={Building2} 
                    title="No hay empresas" 
                    description="No se encontraron empresas que coincidan con tu búsqueda." 
                    actionLabel="Limpiar Búsqueda"
                    onAction={() => setSearch('')}
                  />
                </div>
              ) : (
                <CompanyList 
                  companies={filteredCompanies}
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
                <CompanyDetailPanel company={selectedCompany} />
              )}
            </div>
          </div>
        </PageContainer>
      </div>
    </RoleGate>
  )
}
