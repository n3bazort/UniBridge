'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { FileSpreadsheet, UploadCloud, CheckCircle2, AlertCircle, Download, FlaskConical, Eye, EyeOff } from 'lucide-react'

// Rutas de los archivos en /public/templates
const BLANK_TEMPLATE_URL = '/templates/Plantilla Practicas - En Blanco.xlsx'
const TEST_DATA_URL = '/templates/Datos de Prueba - Practicas.xlsx'

// Estructura que enviaremos al backend
interface ParsedStudentRow {
  dni: string
  firstName: string
  lastName: string
  email: string
  phone: string
  programName: string
  tutorName: string
  totalHours: number
  practiceLevel: string
  academicLevel: string
  companyName: string
  academicPeriod: string
  companyTutor: string
  companyContactName?: string
  companyEmail: string
  companyPhone: string
  destinatarioOficio: string
  companyPosition?: string
  /** Área de la empresa donde se desempeñará; la imprime la solicitud oficial */
  workArea?: string
}

export default function ImportsPage() {
  const [parsedData, setParsedData] = useState<ParsedStudentRow[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTestData, setIsTestData] = useState(false)


  // Estructura para empresas leídas de la hoja "Empresas"
  interface CompanyInfo {
    tutorEmpresarial: string  // Profesión + Nombre (Ej: "Ing. Guillermo Calvache Erazo")
    cargoEmpresarial: string  // Solo cargo (Ej: "Director de Educación Complementaria")
    email: string
    phone: string
  }

  // Procesador completo que lee TODAS las hojas del archivo Excel
  const processWorkbook = (workbook: XLSX.WorkBook) => {
    const newParsedData: ParsedStudentRow[] = []

    // ============================================
    // PASO 1: Construir mapa de empresas desde la hoja "Empresas" (por si hace falta cruzar en fallbacks)
    // ============================================
    const companyMap = new Map<string, CompanyInfo>()
    
    const empresasSheetName = workbook.SheetNames.find(n => n.includes('Empresas'))
    if (empresasSheetName) {
      const empresasData: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[empresasSheetName], { header: 1 })
      
      let empHeaderIdx = -1
      for (let i = 0; i < Math.min(10, empresasData.length); i++) {
        const row = empresasData[i]
        if (!row) continue
        const joined = row.join('').toLowerCase()
        if (joined.includes('nombre empresa') || joined.includes('tutor empresarial')) {
          empHeaderIdx = i
          break
        }
      }

      if (empHeaderIdx !== -1) {
        for (let i = empHeaderIdx + 1; i < empresasData.length; i++) {
          const row = empresasData[i]
          if (!row || row.length < 3) continue
          
          const companyName = String(row[1] || '').trim().toUpperCase()
          if (!companyName || companyName === '') continue

          companyMap.set(companyName, {
            tutorEmpresarial: String(row[2] || '').trim(),
            cargoEmpresarial: String(row[3] || '').trim(),
            email: String(row[4] || '').trim(),
            phone: String(row[5] || '').trim(),
          })
        }
      }
      console.log(`[Import] Se cargaron ${companyMap.size} empresas desde hoja Empresas`)
    }

    // ============================================
    // PASO 1.5: Extraer celulares de "Estudiantes"
    // ============================================
    const phoneMap = new Map<string, string>()
    interface FichaEstudiante {
      dni: string; nombre: string; email: string; carrera: string; phone: string
      tipo: string; nivel: string; horas: number; periodo: string
    }
    // Se indexa por cédula y por nombre normalizado: la plantilla permite elegir
    // al estudiante por su nombre, y entonces la cédula llega como fórmula sin
    // valor calculado.
    const studentMap = new Map<string, FichaEstudiante>()
    const claveNombre = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
    const estudiantesSheetName = workbook.SheetNames.find(n => n.includes('Estudiantes'))
    if (estudiantesSheetName) {
      const estData: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[estudiantesSheetName], { header: 1 })
      let headerIdx = -1
      let celularIdx = -1
      for (let i = 0; i < Math.min(10, estData.length); i++) {
        const row = estData[i]
        if (!row) continue
        const colIndex = row.findIndex(c => String(c).toLowerCase().includes('celular'))
        if (colIndex !== -1) {
          headerIdx = i
          celularIdx = colIndex
          break
        }
      }
      
      // Índice de la fila de encabezado, aunque la hoja no traiga columna «Celular»
      if (headerIdx === -1) {
        for (let i = 0; i < Math.min(10, estData.length); i++) {
          const row = estData[i]
          if (!row) continue
          const joined = row.join('').toLowerCase()
          if ((joined.includes('cédula') || joined.includes('cedula')) &&
              (joined.includes('apellidos') || joined.includes('nombres'))) {
            headerIdx = i
            break
          }
        }
      }

      if (headerIdx !== -1) {
        for (let i = headerIdx + 1; i < estData.length; i++) {
          const row = estData[i]
          if (!row || row.length < 3) continue
          const rawDni = String(row[1] || '').trim()
          const nombre = String(row[2] || '').trim()
          const email = String(row[3] || '').trim() // Correo is usually col 3 in this sheet
          const carrera = String(row[4] || '').trim()
          const phone = celularIdx !== -1 ? String(row[celularIdx] || '').trim() : ''

          if (phone) {
            if (rawDni) phoneMap.set(rawDni, phone)
            if (email) phoneMap.set(email, phone)
          }
          // El directorio es la fuente de verdad: nombre, correo, carrera y los
          // datos de la práctica. La hoja de Prácticas los trae por fórmula, y esa
          // fórmula no deja valor legible fuera de Excel, así que se resuelven aquí.
          if (nombre || rawDni) {
            const ficha: FichaEstudiante = {
              dni: rawDni,
              nombre,
              email,
              carrera,
              phone,
              tipo: String(row[6] || '').trim(),
              nivel: String(row[7] || '').trim(),
              horas: Number(row[8]) || 0,
              periodo: String(row[9] || '').trim(),
            }
            if (rawDni) studentMap.set(rawDni, ficha)
            if (nombre) studentMap.set(claveNombre(nombre), ficha)
          }
        }
        console.log(`[Import] Directorio de estudiantes: ${studentMap.size} claves, ${phoneMap.size} teléfonos`)
      }
    }

    // ============================================
    // PASO 2: Buscar hoja "Prácticas" (Nuevo formato unificado)
    // ============================================
    const practicasSheetName = workbook.SheetNames.find(n => n.includes('Prácticas') || n.includes('Practicas'))
    if (practicasSheetName) {
      const practicasData: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[practicasSheetName], { header: 1 })
      
      let headerRowIndex = -1
      for (let i = 0; i < Math.min(10, practicasData.length); i++) {
        const row = practicasData[i]
        if (!row) continue
        const joined = row.join('').toLowerCase()
        // Exigir varias columnas de encabezado: así el título de la hoja
        // (que menciona "elija Cédula y Empresa…") no se confunde con el header real.
        const hasCedula = joined.includes('cédula') || joined.includes('cedula')
        const hasOtroHeader = joined.includes('apellidos') || joined.includes('nombres') || joined.includes('correo')
        if (hasCedula && hasOtroHeader) {
          headerRowIndex = i
          break
        }
      }

      if (headerRowIndex !== -1) {
        let count = 0
        for (let i = headerRowIndex + 1; i < practicasData.length; i++) {
          const row = practicasData[i]
          if (!row || row.length < 5) continue
          
          const rawDni = String(row[1] || '').trim()   // Col 1: Cédula
          const nombreFila = String(row[2] || '').trim() // Col 2: Apellidos y Nombres
          if (!rawDni && !nombreFila) continue

          // La plantilla se llena eligiendo al estudiante por su nombre, así que
          // se busca primero por ahí y la cédula se recupera del directorio.
          const ficha = studentMap.get(claveNombre(nombreFila)) ?? (rawDni ? studentMap.get(rawDni) : undefined)
          const rawName = nombreFila || ficha?.nombre || ''
          const email = String(row[3] || '').trim() || ficha?.email || ''

          const { firstName, lastName } = splitName(rawName)
          let finalDni = rawDni || ficha?.dni || ''
          if (!finalDni && email.includes('@live.uleam.edu.ec')) {
            finalDni = extractDniFromEmail(email)
          }

          const companyName = String(row[5] || '').trim()
          // Igual que con el estudiante: si la fórmula no rellenó los datos de la
          // empresa, se resuelven desde el directorio de la hoja «Empresas».
          const datosEmpresa = companyMap.get(companyName.toUpperCase())
          
          const contactVal = String(row[6] || '').trim() || datosEmpresa?.tutorEmpresarial || ''
          const positionVal = String(row[7] || '').trim() || datosEmpresa?.cargoEmpresarial || ''

          newParsedData.push({
            dni: finalDni,
            firstName,
            lastName,
            email,
            phone: phoneMap.get(finalDni) || phoneMap.get(email) || ficha?.phone || '',
            programName: String(row[4] || '').trim() || ficha?.carrera || '',
            companyName,
            companyTutor: contactVal,
            companyContactName: contactVal,
            destinatarioOficio: positionVal,
            companyPosition: positionVal,
            companyEmail: String(row[8] || '').trim() || datosEmpresa?.email || '',
            companyPhone: String(row[9] || '').trim() || datosEmpresa?.phone || '',
            tutorName: String(row[10] || '').trim(),
            practiceLevel: String(row[11] || '').trim() || ficha?.tipo || '',
            academicLevel: String(row[12] || '').trim() || ficha?.nivel || '',
            totalHours: Number(row[13]) || ficha?.horas || 0,
            academicPeriod: String(row[14] || '').trim() || ficha?.periodo || '',
            // Área de la empresa que imprime la solicitud oficial. Si va vacía,
            // el sistema usa la abreviatura de la carrera.
            workArea: String(row[15] || '').trim(),
          })
          count++
        }
        
        if (count > 0) {
          console.log(`[Import] ${count} registros encontrados en hoja Prácticas (Nuevo formato)`)
          setParsedData(newParsedData)
          return
        }
      }
    }

    // ============================================
    // PASO 3: Fallback -> Buscar "Plantilla Importación" (Formato viejo 14 columnas)
    // ============================================
    const plantillaSheetName = workbook.SheetNames.find(n => n.includes('Plantilla'))
    if (plantillaSheetName) {
      const plantillaData: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[plantillaSheetName], { header: 1 })
      
      let headerRowIndex = -1
      for (let i = 0; i < Math.min(10, plantillaData.length); i++) {
        const row = plantillaData[i]
        if (!row) continue
        const joined = row.join('').toLowerCase()
        if (joined.includes('cedula') && joined.includes('nombres')) {
          headerRowIndex = i
          break
        }
      }

      if (headerRowIndex !== -1) {
        let plantillaCount = 0
        for (let i = headerRowIndex + 1; i < plantillaData.length; i++) {
          const row = plantillaData[i]
          if (!row || row.length < 5) continue
          
          const rawDni = String(row[0] || '').trim()
          const rawName = String(row[1] || '').trim()
          const email = String(row[2] || '').trim()
          
          if (rawDni.includes('Complete desde') || rawDni.includes('10 dígitos') || rawDni.includes('⚠️')) continue
          if (!rawName && !email) continue

          const { firstName, lastName } = splitName(rawName)
          let finalDni = rawDni
          if (!finalDni && email.includes('@live.uleam.edu.ec')) {
            finalDni = extractDniFromEmail(email)
          }

          const companyName = String(row[8] || '').trim()
          const companyInfo = companyMap.get(companyName.toUpperCase())

          newParsedData.push({
            dni: finalDni,
            firstName,
            lastName,
            email,
            phone: String(row[14] || '').trim(),
            programName: String(row[3] || '').trim(),
            tutorName: String(row[4] || '').trim(),
            practiceLevel: String(row[5] || '').trim(),
            academicLevel: String(row[6] || '').trim(),
            totalHours: Number(row[7]) || 0,
            companyName,
            academicPeriod: String(row[9] || '').trim(),
            destinatarioOficio: String(row[10] || '').trim() || companyInfo?.cargoEmpresarial || '',
            companyTutor: String(row[11] || '').trim() || companyInfo?.tutorEmpresarial || '',
            companyEmail: String(row[12] || '').trim() || companyInfo?.email || '',
            companyPhone: String(row[13] || '').trim() || companyInfo?.phone || '',
          })
          plantillaCount++
        }
        
        if (plantillaCount > 2) {
          console.log(`[Import] ${plantillaCount} registros encontrados en Plantilla Importación`)
          setParsedData(newParsedData)
          return
        }
      }
    }

    // ============================================
    // PASO 4: Fallback antiguo -> "Estudiantes" (formato viejo 9 columnas) + cruce (REMOVED - variable conflicts)
    // ============================================
    // TODO: This fallback section needs refactoring to avoid variable conflicts. It has been removed for now.

    setParsedData(newParsedData)
  }

  // Utilidades para nombres y cédulas
  const splitName = (rawName: string) => {
    const nameParts = rawName.split(' ')
    let lastName = ''
    let firstName = ''
    if (nameParts.length >= 4) {
      lastName = `${nameParts[0]} ${nameParts[1]}`
      firstName = nameParts.slice(2).join(' ')
    } else if (nameParts.length === 3) {
      lastName = `${nameParts[0]} ${nameParts[1]}`
      firstName = nameParts[2]
    } else {
      lastName = nameParts[0] || ''
      firstName = nameParts[1] || ''
    }
    return { firstName, lastName }
  }

  const extractDniFromEmail = (email: string) => {
    if (email.startsWith('e') || email.startsWith('E')) {
      return email.substring(1, email.indexOf('@'))
    }
    return email.substring(0, email.indexOf('@'))
  }

  // Procesa un buffer de Excel (reutilizado por drag-drop y por el botón de datos de prueba)
  const processBuffer = (buffer: ArrayBuffer, opts?: { test?: boolean }) => {
    try {
      const workbook = XLSX.read(buffer, { type: 'array' })
      console.log('[Import] Hojas detectadas:', workbook.SheetNames)
      processWorkbook(workbook)
      setIsTestData(!!opts?.test)
      toast.success(opts?.test
        ? 'Datos de prueba cargados. Revisa la tabla antes de guardar.'
        : 'Archivo procesado exitosamente. Revise la tabla.')
    } catch (error) {
      console.error(error)
      toast.error('Error al leer el archivo Excel. Asegúrate de que sea un archivo válido.')
    } finally {
      setIsProcessing(false)
    }
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setIsProcessing(true)
    const reader = new FileReader()
    reader.onload = (e) => processBuffer(e.target?.result as ArrayBuffer)
    reader.readAsArrayBuffer(file)
  }, [])

  // Carga el archivo de datos de prueba incluido en la app (para pruebas rápidas)
  const handleLoadTestData = async () => {
    setIsProcessing(true)
    try {
      const res = await fetch(encodeURI(TEST_DATA_URL))
      if (!res.ok) throw new Error('No encontrado')
      const buffer = await res.arrayBuffer()
      processBuffer(buffer, { test: true })
    } catch (error) {
      console.error(error)
      setIsProcessing(false)
      toast.error('No se pudo cargar el archivo de datos de prueba.')
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    maxFiles: 1
  })

  const handleSaveToDatabase = async () => {
    if (parsedData.length === 0) return
    
    setIsSaving(true)
    try {
      const response = await api.post('/practices/bulk-import', {
        programName: parsedData[0]?.programName || 'Ingeniería de Software',
        students: parsedData
      })
      const { count, errors } = response.data
      if (errors && errors.length > 0) {
        toast.warning(`Se importaron ${count} registros. ${errors.length} filas tuvieron errores.`)
        console.warn('Errores de importación:', errors)
      } else {
        toast.success(`¡Éxito! ${count} registros importados correctamente.`)
      }
      
      // Notificación urgente requerida por el usuario
      toast.warning('⚠️ IMPORTANTE: Recuerda ir a "Configuraciones" y declarar las abreviaturas de las nuevas carreras. Sin esto, NO se podrán generar documentos.', {
        duration: 15000,
        position: 'top-center'
      })

      setParsedData([])
      setIsTestData(false)
    } catch (error: any) {
      const serverMessage = error?.response?.data?.message
      if (serverMessage) {
        toast.error(`Error del servidor: ${Array.isArray(serverMessage) ? serverMessage.join(', ') : serverMessage}`)
      } else {
        toast.error('Ocurrió un error al guardar los datos en el servidor.')
      }
      console.error(error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <div className="flex flex-col gap-6">
        {/* Encabezado + pasos: contenido y centrado (~50% del ancho en escritorio) */}
        {!parsedData.length && (
          <div className="mx-auto w-full max-w-xl flex flex-col gap-6">
            {/* Introducción: qué se puede hacer aquí */}
            <div className="text-center">
              <p className="text-[15px] leading-relaxed text-[#6b7280]">
                Aquí cargas <strong className="font-semibold text-[#111827]">estudiantes y sus prácticas</strong> de forma masiva desde un archivo Excel.
                Son solo <strong className="font-semibold text-[#111827]">dos pasos</strong>: descarga la plantilla, llénala y súbela.
              </p>
            </div>

            {/* PASO 1 — Descargar la plantilla vacía */}
            <div className="rounded-2xl border border-[#eef2f7] bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-50 ring-1 ring-emerald-100">
                  <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Paso 1 · Descargar</span>
                  <h3 className="mt-1 text-[16px] font-semibold text-[#111827]">Descarga la plantilla vacía</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#6b7280]">
                    Es un Excel modelo con las hojas y columnas correctas. Ábrelo y completa los datos de cada estudiante y su práctica
                    <strong className="font-medium text-[#111827]"> sin cambiar los encabezados</strong>.
                  </p>
                  <a
                    href={encodeURI(BLANK_TEMPLATE_URL)}
                    download="Plantilla Practicas - En Blanco.xlsx"
                    className="mt-4 inline-flex"
                  >
                    <Button variant="outline" className="gap-2 rounded-xl border-[#e2e8f0] hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700">
                      <Download className="h-4 w-4" /> Descargar plantilla
                    </Button>
                  </a>
                </div>
              </div>
            </div>

            {/* PASO 2 — Subir el archivo lleno (dropzone contenido) */}
            <div className="rounded-2xl border border-[#eef2f7] bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sky-50 ring-1 ring-sky-100">
                  <UploadCloud className="h-6 w-6 text-sky-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-sky-600">Paso 2 · Subir</span>
                  <h3 className="mt-1 text-[16px] font-semibold text-[#111827]">Sube tu archivo completado</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#6b7280]">
                    Arrastra el Excel ya lleno (o haz clic para elegirlo). Se procesa en tu navegador y verás una
                    <strong className="font-medium text-[#111827]"> vista previa</strong> para revisarlo antes de guardar nada.
                  </p>
                </div>
              </div>

              <div
                {...getRootProps()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all
                  ${isDragActive ? 'border-sky-500 bg-sky-50' : 'border-[#cbd5e1] hover:border-sky-400 hover:bg-slate-50'}
                  ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
              >
                <input {...getInputProps()} />
                <div className={`mb-3 grid h-14 w-14 place-items-center rounded-full transition-colors ${isDragActive ? 'bg-sky-100' : 'bg-slate-100'}`}>
                  <UploadCloud className={`h-7 w-7 ${isDragActive ? 'text-sky-600' : 'text-slate-400'}`} />
                </div>
                <p className="text-[15px] font-semibold text-[#111827]">
                  {isProcessing ? 'Procesando archivo…' : isDragActive ? 'Suelta el archivo aquí' : 'Arrastra y suelta tu Excel'}
                </p>
                {!isProcessing && (
                  <p className="mt-1 text-[13px] text-[#6b7280]">
                    o <span className="font-medium text-sky-600">haz clic para buscarlo</span> en tu equipo
                  </p>
                )}
                <div className="mt-4 flex items-center gap-1.5 text-[11px] text-[#94a3b8]">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Formatos .xlsx y .xls · un archivo a la vez</span>
                </div>
              </div>
            </div>

            {/* Nota importante */}
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-[12.5px] leading-relaxed text-amber-800">
                Si importas <strong>carreras nuevas</strong>, luego ve a <strong>Configuraciones</strong> y declara sus <strong>abreviaturas</strong>.
                Sin eso no se pueden generar los documentos.
              </p>
            </div>

            {/* Datos de prueba: cargar/ocultar rápidamente (solo para pruebas) */}
            <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-violet-200 bg-violet-50/60 px-4 py-4 text-center">
              <div className="flex items-center gap-2 text-violet-700">
                <FlaskConical className="h-4 w-4" />
                <span className="text-[12.5px] font-semibold">¿Solo quieres probar el sistema?</span>
              </div>
              <p className="max-w-sm text-[12px] leading-relaxed text-violet-600/90">
                Carga un archivo de <strong>datos de prueba</strong> ya lleno (137 estudiantes) sin tener que descargar ni subir nada. Podrás revisarlo y descartarlo.
              </p>
              <Button
                variant="outline"
                onClick={handleLoadTestData}
                disabled={isProcessing}
                className="mt-1 gap-2 rounded-xl border-violet-200 bg-white text-violet-700 hover:border-violet-300 hover:bg-violet-100 hover:text-violet-800"
              >
                <Eye className="h-4 w-4" />
                {isProcessing ? 'Cargando…' : 'Mostrar datos de prueba'}
              </Button>
            </div>
          </div>
        )}

        {/* Vista Previa de Datos */}
        {parsedData.length > 0 && (
          <div className="space-y-4">
            <div className={`flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${isTestData ? 'border-violet-200 bg-violet-50' : 'border-blue-100 bg-blue-50'}`}>
              <div className="flex items-center gap-3">
                {isTestData
                  ? <FlaskConical className="h-6 w-6 shrink-0 text-violet-600" />
                  : <CheckCircle2 className="h-6 w-6 shrink-0 text-blue-600" />}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className={`font-semibold ${isTestData ? 'text-violet-900' : 'text-blue-900'}`}>Análisis exitoso</h3>
                    {isTestData && (
                      <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Datos de prueba</span>
                    )}
                  </div>
                  <p className={`text-sm ${isTestData ? 'text-violet-700' : 'text-blue-700'}`}>Se detectaron y prepararon <strong>{parsedData.length} estudiantes</strong> listos para importar. Revísalos abajo antes de guardar.</p>
                </div>
              </div>
              <div className="flex shrink-0 gap-3">
                <Button variant="outline" onClick={() => { setParsedData([]); setIsTestData(false) }} disabled={isSaving} className="flex-1 gap-2 sm:flex-none">
                  {isTestData ? <><EyeOff className="h-4 w-4" /> Ocultar</> : 'Cancelar'}
                </Button>
                <Button onClick={handleSaveToDatabase} disabled={isSaving} className="flex-1 sm:flex-none">
                  {isSaving ? 'Guardando en BD...' : 'Confirmar y Guardar'}
                </Button>
              </div>
            </div>

            <div className="rounded-md border bg-card overflow-hidden">
              <div className="max-h-[500px] overflow-auto">
                <Table>
                  <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                    <TableRow>
                      <TableHead>Cédula</TableHead>
                      <TableHead>Estudiante</TableHead>
                      <TableHead>Carrera</TableHead>
                      <TableHead>Empresa Receptora</TableHead>
                      <TableHead>Contacto / Destinatario</TableHead>
                      <TableHead>Cargo del Contacto</TableHead>
                      <TableHead>Tutor Académico</TableHead>
                      <TableHead>Nivel y Tipo</TableHead>
                      <TableHead className="text-center">Horas</TableHead>
                      <TableHead className="text-center">Periodo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{row.dni}</TableCell>
                        <TableCell>
                          <div className="font-medium text-xs">{row.lastName} {row.firstName}</div>
                          <div className="text-[10px] text-blue-600">{row.email}</div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{row.programName}</TableCell>
                        <TableCell>
                          <div className="text-xs font-medium">{row.companyName}</div>
                          <div className="text-[10px] text-slate-500">{row.companyEmail}{row.companyPhone ? ` | ${row.companyPhone}` : ''}</div>
                        </TableCell>
                        <TableCell className="text-xs">{row.companyContactName || row.companyTutor}</TableCell>
                        <TableCell className="text-xs">{row.companyPosition || row.destinatarioOficio}</TableCell>
                        <TableCell className="text-xs">{row.tutorName}</TableCell>
                        <TableCell>
                          <div className="text-xs">{row.practiceLevel}</div>
                          <div className="text-[10px] text-gray-500">{row.academicLevel}</div>
                        </TableCell>
                        <TableCell className="text-center font-semibold text-xs">{row.totalHours}</TableCell>
                        <TableCell className="text-center text-xs">{row.academicPeriod}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGate>
  )
}
