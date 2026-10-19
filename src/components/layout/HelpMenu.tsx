import { CircleAlert, CircleHelp, FlaskConical, Info } from 'lucide-react'
import { Link } from 'react-router'
import { utilityButton } from '@/components/ui/buttonStyles'
import { Popover } from '@/components/ui/Popover'
import { brand } from '@/config/brand'
import { ROUTES } from '@/config/navigation'
import { cn } from '@/lib/cn'

export function HelpMenu({ className }: { className?: string }) {
  return (
    <Popover
      className={className}
      label="Ayuda y estado del sistema"
      panelClassName="w-[300px] p-[8px]"
      trigger={({ toggle, open, ...aria }) => (
        <button
          type="button"
          onClick={toggle}
          {...aria}
          aria-label="Ayuda y estado del sistema"
          className={cn(utilityButton, open && 'bg-surface-muted')}
        >
          <CircleAlert className="size-[20px] transition-transform duration-300 ease-soft group-hover:scale-[1.08]" strokeWidth={1.8} />
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-[6px]">
          {brand.demoMode && (
            <div className="flex gap-[10px] rounded-[14px] bg-accent-soft px-[12px] py-[11px] text-accent-strong">
              <FlaskConical aria-hidden className="mt-[1px] size-[17px] shrink-0" strokeWidth={1.9} />
              <p className="text-[13px] leading-[1.45]">
                <span className="font-semibold">Modo demostración.</span> Todos los datos son ficticios; no hay backend ni
                integraciones conectadas.
              </p>
            </div>
          )}
          <Link
            to={ROUTES.help}
            onClick={close}
            className="flex items-center gap-[10px] rounded-[10px] px-[10px] py-[9px] text-[14px] text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <CircleHelp aria-hidden className="size-[16px]" strokeWidth={1.9} />
            Centro de ayuda
          </Link>
          <div className="flex items-start gap-[10px] px-[10px] py-[8px] text-[12.5px] leading-[1.45] text-muted">
            <Info aria-hidden className="mt-[1px] size-[15px] shrink-0" strokeWidth={1.9} />
            <span>
              {brand.productName} v0.2.0 · Fase 1
              <br />
              {brand.productFullName} · {brand.developer} para {brand.clientName}
            </span>
          </div>
        </div>
      )}
    </Popover>
  )
}
