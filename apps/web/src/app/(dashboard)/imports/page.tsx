'use client'

import { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import { api } from '@/lib/axios'
import { cn } from '@/lib/utils'
import { RoleGate } from '@/components/shared/role-gate'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { FileSpreadsheet, UploadCloud, CheckCircle2, AlertCircle, Download, FlaskConical, Eye, EyeOff, Ban, CalendarCheck, ShieldQuestion, Loader2, XCircle } from 'lucide-react'
import { usePeriodStore } from '@/store/period'

// Rutas de los archivos en /public/templates
const BLANK_TEMPLATE_URL = '/templates/Plantilla Practicas - En Blanco.xlsx'
const TEST_DATA_URL = '/templates/Datos de Prueba - Practicas.xlsx'

interface AcademicPeriod {
  id: string
  code: string
  name: string
  isActive: boolean
}

/**
 * Misma normalización que aplica el servidor (`period.util.ts`): «2025-I»,
 * «2025 / 1» y «2025-1» son el mismo semestre. Se replica aquí para que el
 * aviso salga antes de guardar y no después de un viaje al servidor.
 *
 * Si el texto no tiene forma de periodo se devuelve intacto: un valor raro
 * debe verse en pantalla, no corregirse solo.
 */
function normalizarPeriodo(raw?: string | null): string {
  const texto = (raw ?? '').trim()
  if (!texto) return ''
  const m = texto.match(/(\d{4})\s*[-/ ]\s*(II|I|1|2)\b/i)
  if (!m) return texto
  const semestre = m[2].toUpperCase() === 'II' ? '2' : m[2].toUpperCase() === 'I' ? '1' : m[2]
  return `${m[1]}-${semestre}`
}

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

/** Lo que el servidor dice de cada fila antes de escribir nada (RF-26). */
interface FilaRevisada {
  indice: number
  dni: string
  nombre: string
  empresa: string | null
  tutor: string | null
  severidad: 'ok' | 'aviso' | 'error'
  errores: string[]
  avisos: string[]
  yaRegistrado: boolean
  sobrescribePractica: boolean
  empresaNueva: boolean
}

interface Revision {
  academicPeriod: string
  total: number
  resumen: { ok: number; aviso: number; error: number }
  filas: FilaRevisada[]
}

export default function ImportsPage() {
  const [parsedData, setParsedData] = useState<ParsedStudentRow[]>([])
  const [revision, setRevision] = useState<Revision | null>(null)
  const [revisando, setRevisando] = useState(false)
  /** Índices de las filas marcadas para cargar. */
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set())
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTestData, setIsTestData] = useState(false)
  const { selectedPeriod } = usePeriodStore()

  // Mismo queryKey que el selector del topbar: la lista ya viene en cache.
  const { data: periods = [] } = useQuery<AcademicPeriod[]>({
    queryKey: ['academic-periods'],
    queryFn: async () => (await api.get('/academic-periods')).data,
    staleTime: 5 * 60 * 1000,
  })
  const periodoActivo = periods.find((p) => p.isActive) ?? null

  /**
   * Reparte las filas leídas del Excel entre las que se van a cargar y las
   * que no. El destino nunca es el periodo que el usuario está mirando:
   * es siempre el periodo activo, porque un semestre cerrado no admite
   * datos nuevos. Cuando el archivo declara otro periodo, la fila se aparta
   * y se dice por qué, en vez de dejar que la llave foránea la rechace
   * después con un error de base de datos.
   */
  const analisis = useMemo(() => {
    const filas = parsedData.map((row) => {
      const periodoFila = normalizarPeriodo(row.academicPeriod)
      let motivo: string | null = null

      if (!row.dni) {
        motivo = 'Sin cédula'
      } else if (!periodoActivo) {
        motivo = 'No hay periodo abierto'
      } else if (periodoFila && periodoFila !== periodoActivo.code) {
        motivo = `Es del periodo ${periodoFila}`
      }

      return { row, periodoFila, motivo }
    })

    return {
      filas,
      validas: filas.filter((f) => !f.motivo).map((f) => f.row),
      descartadas: filas.filter((f) => f.motivo),
    }
  }, [parsedData, periodoActivo])

  // El usuario puede estar parado en un periodo cerrado mirando su historial.
  // Si carga un archivo desde ahí, los datos NO entran donde está mirando.
  const mirandoOtroPeriodo = !!periodoActivo && !!selectedPeriod && selectedPeriod !== periodoActivo.code


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

  /**
   * Pide al servidor la revisión de todo el archivo (RF-26).
   *
   * Lo que la pantalla no puede saber sola vive en la base: si el estudiante ya
   * existe, si ya tiene práctica en el período, si al docente le queda cupo.
   * Nada se escribe hasta que se pulsa Guardar.
   */
  const handleRevisar = async () => {
    const aRevisar = analisis.validas
    if (aRevisar.length === 0) return

    setRevisando(true)
    try {
      const { data } = await api.post<Revision>('/practices/bulk-import/preview', {
        programName: aRevisar[0]?.programName || 'Ingeniería de Software',
        students: aRevisar,
      })
      setRevision(data)
      // Entran marcadas todas las que se pueden cargar: desmarcar es la
      // excepción, no la norma.
      setMarcadas(new Set(data.filas.filter((f) => f.severidad !== 'error').map((f) => f.indice)))

      if (data.resumen.error > 0) {
        toast.warning(`${data.resumen.error} fila(s) no se pueden cargar. Mira el detalle de cada una.`)
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo revisar el archivo')
    } finally {
      setRevisando(false)
    }
  }

  /**
   * Cada fila del archivo, ya cruzada con lo que dijo el servidor.
   * Se calcula una vez y la usan las dos secciones, en vez de repetir el
   * cruce dentro del render de cada tabla.
   */
  const filasPreview = useMemo(
    () =>
      analisis.filas.map(({ row, motivo }, i) => {
        // La revisión numera solo las filas válidas, que son las que se le
        // enviaron; las apartadas por periodo no están.
        const posicion = analisis.validas.indexOf(row)
        const r = revision && posicion >= 0 ? revision.filas[posicion] : undefined
        return { key: i, row, motivo, r, bloqueada: !!motivo || r?.severidad === 'error' }
      }),
    [analisis, revision],
  )

  /** Lo que entra y lo que no, separado antes de pintar nada. */
  const grupos = useMemo(
    () => ({
      disponibles: filasPreview.filter((f) => !f.bloqueada),
      bloqueadas: filasPreview.filter((f) => f.bloqueada),
    }),
    [filasPreview],
  )

  const alternarFila = (indice: number) => {
    setMarcadas((prev) => {
      const s = new Set(prev)
      if (s.has(indice)) s.delete(indice)
      else s.add(indice)
      return s
    })
  }

  const alternarTodas = () => {
    if (!revision) return
    const cargables = revision.filas.filter((f) => f.severidad !== 'error').map((f) => f.indice)
    setMarcadas((prev) => (prev.size === cargables.length ? new Set() : new Set(cargables)))
  }

  const handleSaveToDatabase = async () => {
    // Con revisión hecha, solo viajan las filas marcadas. Sin ella, las que
    // pasaron el análisis local: mandar las apartadas sería gastar el viaje
    // para que el servidor devuelva el mismo aviso que ya está en pantalla.
    const aCargar = revision
      ? analisis.validas.filter((_, i) => marcadas.has(i))
      : analisis.validas
    if (aCargar.length === 0) return

    setIsSaving(true)
    try {
      const response = await api.post('/practices/bulk-import', {
        programName: aCargar[0]?.programName || 'Ingeniería de Software',
        students: aCargar
      })
      const { count, errors, periodo } = response.data
      const destino = periodo ? ` en ${periodo}` : ''
      if (errors && errors.length > 0) {
        toast.warning(`Se importaron ${count} registros${destino}. ${errors.length} filas tuvieron errores.`)
        console.warn('Errores de importación:', errors)
      } else {
        toast.success(`¡Éxito! ${count} registros importados${destino}.`)
      }
      if (analisis.descartadas.length > 0) {
        toast.info(`${analisis.descartadas.length} fila(s) se omitieron por no pertenecer al periodo abierto.`)
      }
      
      // Notificación urgente requerida por el usuario
      toast.warning('⚠️ IMPORTANTE: Recuerda ir a "Configuraciones" y declarar las abreviaturas de las nuevas carreras. Sin esto, NO se podrán generar documentos.', {
        duration: 15000,
        position: 'top-center'
      })

      setParsedData([])
      setIsTestData(false)
      setRevision(null)
      setMarcadas(new Set())
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
      <div className="flex flex-col w-full flex-1">
        {/* `wide`, no `reading`: la vista previa es una tabla de datos con
            varias columnas. En 1100px las celdas se parten en tres líneas. */}
        <PageContainer variant="wide" className="flex flex-col gap-6">
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
                <Input {...getInputProps()} />
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
                <div className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
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
                  <p className={`text-sm ${isTestData ? 'text-violet-700' : 'text-blue-700'}`}>
                    Se leyeron <strong>{parsedData.length} filas</strong>. Se cargarán{' '}
                    <strong>{analisis.validas.length}</strong>
                    {periodoActivo
                      ? <> en el periodo <strong>{periodoActivo.code}</strong>, el único abierto.</>
                      : <> — pero no hay ningún periodo abierto.</>}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-3">
                <Button
                  variant="outline"
                  onClick={() => { setParsedData([]); setIsTestData(false); setRevision(null); setMarcadas(new Set()) }}
                  disabled={isSaving}
                  className="flex-1 gap-2 sm:flex-none"
                >
                  {isTestData ? <><EyeOff className="h-4 w-4" /> Ocultar</> : 'Cancelar'}
                </Button>

                {/* Revisar es la acción principal, y va primero. Antes el
                    botón grande y azul decía «Guardar 34 de 38» mientras
                    «Revisar» era el gris de al lado: la pantalla invitaba a
                    saltarse el único paso donde se puede elegir qué entra y
                    ver qué choca. Ahora hasta que no se revisa no se guarda. */}
                {!revision ? (
                  <Button
                    onClick={handleRevisar}
                    disabled={revisando || analisis.validas.length === 0}
                    className="flex-1 gap-2 sm:flex-none"
                    title={analisis.validas.length === 0 ? 'Ninguna fila del archivo corresponde al periodo abierto' : undefined}
                  >
                    {revisando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldQuestion className="h-4 w-4" />}
                    {revisando ? 'Revisando…' : `Revisar ${analisis.validas.length} fila${analisis.validas.length === 1 ? '' : 's'}`}
                  </Button>
                ) : (
                  <Button
                    onClick={handleSaveToDatabase}
                    disabled={isSaving || marcadas.size === 0}
                    className="flex-1 gap-2 sm:flex-none"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {isSaving ? 'Guardando…' : `Guardar ${marcadas.size} de ${revision.total}`}
                  </Button>
                )}
              </div>
            </div>

            {mirandoOtroPeriodo && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p className="text-sm leading-relaxed text-amber-900">
                  Estás viendo <strong>{selectedPeriod}</strong> en el selector de arriba, pero ese periodo
                  está cerrado. Lo que cargues entrará en <strong>{periodoActivo?.code}</strong>, que es el
                  periodo abierto. Los periodos anteriores se consultan, no reciben datos nuevos.
                </p>
              </div>
            )}

            {analisis.descartadas.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <Ban className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-amber-900">
                      {analisis.descartadas.length} fila{analisis.descartadas.length === 1 ? '' : 's'} no se
                      cargará{analisis.descartadas.length === 1 ? '' : 'n'}
                    </h4>
                    <p className="mt-0.5 text-sm text-amber-800">
                      El resto sí se guarda. Corrige el archivo y vuelve a subirlo solo si necesitas estas filas.
                    </p>
                    <ul className="mt-2.5 space-y-1">
                      {analisis.descartadas.slice(0, 8).map((f, i) => (
                        <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-amber-900">
                          <span className="font-medium">{f.row.lastName} {f.row.firstName}</span>
                          {f.row.dni && <span className="font-mono text-[11px] text-amber-700">{f.row.dni}</span>}
                          <span className="text-amber-700">— {f.motivo}</span>
                        </li>
                      ))}
                      {analisis.descartadas.length > 8 && (
                        <li className="text-[13px] text-amber-700">
                          y {analisis.descartadas.length - 8} más, marcadas abajo en la tabla.
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {revision && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {revision.resumen.ok} sin novedad
                </span>
                {revision.resumen.aviso > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-700">
                    <AlertCircle className="h-3.5 w-3.5" /> {revision.resumen.aviso} con avisos
                  </span>
                )}
                {revision.resumen.error > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[12px] font-semibold text-red-700">
                    <XCircle className="h-3.5 w-3.5" /> {revision.resumen.error} no se pueden cargar
                  </span>
                )}
                <span className="ml-auto text-[12px] text-slate-500">
                  Entrarán en <strong className="text-slate-700">{revision.academicPeriod}</strong>. Nada se escribe hasta que guardes.
                </span>
              </div>
            )}

            {/* ── Vista previa en dos secciones ──
                Antes era una sola tabla donde lo que entra y lo que no entra
                se distinguían por el color de fondo de la fila. Con 38 filas
                eso obliga a recorrerlas una por una para saber qué se va a
                guardar. Ahora son dos bloques con su propio recuento.

                El alto se mide en vh y no en píxeles fijos: así el borde
                inferior de cada bloque —y con él su barra de desplazamiento
                horizontal— queda siempre dentro de la pantalla, sin tener que
                bajar hasta el final del listado para alcanzarla. */}
            {[
              {
                clave: 'disponibles',
                titulo: revision ? 'Disponibles para cargar' : 'Se cargarán',
                sub: revision
                  ? 'Marca o desmarca las que quieras dejar fuera.'
                  : 'Pulsa «Revisar» para comprobarlas contra la base antes de guardar.',
                filas: grupos.disponibles,
                tono: 'ok' as const,
              },
              {
                clave: 'bloqueadas',
                titulo: 'No se cargarán',
                sub: 'Corrige el archivo y vuelve a subirlo solo si necesitas estas filas.',
                filas: grupos.bloqueadas,
                tono: 'malo' as const,
              },
            ].map((sec) => sec.filas.length === 0 ? null : (
              <div key={sec.clave} className="overflow-hidden rounded-lg border border-border bg-card">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full',
                        sec.tono === 'ok' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
                      )}
                    >
                      {sec.tono === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {sec.titulo}
                        <span className="ml-2 tabular-nums text-muted-foreground">{sec.filas.length}</span>
                      </h3>
                      <p className="text-xs text-muted-foreground">{sec.sub}</p>
                    </div>
                  </div>

                  {/* Marcar todo / nada: solo tiene sentido donde hay casillas. */}
                  {revision && sec.clave === 'disponibles' && (
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={marcadas.size > 0 && marcadas.size === grupos.disponibles.length}
                        ref={(el) => {
                          if (el) el.indeterminate = marcadas.size > 0 && marcadas.size < grupos.disponibles.length
                        }}
                        onChange={alternarTodas}
                        className="h-4 w-4 rounded border-input"
                      />
                      {marcadas.size === grupos.disponibles.length ? 'Desmarcar todas' : 'Marcar todas'}
                      <span className="tabular-nums">({marcadas.size} de {grupos.disponibles.length})</span>
                    </label>
                  )}
                </header>

                {/* Un solo contenedor de scroll, el de la propia tabla. El alto
                    va en vh para que su borde inferior —y con él la barra
                    horizontal, si hace falta— quede siempre en pantalla.
                    El espaciado de celda baja de p-4 (16px) a px-3/py-2.5:
                    con celdas de tres líneas, 16px arriba y abajo convertían
                    cada fila en un bloque de 90px. */}
                <Table
                  containerClassName="max-h-[60vh] rounded-none border-0 border-t"
                  className="[&_th]:h-10 [&_th]:px-3 [&_td]:px-3 [&_td]:py-2.5"
                >
                    <TableHeader className="sticky top-0 z-10 bg-muted/80 shadow-sm backdrop-blur">
                      <TableRow>
                        {revision && sec.clave === 'disponibles' && <TableHead className="w-10" />}
                        <TableHead className="min-w-[240px]">Estudiante</TableHead>
                        <TableHead className="min-w-[220px]">Empresa receptora</TableHead>
                        <TableHead className="min-w-[170px]">Tutor académico</TableHead>
                        <TableHead className="min-w-[150px]">Práctica</TableHead>
                        <TableHead className="min-w-[110px] text-center">Período</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sec.filas.map(({ key, row, motivo, r, bloqueada }) => {
                        const marcada = r ? marcadas.has(r.indice) : false
                        return (
                          <TableRow
                            key={key}
                            className={cn(
                              bloqueada && 'bg-destructive/[0.03]',
                              r && !bloqueada && !marcada && 'opacity-50',
                            )}
                          >
                            {revision && sec.clave === 'disponibles' && (
                              <TableCell className="align-top">
                                {r && (
                                  <input
                                    type="checkbox"
                                    checked={marcada}
                                    onChange={() => alternarFila(r.indice)}
                                    className="h-4 w-4 rounded border-input"
                                    aria-label={`Cargar a ${r.nombre}`}
                                  />
                                )}
                              </TableCell>
                            )}

                            {/* Estudiante: quién es y qué le pasa.
                                Dos líneas, no cuatro: la cédula, la carrera y
                                el correo caben en una sola línea secundaria y
                                se recortan si no caben, en vez de partirse. */}
                            <TableCell className="align-top">
                              <div className="text-sm font-medium leading-tight text-foreground">
                                {row.lastName} {row.firstName}
                              </div>
                              <div className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">
                                <span className="font-mono tabular-nums">{row.dni || '—'}</span>
                                {row.programName && <> · {row.programName}</>}
                                {row.email && <> · {row.email}</>}
                              </div>
                              {r && (r.errores.length > 0 || r.avisos.length > 0) && (
                                <ul className="mt-1.5 space-y-1">
                                  {r.errores.map((e, k) => (
                                    <li key={`e${k}`} className="flex items-start gap-1.5 text-xs leading-snug text-destructive">
                                      <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                                      <span>{e}</span>
                                    </li>
                                  ))}
                                  {r.avisos.map((a, k) => (
                                    <li key={`a${k}`} className="flex items-start gap-1.5 text-xs leading-snug text-warning">
                                      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                                      <span>{a}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </TableCell>

                            {/* Empresa: nombre arriba, contacto y cargo debajo.
                                El correo y el teléfono solo se muestran en el
                                title: son datos de respaldo, no de lectura. */}
                            <TableCell className="align-top">
                              <div
                                className="truncate text-sm leading-tight text-foreground"
                                title={[row.companyEmail, row.companyPhone].filter(Boolean).join(' · ') || undefined}
                              >
                                {row.companyName || '—'}
                              </div>
                              {(row.companyContactName || row.companyTutor) && (
                                <div className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">
                                  {row.companyContactName || row.companyTutor}
                                  {(row.companyPosition || row.destinatarioOficio) && (
                                    <> · {row.companyPosition || row.destinatarioOficio}</>
                                  )}
                                </div>
                              )}
                            </TableCell>

                            <TableCell className="align-top text-sm leading-tight text-foreground">
                              {row.tutorName || <span className="text-muted-foreground">Sin asignar</span>}
                            </TableCell>

                            <TableCell className="align-top">
                              <div className="text-sm leading-tight text-foreground">{row.practiceLevel || '—'}</div>
                              <div className="mt-0.5 text-xs leading-tight text-muted-foreground">
                                {[row.academicLevel, row.totalHours ? `${row.totalHours} h` : null]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </TableCell>

                            <TableCell className="align-top text-center">
                              {motivo ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                                  <Ban className="h-3 w-3" />
                                  {motivo}
                                </span>
                              ) : (
                                <span className="text-sm tabular-nums text-muted-foreground">
                                  {periodoActivo?.code ?? row.academicPeriod}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
        </PageContainer>
      </div>
    </RoleGate>
  )
}
