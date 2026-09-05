import { Loader2 } from 'lucide-react'

export default function Loading() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-app">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-[#eef2f7]" />
          <Loader2 className="w-12 h-12 text-[#111827] animate-spin absolute inset-0" strokeWidth={2} />
        </div>
        <p className="text-sm text-muted-foreground font-medium animate-pulse">Cargando...</p>
      </div>
    </div>
  )
}
