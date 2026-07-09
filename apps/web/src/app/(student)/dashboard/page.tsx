'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/axios'
import { FileText, Download, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'

interface Document {
  id: string
  documentType: string
  fileUrl: string
  documentCode: string
  createdAt: string
  template: {
    name: string
  }
}

export default function StudentDashboard() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const res = await api.get('/generated-documents/me')
        setDocuments(res.data)
      } catch (err) {
        console.error(err)
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchDocuments()
  }, [])

  const handleDownload = (url: string) => {
    window.open(url, '_blank')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white p-6 rounded-[24px] border border-[#eef2f7] shadow-sm">
        <h1 className="text-xl font-bold text-[#0f172a] mb-2">Tus Documentos de Prácticas</h1>
        <p className="text-[#64748b] text-sm">
          Aquí puedes descargar los documentos generados por la coordinación para tus prácticas pre-profesionales.
        </p>
      </div>

      <div className="bg-white rounded-[24px] border border-[#eef2f7] shadow-sm overflow-hidden p-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map(i => (
              <Skeleton key={i} className="h-[120px] rounded-[16px]" />
            ))}
          </div>
        ) : error ? (
          <EmptyState 
            icon={AlertCircle}
            title="Error al cargar documentos"
            description="Hubo un problema al comunicarse con el servidor. Intenta recargar la página."
          />
        ) : documents.length === 0 ? (
          <EmptyState 
            icon={FileText}
            title="No tienes documentos"
            description="Aún no se ha generado ningún documento oficial (solicitud o certificado) para tus prácticas."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between p-5 rounded-[16px] border border-[#eef2f7] hover:border-indigo-200 hover:shadow-soft transition-all bg-[#f8fafc] group">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-[10px] bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#0f172a] text-sm">{doc.template.name}</h3>
                    <p className="text-[#64748b] text-[13px] mt-1 font-mono">{doc.documentCode}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="flex items-center gap-1 text-[12px] font-medium text-[#64748b]">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(doc.createdAt).toLocaleDateString('es-ES')}
                      </span>
                      <span className="flex items-center gap-1 text-[12px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Vigente
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDownload(doc.fileUrl)}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-[#eef2f7] text-[#64748b] hover:text-indigo-600 hover:border-indigo-200 transition-colors shadow-sm"
                  title="Descargar documento"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
