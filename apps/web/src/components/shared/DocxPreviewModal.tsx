'use client'

import React, { useEffect, useRef, useState } from 'react'
import { X, Loader2, AlertTriangle, FileText } from 'lucide-react'
import * as docx from 'docx-preview'

interface DocxPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  url: string | null
  title?: string
}

export function DocxPreviewModal({ isOpen, onClose, url, title }: DocxPreviewModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !url) return
    
    let isMounted = true
    const loadPreview = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error('No se pudo descargar el documento para previsualizarlo.')
        const blob = await response.blob()
        
        if (isMounted && containerRef.current) {
          // Limpiar contenedor
          containerRef.current.innerHTML = ''
          
          await docx.renderAsync(blob, containerRef.current, undefined, {
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            ignoreLastRenderedPageBreak: true,
            experimental: true,
            className: 'docx-preview-container',
          })
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Error al previsualizar el documento')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadPreview()

    return () => {
      isMounted = false
    }
  }, [isOpen, url])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#f0f2f5] w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="h-14 px-4 bg-white border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-slate-800 leading-tight">
                {title || 'Previsualización de Documento'}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">Modo solo lectura</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto relative">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f0f2f5] z-10">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
              <p className="text-[13px] font-medium text-slate-500">Cargando documento...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f0f2f5] z-10 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <h4 className="text-[15px] font-bold text-slate-800 mb-1">Fallo al previsualizar</h4>
              <p className="text-[13px] text-slate-500 max-w-sm">{error}</p>
            </div>
          )}

          <div className="py-8 flex justify-center min-w-full">
            <div 
              ref={containerRef} 
              className="bg-white shadow-sm ring-1 ring-slate-200"
              style={{ minHeight: '800px', width: '100%', maxWidth: '816px' }}
            >
              {/* docx-preview inyecta el HTML aquí */}
            </div>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .docx-preview-container { padding: 40px !important; }
        .docx-preview-container > section { box-shadow: none !important; margin-bottom: 0 !important; }
      `}} />
    </div>
  )
}
