'use client'

import React, { useState, useEffect } from 'react'
import {
  X, Plus, Building2, User, UserCheck, Calendar, Clock, BookOpen,
  Briefcase, FileText, CheckCircle2, Save, Sparkles, AlertCircle, Loader2
} from 'lucide-react'
import { api } from '@/lib/axios'
import { toast } from 'sonner'
import { InlineCompanyModal } from './InlineCompanyModal'
import { InlineStudentModal } from './InlineStudentModal'
import { InlineTutorModal } from './InlineTutorModal'

interface StudentItem {
  id: string
  dni: string
  firstName: string
  lastName: string
  program?: { name: string }
}

interface CompanyItem {
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
  startDate?: string
  endDate?: string
  status?: string
}

interface NewPracticeModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  practiceToEdit?: PracticeData | null
  facultyId?: string
}

export function NewPracticeModal({
  isOpen,
  onClose,
  onSaved,
  practiceToEdit,
  facultyId,
}: NewPracticeModalProps) {
  const [students, setStudents] = useState<StudentItem[]>([])
  const [companies, setCompanies] = useState<CompanyItem[]>([])
  const [programs, setPrograms] = useState<ProgramItem[]>([])
  const [isLoadingMasterData, setIsLoadingMasterData] = useState(false)

  // Form State
  const [studentId, setStudentId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [tutorName, setTutorName] = useState('')
  const [academicPeriod, setAcademicPeriod] = useState('2024-1')
  const [practiceLevel, setPracticeLevel] = useState('Prácticas Preprofesionales I')
  const [academicLevel, setAcademicLevel] = useState('Séptimo')
  const [workArea, setWorkArea] = useState('')
  const [totalHours, setTotalHours] = useState<number>(240)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)

  // Inline Creation Sub-Modals
  const [showInlineCompany, setShowInlineCompany] = useState(false)
  const [showInlineStudent, setShowInlineStudent] = useState(false)
  const [showInlineTutor, setShowInlineTutor] = useState(false)

  // Load master data (Students, Companies, Programs)
  useEffect(() => {
    if (!isOpen) return
    const fetchMaster = async () => {
      setIsLoadingMasterData(true)
      try {
        const [resSt, resComp, resProg] = await Promise.all([
          api.get('/students?limit=500').catch(() => ({ data: [] })),
          api.get('/companies?limit=500').catch(() => ({ data: [] })),
          api.get('/programs').catch(() => ({ data: [] })),
        ])

        const stList = resSt.data?.data || resSt.data || []
        const compList = resComp.data?.data || resComp.data || []
        const progList = resProg.data?.data || resProg.data || []

        setStudents(stList)
        setCompanies(compList)
        setPrograms(progList)
      } catch (err) {
        console.error('Error cargando datos maestros', err)
      } finally {
        setIsLoadingMasterData(false)
      }
    }
    fetchMaster()
  }, [isOpen])

  // Populate data when editing
  useEffect(() => {
    if (practiceToEdit) {
      setStudentId(practiceToEdit.studentId || '')
      setCompanyId(practiceToEdit.companyId || '')
      setTutorName(practiceToEdit.tutorName || '')
      setAcademicPeriod(practiceToEdit.academicPeriod || '2024-1')
      setPracticeLevel(practiceToEdit.practiceLevel || 'Prácticas Preprofesionales I')
      setAcademicLevel(practiceToEdit.academicLevel || 'Séptimo')
      setWorkArea(practiceToEdit.workArea || '')
      setTotalHours(practiceToEdit.totalHours || 240)
      setStartDate(practiceToEdit.startDate ? practiceToEdit.startDate.slice(0, 10) : '')
      setEndDate(practiceToEdit.endDate ? practiceToEdit.endDate.slice(0, 10) : '')
    } else {
      setStudentId('')
      setCompanyId('')
      setTutorName('')
      setAcademicPeriod('2024-1')
      setPracticeLevel('Prácticas Preprofesionales I')
      setAcademicLevel('Séptimo')
      setWorkArea('')
      setTotalHours(240)
      setStartDate('')
      setEndDate('')
    }
  }, [practiceToEdit, isOpen])

  if (!isOpen) return null

  // Save as Draft (PENDING) or Save Complete (IN_PROGRESS/COMPLETED)
  const handleSave = async (isDraft: boolean) => {
    if (!isDraft) {
      // Complete Save Validation
      if (!studentId) { toast.error('Selecciona o registra un estudiante.'); return }
      if (!companyId) { toast.error('Selecciona o registra una empresa receptora.'); return }
      if (!tutorName.trim()) { toast.error('Ingresa el nombre del tutor académico.'); return }
      if (!workArea.trim()) { toast.error('Ingresa el área de trabajo en la empresa.'); return }
      if (!totalHours || totalHours <= 0) { toast.error('Ingresa las horas totales de la práctica.'); return }
    } else {
      // Draft validation (requires at least Student or Company)
      if (!studentId && !companyId) {
        toast.error('Para guardar un borrador, selecciona al menos el estudiante o la empresa.')
        return
      }
    }

    setIsSubmitting(true)
    try {
      const selectedStudent = students.find((s) => s.id === studentId)
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
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
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
      <div className="fixed inset-0 z-[250] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header - Styled like Google Workspace / Monday workspace */}
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
                <p className="text-[11.5px] text-slate-400">
                  Google Workspace & Monday Style · Gestión in-situ de estudiantes, empresas y tutores
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center transition-colors"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Body Form Grid */}
          <div className="p-6 overflow-y-auto flex flex-col gap-6 bg-slate-50/50">
            {/* Sección 1: Estudiante y Empresa (In-situ Creation) */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col gap-4">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span>1. Asignación de Estudiante y Empresa</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Selector Estudiante */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[12px] font-bold text-slate-700">
                      Estudiante <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowInlineStudent(true)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Crear Estudiante</span>
                    </button>
                  </div>
                  <select
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    className="w-full h-10 px-3 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-900 bg-white"
                  >
                    <option value="">Selecciona un estudiante...</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.dni} - {s.firstName} {s.lastName} ({s.program?.name || 'Carrera'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selector Empresa */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[12px] font-bold text-slate-700">
                      Empresa Receptora <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowInlineCompany(true)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Crear Empresa</span>
                    </button>
                  </div>
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="w-full h-10 px-3 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-900 bg-white"
                  >
                    <option value="">Selecciona una empresa...</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.recipientName ? `(${c.recipientName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Sección 2: Tutor y Área de Trabajo */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col gap-4">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                <span>2. Tutoría y Área de Trabajo</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tutor Académico */}
                <div>
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
                      <span>Crear Tutor</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={tutorName}
                    onChange={(e) => setTutorName(e.target.value)}
                    placeholder="Ej. Ing. Marcos Mendoza, Mgs."
                    className="w-full h-10 px-3 text-xs rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-medium text-slate-900"
                  />
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

            {/* Sección 3: Parámetros Académicos y Duración */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col gap-4">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                <span>3. Parámetros Académicos y Duración</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Período Académico */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Período Académico
                  </label>
                  <input
                    type="text"
                    value={academicPeriod}
                    onChange={(e) => setAcademicPeriod(e.target.value)}
                    placeholder="2024-1"
                    className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 font-medium text-slate-800"
                  />
                </div>

                {/* Nivel de Práctica */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Nivel de Práctica
                  </label>
                  <select
                    value={practiceLevel}
                    onChange={(e) => setPracticeLevel(e.target.value)}
                    className="w-full h-9 px-2 text-xs rounded-lg border border-slate-200 font-medium text-slate-800 bg-white"
                  >
                    <option value="Prácticas Preprofesionales I">Prácticas Preprofesionales I</option>
                    <option value="Prácticas Preprofesionales II">Prácticas Preprofesionales II</option>
                    <option value="Prácticas Laborales I">Prácticas Laborales I</option>
                    <option value="Prácticas Laborales II">Prácticas Laborales II</option>
                    <option value="Servicio Comunitario">Servicio Comunitario</option>
                  </select>
                </div>

                {/* Nivel Académico */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Nivel Académico (Semestre)
                  </label>
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

                {/* Horas Totales */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Horas Totales <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={totalHours}
                    onChange={(e) => setTotalHours(Number(e.target.value))}
                    className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Fechas Inicio / Fin */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Fecha de Inicio
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 font-medium text-slate-800"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Fecha Fin (Proyectada)
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 font-medium text-slate-800"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer Bar - Dual Actions (Draft vs Complete Save) */}
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
                <span>Guardar como Borrador</span>
              </button>

              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={isSubmitting}
                className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Guardar y Activar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Modales Flotantes In-Situ */}
      <InlineCompanyModal
        isOpen={showInlineCompany}
        onClose={() => setShowInlineCompany(false)}
        onCreated={(newComp) => {
          setCompanies((prev) => [newComp, ...prev])
          setCompanyId(newComp.id)
        }}
      />

      <InlineStudentModal
        isOpen={showInlineStudent}
        onClose={() => setShowInlineStudent(false)}
        programs={programs}
        onCreated={(newSt) => {
          setStudents((prev) => [
            { id: newSt.id, dni: newSt.dni, firstName: newSt.name.split(' ')[0], lastName: newSt.name.split(' ').slice(1).join(' ') },
            ...prev,
          ])
          setStudentId(newSt.id)
        }}
      />

      <InlineTutorModal
        isOpen={showInlineTutor}
        onClose={() => setShowInlineTutor(false)}
        onCreated={(formattedTutor) => {
          setTutorName(formattedTutor)
        }}
      />
    </>
  )
}
