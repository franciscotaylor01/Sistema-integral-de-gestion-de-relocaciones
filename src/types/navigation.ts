import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  id: string
  label: string
  path: string
  icon: LucideIcon
}

export interface ModuleItem extends NavItem {
  /** Short description shown on the "coming soon" screen. */
  description: string
}
