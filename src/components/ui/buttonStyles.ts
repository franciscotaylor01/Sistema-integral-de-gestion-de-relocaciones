import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg'

/* Vertix button recipe, shared by <Button> and link-styled buttons. */
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-contrast text-on-contrast hover:opacity-90 hover:shadow-[0_10px_22px_-12px_rgb(23_21_24/0.55)]',
  secondary: 'bg-surface-muted text-ink hover:bg-surface-sunken',
  outline: 'bg-surface text-ink border border-line hover:bg-surface-muted shadow-pill',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-[38px] px-4 text-[14px]',
  md: 'h-[46px] px-5 text-[15px]',
  lg: 'h-[46px] px-6 text-[16px]',
}

export function buttonStyles(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(
    'inline-flex select-none items-center justify-center gap-2.5 rounded-full font-medium whitespace-nowrap',
    'transition-[background-color,opacity,transform,box-shadow] duration-200 ease-soft active:scale-[0.97] active:duration-100',
    '[&>svg]:transition-transform [&>svg]:duration-300 [&>svg]:ease-soft hover:[&>svg]:translate-x-[2px]',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  )
}

/** Round utility icon button used in the header pill. */
export const utilityButton =
  'group grid size-[44px] place-items-center rounded-full text-ink transition-[background-color,transform] duration-200 ease-soft hover:bg-surface-muted active:scale-[0.94]'

/** Bordered pill control (Vertix "Filter" / currency selector). */
export const pillControl =
  'group flex h-[46px] items-center gap-[10px] rounded-full border border-line bg-surface px-[18px] text-[15px] text-ink-secondary shadow-pill transition-[background-color,color,transform] duration-200 ease-soft hover:bg-surface-muted hover:text-ink active:scale-[0.97]'
