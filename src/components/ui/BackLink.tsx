import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="group inline-flex h-[34px] items-center gap-[6px] rounded-full border border-line bg-surface pl-[10px] pr-[14px] text-[13.5px] text-ink-secondary shadow-pill transition-[background-color,color,transform] duration-200 ease-soft hover:bg-surface-muted hover:text-ink active:scale-[0.97]"
    >
      <ArrowLeft aria-hidden className="size-[14px] transition-transform duration-300 ease-soft group-hover:-translate-x-[2px]" strokeWidth={2} />
      {label}
    </Link>
  )
}
