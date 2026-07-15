import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

export interface FilterOption {
  value: string | null
  label: string
}

interface FilterChipProps {
  label: string
  options: FilterOption[]
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  className?: string
}

export function FilterChip({
  label,
  options,
  value,
  onChange,
  disabled = false,
  className = ''
}: FilterChipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  
  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const selectedOption = options.find(o => o.value === value) || options[0]
  const isActive = value !== null

  const handleCycle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (disabled) return
    
    // Find current index
    const currentIndex = options.findIndex(o => o.value === value)
    const nextIndex = (currentIndex + 1) % options.length
    onChange(options[nextIndex].value)
    
    // Close menu if open
    setIsOpen(false)
  }

  const handleToggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (disabled) return
    setIsOpen(!isOpen)
  }

  const handleSelectMenu = (val: string | null) => {
    onChange(val)
    setIsOpen(false)
  }

  return (
    <div className={`relative z-[60] ${className}`} ref={menuRef}>
      <div className={`flex flex-col justify-center rounded-[12px] border cursor-pointer shadow-sm transition-colors min-w-[120px] max-w-[200px] h-[48px] ${isActive ? 'bg-[#f0f9ff] border-[#bae6fd]' : 'bg-white border-[#eef2f7] hover:bg-[#f8fafc]'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        
        {/* Etiqueta superior */}
        <div className="px-3.5 pt-1.5" onClick={handleCycle}>
          <span className={`text-[11px] font-medium leading-none ${isActive ? 'text-[#0284c7]' : 'text-[#9ca3af]'}`}>
            {label}
          </span>
        </div>
        
        <div className="flex items-center justify-between gap-1 px-3.5 pb-1.5 h-full">
          {/* Valor (Clic hace ciclo) */}
          <div className="flex-1 truncate pt-0.5" onClick={handleCycle}>
            <span className={`text-[13px] font-semibold truncate ${isActive ? 'text-[#0369a1]' : 'text-[#374151]'}`}>
              {selectedOption.label}
            </span>
          </div>
          
          {/* Chevron (Clic abre menú) */}
          <div 
            className={`p-1 -mr-1 rounded-md hover:bg-black/5 transition-colors ${isActive ? 'text-[#0284c7]' : 'text-[#9ca3af]'}`} 
            onClick={handleToggleMenu}
          >
            <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </div>
      
      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+8px)] min-w-[180px] max-h-[300px] overflow-y-auto bg-white rounded-[12px] border border-[#eef2f7] shadow-lg animate-in fade-in slide-in-from-top-2 p-1.5">
          {options.map((opt) => (
            <div 
              key={String(opt.value)} 
              onClick={() => handleSelectMenu(opt.value)} 
              className={`px-3 py-2 rounded-lg cursor-pointer text-[13px] font-medium transition-colors ${value === opt.value ? 'bg-[#f0f9ff] text-[#0369a1]' : 'text-[#374151] hover:bg-slate-50'}`}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
