import { Loader2 } from 'lucide-react'

export default function Loading() {
  return (
    <div className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-[#f7f7f8]">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-[#eef2f7]" />
          <Loader2 className="w-12 h-12 text-[#111827] animate-spin absolute inset-0" strokeWidth={2} />
        </div>
        <p className="text-sm text-[#9ca3af] font-medium animate-pulse">Cargando...</p>
      </div>
    </div>
  )
}
