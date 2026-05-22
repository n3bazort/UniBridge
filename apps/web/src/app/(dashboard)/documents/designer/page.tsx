'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const CertificateDesignerClient = dynamic(
  () => import('@/components/features/certificates/certificate-designer-full').then(mod => ({ default: mod.CertificateDesignerFull })),
  { ssr: false }
)

export default function DesignerPage() {
  return (
    <Suspense fallback={<div className="flex justify-center p-12"><span className="animate-pulse">Cargando diseñador...</span></div>}>
      <CertificateDesignerClient />
    </Suspense>
  )
}
