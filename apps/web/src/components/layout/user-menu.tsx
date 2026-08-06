'use client'

import { KeyRound, LogOut } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface UserMenuProps {
  /** The trigger element — topbar uses a pill button, sidebar uses the full user card. */
  trigger: React.ReactNode
  /** Optional content shown above the two actions (name/email/role in the sidebar; nothing in the topbar). */
  header?: React.ReactNode
  onChangePassword: () => void
  onLogout: () => void
  side?: 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
  contentClassName?: string
  /** Only needed when the trigger itself reacts visually to the open state (e.g. a chevron flip). */
  onOpenChange?: (open: boolean) => void
}

/**
 * Shared account menu for the topbar and the sidebar user card.
 *
 * Both surfaces used to hand-roll their own open/close state, outside-click
 * listener, and had no Escape key or focus handling. Radix's DropdownMenu
 * gives all of that for free (and keeps the two triggers positioned
 * correctly via Popper instead of hardcoded `absolute` offsets), so this
 * component owns only the two actions that are actually shared.
 */
export function UserMenu({
  trigger,
  header,
  onChangePassword,
  onLogout,
  side = 'bottom',
  align = 'end',
  contentClassName,
  onOpenChange,
}: UserMenuProps) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} className={contentClassName}>
        {header}
        <DropdownMenuItem onSelect={onChangePassword}>
          <KeyRound className="h-4 w-4 text-gray-500" />
          <span>Cambiar contraseña</span>
        </DropdownMenuItem>
        <DropdownMenuItem destructive onSelect={onLogout}>
          <LogOut className="h-4 w-4" />
          <span>Cerrar sesión</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
