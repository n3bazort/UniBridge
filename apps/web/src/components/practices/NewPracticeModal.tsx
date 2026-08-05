'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Plus, User, UserCheck, BookOpen, Briefcase,
  CheckCircle2, Save, Sparkles, AlertCircle, Loader2, Search
} from 'lucide-react'
import { api } from '@/lib/axios'
import { toast } from 'sonner'
import { InlineCompanyModal } from './InlineCompanyModal'
import { InlineStudentModal } from './InlineStudentModal'
import { InlineTutorModal } from './InlineTutorModal'

interface StudentHit {
  id: string
  dni: string
  firstName: string
  lastName: string
  program?: { name?: string }
}

interface CompanyHit {
  id: string
  name: string
  contactName?: string
  recipientName?: string
}

interface ProgramItem {
  id: string
  name: string
}

interface PracticeData {
  id?: string
  studentId?: string
  companyId?: string
  academicPeriod?: string
  tutorName?: string
  practiceLevel?: string
  academicLevel?: string
  workArea?: string
  totalHours?: number
  status?: string
}

interface NewPracticeModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  practiceToEdit?: PracticeData | null
  facultyId?: string
}

/* ────────── Typeahead genérico ────────── */
interface TypeaheadProps {
  label: string
  required?: boolean
  placeholder: string
  value: string           // display text
  onSearch: (q: string) => Promise<{ id: string; label: string; sub?: string }[]>
  onSelect: (id: string, label: string) => void
  onClear: () => void
  onCreate?: () => void
  createLabel?: string
}

function Typeahead({ label, required, placeholder, value, onSearch, onSelect, onClear, onCreate, createLabel }: TypeaheadProps) {
  const [query, setQuery] = useState(value)
  const [hits, setHits] = useState<{ id: string; label: string; sub?: string }[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Sync external value
  useEffect(() => { setQuery(value) }, [value])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleChange = (q: string) => {
    setQuery(q)
    if (!q.trim()) {
      setHits([])
      setOpen(false)
      onClear()
      return
    }
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setBusy(true)
      try {
        const results = await onSearch(q.trim())
        setHits(results)
        setOpen(results.length > 0)
      } finally {
        setBusy(false)
      }
    }, 280)
  }

  const select = (hit: { id: string; label: string; sub?: string }) => {
    setQuery(hit.label)
    setOpen(false)
    onSelect(hit.id, hit.label)
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center justify-between mb-1">
        <label className="text-[12px] font-bold text-slate-700">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5"
          >
            <Plus className="w-3 h-3" />
            <span>{createLabel}</span>
          </button>
        )}
      </div>
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-10 pl-8 pr-3 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-900 bg-white"
        />
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 absolute right-3 top-3" />}
      </div>
      {open && hits.length > 0 && (
        <div className="absolute z-[400] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              onMouseDown={() => select(h)}
              className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0"
            >
              <span className="text-xs font-semibold text-slate-900">{h.label}</span>
              {h.sub && <span className="text-[11px] text-slate-500 ml-2">{h.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ────────────────────────────────────── */

export function NewPracticeModal({
  isOpen,
  onClose,
  onSaved,
  practiceToEdit,
  facultyId,
}: NewPracticeModalProps) {
  const [programs, setPrograms] = useState<ProgramItem[]>([])

  // Selected entities (IDs + display labels)
  const [studentId, setStudentId] = useState('')
  const [studentLabel, setStudentLabel] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [companyLabel, setCompanyLabel] = useState('')

  const [tutorName, setTutorName] = useState('')
  const [tutorQuery, setTutorQuery] = useState('')
  const [tutorHits, setTutorHits] = useState<string[]>([])
  const [tutorOpen, setTutorOpen] = useState(false)
  const tutorRef = useRef<HTMLDivElement>(null)
  const tutorDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [academicPeriod, setAcademicPeriod] = useState('2024-1')
  const [practiceLevel, setPracticeLevel] = useState('Prácticas Preprofesionales I')
  const [academicLevel, setAcademicLevel] = useState('Séptimo')
  const [workArea, setWorkArea] = useState('')
  const [totalHours, setTotalHours] = useState<number>(240)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [showInlineCompany, setShowInlineCompany] = useState(false)
  const [showInlineStudent, setShowInlineStudent] = useState(false)
  const [showInlineTutor, setShowInlineTutor] = useState(false)

  // Load programs (lightweight, few records) and active period
  useEffect(() => {
    if (!isOpen) return
    api.get('/programs').catch(() => ({ data: [] })).then(res => {
      const list = res.data?.data || res.data || []
      setPrograms(list)
    })
    // Prefill period from active period
    api.get('/academic-periods?active=true').catch(() => null).then(res => {
      const p = res?.data?.data?.[0] || res?.data?.[0]
      if (p?.code) setAcademicPeriod(p.code)
    })
  }, [isOpen])

  // Populate data when editing
  useEffect(() => {
    if (practiceToEdit) {
      setStudentId(practiceToEdit.studentId || '')
      setStudentLabel('')
      setCompanyId(practiceToEdit.companyId || '')
      setCompanyLabel('')
      setTutorName(practiceToEdit.tutorName || '')
      setTutorQuery(practiceToEdit.tutorName || '')
      setAcademicPeriod(practiceToEdit.academicPeriod || '2024-1')
      setPracticeLevel(practiceToEdit.practiceLevel || 'Prácticas Preprofesionales I')
      setAcademicLevel(practiceToEdit.academicLevel || 'Séptimo')
      setWorkArea(practiceToEdit.workArea || '')
      setTotalHours(practiceToEdit.totalHours || 240)
    } else {
      setStudentId(''); setStudentLabel('')
      setCompanyId(''); setCompanyLabel('')
      setTutorName(''); setTutorQuery('')
      setPracticeLevel('Prácticas Preprofesionales I')
      setAcademicLevel('Séptimo')
      setWorkArea('')
      setTotalHours(240)
    }
  }, [practiceToEdit, isOpen])

  // Close tutor suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tutorRef.current && !tutorRef.current.contains(e.target as Node)) setTutorOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!isOpen) return null

  /* ── Search functions ── */
  const searchStudents = async (q: string) => {
    try {
      const res = await api.get(`/students?search=${encodeURIComponent(q)}&limit=5`)
      const list: StudentHit[] = res.data?.data || res.data || []
      return list.map(s => ({
        id: s.id,
        label: `${s.firstName} ${s.lastName}`,
        sub: `CI: ${s.dni}${s.program?.name ? ' · ' + s.program.name : ''}`,
      }))
    } catch { return [] }
  }

  const searchCompanies = async (q: string) => {
    try {
      const res = await api.get(`/companies?search=${encodeURIComponent(q)}&limit=5`)
      const list: CompanyHit[] = res.data?.data || res.data || []
      return list.map(c => ({
        id: c.id,
        label: c.name,
        sub: c.recipientName || undefined,
      }))
    } catch { return [] }
  }

  const handleTutorInput = (q: string) => {
    setTutorQuery(q)
    setTutorName(q)
    if (!q.trim()) { setTutorHits([]); setTutorOpen(false); return }
    if (tutorDebounce.current) clearTimeout(tutorDebounce.current)
    tutorDebounce.current = setTimeout(async () => {
      try {
        // Search past tutor names stored in practices
        const res = await api.get(`/practices/tutors?search=${encodeURIComponent(q)}&limit=3`)
        const names: string[] = res.data || []
        setTutorHits(names)
        setTutorOpen(names.length > 0)
      } catch { setTutorHits([]); setTutorOpen(false) }
    }, 280)
  }

  /* ── Save ── */
  const handleSave = async (isDraft: boolean) => {
    if (!isDraft) {
      if (!studentId) { toast.error('Busca y selecciona un estudiante.'); return }
      if (!companyId) { toast.error('Busca y selecciona una empresa receptora.'); return }
      if (!tutorName.trim()) { toast.error('Ingresa el nombre del tutor académico.'); return }
      if (!workArea.trim()) { toast.error('Ingresa el área de trabajo en la empresa.'); return }
      if (!totalHours || totalHours <= 0) { toast.error('Ingresa las horas proyectadas del período.'); return }
    } else {
      if (!studentId && !companyId) {
        toast.error('Para guardar un borrador, selecciona al menos el estudiante o la empresa.')
        return
      }
    }

    setIsSubmitting(true)
    try {
      const payload = {
        studentId: studentId || undefined,
        companyId: companyId || undefined,
        facultyId: facultyId || undefined,
        academicPeriod,
        tutorName: tutorName.trim() || undefined,
        practiceLevel: practiceLevel.trim() || undefined,
        academicLevel: academicLevel.trim() || undefined,
        workArea: workArea.trim() || undefined,
        totalHours: Number(totalHours) || 0,
        status: isDraft ? 'PENDING' : 'IN_PROGRESS',
      }

      if (practiceToEdit?.id) {
        await api.patch(`/practices/${practiceToEdit.id}`, payload)
        toast.success(isDraft ? 'Práctica guardada como borrador' : 'Práctica actualizada y activada')
      } else {
        await api.post('/practices', payload)
        toast.success(isDraft ? 'Práctica guardada como borrador' : 'Práctica registrada con éxito')
      }

      onSaved()
      onClose()
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Error al guardar la práctica'
      toast.error(typeof msg === 'string' ? msg : 'Error al guardar la práctica')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {/* Overlay con opacidad mínima para no oscurecer en capas */}
      <div className="fixed inset-0 z-[250] bg-slate-900/25 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-150">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">

          {/* Header */}
          <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold">
                    {practiceToEdit ? 'Editar Práctica Preprofesional' : 'Nueva Práctica Preprofesional'}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    {practiceToEdit?.status === 'PENDING' ? 'Borrador' : 'Edición en vivo'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Busca por CI o nombre · Creación in-situ de empresas, estudiantes y tutores
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto flex flex-col gap-6 bg-slate-50/50">

            {/* 1. Estudiante y Empresa */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col gap-4">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span>1. Asignación de Estudiante y Empresa</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Typeahead
                  label="Estudiante"
                  required
                  placeholder="Busca por CI o nombre..."
                  value={studentLabel}
                  onSearch={searchStudents}
                  onSelect={(id, label) => { setStudentId(id); setStudentLabel(label) }}
                  onClear={() => { setStudentId(''); setStudentLabel('') }}
                  onCreate={() => setShowInlineStudent(true)}
                  createLabel="Crear Estudiante"
                />
                <Typeahead
                  label="Empresa Receptora"
                  required
                  placeholder="Busca por nombre de empresa..."
                  value={companyLabel}
                  onSearch={searchCompanies}
                  onSelect={(id, label) => { setCompanyId(id); setCompanyLabel(label) }}
                  onClear={() => { setCompanyId(''); setCompanyLabel('') }}
                  onCreate={() => setShowInlineCompany(true)}
                  createLabel="Crear Empresa"
                />
              </div>
            </div>

            {/* 2. Tutor y Área de Trabajo */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col gap-4">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                <span>2. Tutoría y Área de Trabajo</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Tutor con autocompletado (búsqueda entre tutores existentes) */}
                <div ref={tutorRef} className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[12px] font-bold text-slate-700">
                      Tutor Académico (ULEAM) <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowInlineTutor(true)}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Nuevo Tutor</span>
                    </button>
                  </div>
                  <div className="relative">
                    <UserCheck className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      value={tutorQuery}
                      onChange={(e) => handleTutorInput(e.target.value)}
                      placeholder="Ej. Ing. Marcos Mendoza, Mgs."
                      className="w-full h-10 pl-8 pr-3 text-xs rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-medium text-slate-900"
                    />
                  </div>
                  {tutorOpen && tutorHits.length > 0 && (
                    <div className="absolute z-[400] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                      {tutorHits.map((t, i) => (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={() => { setTutorName(t); setTutorQuery(t); setTutorOpen(false) }}
                          className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors border-b border-slate-100 last:border-0 text-xs font-semibold text-slate-900"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Área de Trabajo */}
                <div>
                  <label className="text-[12px] font-bold text-slate-700 block mb-1">
                    Área de Trabajo en Empresa <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={workArea}
                    onChange={(e) => setWorkArea(e.target.value)}
                    placeholder="Ej. Desarrollo de Software / TI / Soporte"
                    className="w-full h-10 px-3 text-xs rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-medium text-slate-900"
                  />
                  <p className="text-[10.5px] text-slate-400 mt-1">Se imprime en la Solicitud PAP-001 ("en el área de...").</p>
                </div>
              </div>
            </div>

            {/* 3. Parámetros Académicos */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col gap-4">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                <span>3. Parámetros Académicos</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

                {/* Período */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Período Académico</label>
                  <input
                    type="text"
                    value={academicPeriod}
                    onChange={(e) => setAcademicPeriod(e.target.value)}
                    placeholder="2024-1"
                    className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 font-medium text-slate-800"
                  />
                </div>

                {/* Nivel de Práctica — solo valores reales */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Nivel de Práctica</label>
                  <select
                    value={practiceLevel}
                    onChange={(e) => setPracticeLevel(e.target.value)}
                    className="w-full h-9 px-2 text-xs rounded-lg border border-slate-200 font-medium text-slate-800 bg-white"
                  >
                    <option value="Prácticas Preprofesionales I">Prácticas Preprofesionales I</option>
                    <option value="Prácticas Preprofesionales II">Prácticas Preprofesionales II</option>
                  </select>
                </div>

                {/* Nivel Académico */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Semestre</label>
                  <select
                    value={academicLevel}
                    onChange={(e) => setAcademicLevel(e.target.value)}
                    className="w-full h-9 px-2 text-xs rounded-lg border border-slate-200 font-medium text-slate-800 bg-white"
                  >
                    <option value="Quinto">Quinto</option>
                    <option value="Sexto">Sexto</option>
                    <option value="Séptimo">Séptimo</option>
                    <option value="Octavo">Octavo</option>
                    <option value="Noveno">Noveno</option>
                    <option value="Décimo">Décimo</option>
                  </select>
                </div>

                {/* Horas proyectadas */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Horas del Período <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={totalHours}
                    onChange={(e) => setTotalHours(Number(e.target.value))}
                    className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 font-bold text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Horas proyectadas a cumplir</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Los borradores no permiten emisión de documentos oficiales.</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={isSubmitting}
                className="px-4 py-2.5 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300/60 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Guardar Borrador</span>
              </button>
              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={isSubmitting}
                className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span>Guardando...</span></>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /><span>Guardar y Activar</span></>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-modales con overlay mínimo — z-index mayor para superponerse sin acumular oscuridad */}
      <InlineCompanyModal
        isOpen={showInlineCompany}
        onClose={() => setShowInlineCompany(false)}
        onCreated={(newComp) => { setCompanyId(newComp.id); setCompanyLabel(newComp.name) }}
      />
      <InlineStudentModal
        isOpen={showInlineStudent}
        onClose={() => setShowInlineStudent(false)}
        programs={programs}
        onCreated={(newSt) => { setStudentId(newSt.id); setStudentLabel(newSt.name) }}
      />
      <InlineTutorModal
        isOpen={showInlineTutor}
        onClose={() => setShowInlineTutor(false)}
        onCreated={(formattedTutor) => { setTutorName(formattedTutor); setTutorQuery(formattedTutor) }}
      />
    </>
  )
}
