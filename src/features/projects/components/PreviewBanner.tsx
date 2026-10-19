import { Eye } from 'lucide-react'

/** Marks a tab whose functionality arrives in a later phase. */
export function PreviewBanner({ children }: { children: string }) {
  return (
    <div role="note" className="flex items-start gap-[12px] rounded-card bg-info-soft px-[18px] py-[14px] text-info">
      <Eye aria-hidden className="mt-[2px] size-[18px] shrink-0" strokeWidth={1.9} />
      <p className="text-[14px] leading-[1.5]">
        <span className="font-semibold">Vista previa. </span>
        {children}
      </p>
    </div>
  )
}
