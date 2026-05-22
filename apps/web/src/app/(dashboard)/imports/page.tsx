'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import { api } from '@/lib/axios'
import { RoleGate } from '@/components/shared/role-gate'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { FileSpreadsheet, UploadCloud, CheckCircle2, AlertCircle, Download } from 'lucide-react'

// Estructura que enviaremos al backend
interface ParsedStudentRow {
  dni: string
  firstName: string
  lastName: string
  email: string
  programName: string
  tutorName: string
  totalHours: number
  practiceLevel: string
  academicLevel: string
  companyName: string
  academicPeriod: string
  companyTutor: string
  companyEmail: string
  companyPhone: string
  destinatarioOficio: string
}

export default function ImportsPage() {
  const [parsedData, setParsedData] = useState<ParsedStudentRow[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)


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
        if (joined.includes('cédula') || joined.includes('cedula')) {
          headerRowIndex = i
          break
        }
      }

      if (headerRowIndex !== -1) {
        let count = 0
        for (let i = headerRowIndex + 1; i < practicasData.length; i++) {
          const row = practicasData[i]
          if (!row || row.length < 5) continue
          
          const rawDni = String(row[1] || '').trim() // Col 1: Cédula
          const rawName = String(row[2] || '').trim() // Col 2: Apellidos y Nombres
          const email = String(row[3] || '').trim() // Col 3: Correo
          
          if (!rawDni && !rawName) continue

          const { firstName, lastName } = splitName(rawName)
          let finalDni = rawDni
          if (!finalDni && email.includes('@live.uleam.edu.ec')) {
            finalDni = extractDniFromEmail(email)
          }

          const companyName = String(row[5] || '').trim()
          
          newParsedData.push({
            dni: finalDni,
            firstName,
            lastName,
            email,
            programName: String(row[4] || '').trim(),
            companyName,
            companyTutor: String(row[6] || '').trim(),
            destinatarioOficio: String(row[7] || '').trim(),
            companyEmail: String(row[8] || '').trim(),
            companyPhone: String(row[9] || '').trim(),
            tutorName: String(row[10] || '').trim(),
            practiceLevel: String(row[11] || '').trim(),
            academicLevel: String(row[12] || '').trim(),
            totalHours: Number(row[13]) || 0,
            academicPeriod: String(row[14] || '').trim(),
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
    // PASO 4: Fallback antiguo -> "Estudiantes" (formato viejo 9 columnas) + cruce
    // ============================================
    newParsedData.length = 0 
    
    const estudiantesSheetName = workbook.SheetNames.find(n => n.includes('Estudiantes'))
    if (estudiantesSheetName) {
      const estData: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[estudiantesSheetName], { header: 1 })
      
      for (let i = 0; i < estData.length; i++) {
        const row = estData[i]
        if (!row || row.length < 5) continue

        const emailStr = String(row[2] || '').trim()
        if (!emailStr.includes('@live.uleam.edu.ec')) continue

        const rawName = String(row[1] || '').trim()
        const { firstName, lastName } = splitName(rawName)
        const dni = extractDniFromEmail(emailStr)
        const companyName = String(row[7] || '').trim()
        const companyInfo = companyMap.get(companyName.toUpperCase())

        newParsedData.push({
          dni,
          firstName,
          lastName,
          email: emailStr,
          programName: 'Tecnologías de la Información',
          tutorName: String(row[3] || '').trim(),
          totalHours: Number(row[4]) || 0,
          practiceLevel: String(row[5] || '').trim(),
          academicLevel: String(row[6] || '').trim(),
          companyName,
          academicPeriod: String(row[8] || '').trim(),
          companyTutor: companyInfo?.tutorEmpresarial || '',
          destinatarioOficio: companyInfo?.cargoEmpresarial || '',
          companyEmail: companyInfo?.email || '',
          companyPhone: companyInfo?.phone || '',
        })
      }
      console.log(`[Import] ${newParsedData.length} leídos desde hoja Estudiantes vieja`)
    }

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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setIsProcessing(true)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result
        const workbook = XLSX.read(buffer, { type: 'array' })
        
        console.log('[Import] Hojas detectadas:', workbook.SheetNames)
        processWorkbook(workbook)
        toast.success(`Archivo procesado exitosamente. Revise la tabla.`)
      } catch (error) {
        console.error(error)
        toast.error('Error al leer el archivo Excel. Asegúrate de que sea un archivo válido.')
      } finally {
        setIsProcessing(false)
      }
    }
    reader.readAsArrayBuffer(file)
  }, [])

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
      toast.success(`¡Éxito! ${response.data.count} registros importados correctamente.`)
      setParsedData([]) 
    } catch (error) {
      toast.error('Ocurrió un error al guardar los datos en el servidor.')
      console.error(error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <RoleGate allowedRoles={['ADMIN', 'COORDINATOR']}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Importación Masiva</h1>
            <p className="text-muted-foreground mt-1">
              Sube el archivo Excel oficial de la universidad. El sistema extraerá las cédulas, nombres y horas mágicamente.
            </p>
          </div>
          <a 
            href="/templates/Plantilla Importacion de datos.xlsx" 
            download="Plantilla Importacion de datos.xlsx"
            title="Descargar &#34;plantilla para importación de datos&#34;"
          >
            <Button variant="outline" size="icon" className="shrink-0 rounded-full w-10 h-10 hover:bg-slate-100 hover:text-slate-900 transition-colors">
              <Download className="h-5 w-5" />
            </Button>
          </a>
        </div>

        {/* Zona de Dropzone */}
        {!parsedData.length && (
          <div 
            {...getRootProps()} 
            className={`mt-4 border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer transition-colors
              ${isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary/50 hover:bg-gray-50'}`}
          >
            <input {...getInputProps()} />
            <UploadCloud className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-1">
              {isDragActive ? 'Suelta el archivo aquí...' : 'Arrastra y suelta tu archivo Excel aquí'}
            </h3>
            <p className="text-sm text-gray-500 text-center max-w-sm">
              Soporta archivos .xlsx y .xls. El sistema leerá automáticamente las columnas del formato estándar.
            </p>
          </div>
        )}

        {/* Vista Previa de Datos */}
        {parsedData.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-100">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-blue-600" />
                <div>
                  <h3 className="font-semibold text-blue-900">Análisis Exitoso</h3>
                  <p className="text-sm text-blue-700">Se detectaron y prepararon <strong>{parsedData.length} estudiantes</strong> listos para importar.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setParsedData([])} disabled={isSaving}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveToDatabase} disabled={isSaving}>
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
                      <TableHead>Tutor Empresarial</TableHead>
                      <TableHead>Cargo Empresarial</TableHead>
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
                          <div className="text-[10px] text-slate-500">{row.companyEmail} | {row.companyPhone}</div>
                        </TableCell>
                        <TableCell className="text-xs">{row.companyTutor}</TableCell>
                        <TableCell className="text-xs">{row.destinatarioOficio}</TableCell>
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
