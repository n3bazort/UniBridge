import React from 'react'
import { DivideIcon as LucideIcon } from 'lucide-react'
import { Button } from './button'

interface EmptyStateProps {
  icon: any
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  actionIcon?: any
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon: ActionIcon
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-[#eef2f7] rounded-[24px] bg-white w-full">
      <div className="w-16 h-16 bg-[#f0f9ff] rounded-full flex items-center justify-center mb-6">
        <Icon className="w-8 h-8 text-[#0284c7]" />
      </div>
      <h3 className="text-[18px] font-bold text-[#111827] mb-2">{title}</h3>
      <p className="text-[14px] text-[#6b7280] max-w-sm mb-8">{description}</p>
      
      {actionLabel && onAction && (
        <Button onClick={onAction} className="bg-[#111827] text-white hover:bg-[#1f2937] px-6 py-2 rounded-[12px] flex items-center gap-2 text-[14px] font-semibold">
          {ActionIcon && <ActionIcon className="w-4 h-4" />}
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
