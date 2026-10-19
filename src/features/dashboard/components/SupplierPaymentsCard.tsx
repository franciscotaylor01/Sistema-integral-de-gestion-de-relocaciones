import { Wallet } from 'lucide-react'
import { Link } from 'react-router'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PillLink } from '@/components/ui/PillLink'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { payableStatusMeta } from '@/config/catalogs'
import { supplierPath } from '@/config/navigation'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatShortDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'

/** Open supplier obligations (approved or pending approval), nearest due date first. */
export function SupplierPaymentsCard({ workspace: ws, limit = 5 }: { workspace: Workspace; limit?: number }) {
  const pending = ws.obligations
    .filter((o) => o.lifecycle !== 'cancelled' && (ws.obligationFin.get(o.id)?.outstanding ?? 0) > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  return (
    <Card aria-labelledby="supplier-pay-title" className="h-full px-[20px] pb-[16px] pt-[18px]">
      <div className="flex h-[34px] items-center justify-between">
        <h2 id="supplier-pay-title" className="text-[16px] font-medium">
          Pagos a proveedores
        </h2>
        <PillLink to="/finanzas?vista=proveedores">{pending.length} pendientes</PillLink>
      </div>
      {pending.length === 0 ? (
        <EmptyState icon={Wallet} title="Sin pagos pendientes" className="py-6" />
      ) : (
        <ul className="mt-[14px] flex flex-col gap-[8px]">
          {pending.slice(0, limit).map((o) => {
            const f = ws.obligationFin.get(o.id)!
            return (
              <li key={o.id}>
                <Link
                  to={supplierPath(o.supplierId)}
                  className="flex items-center gap-[12px] rounded-[14px] bg-surface-muted px-[12px] py-[10px] transition-[background-color,transform] duration-200 ease-soft hover:bg-surface-sunken active:scale-[0.99]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{ws.supplierById.get(o.supplierId)?.name}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {o.projectId ? ws.projectById.get(o.projectId)?.code : 'General'} · vence {formatShortDate(o.dueDate)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-[2px]">
                    <span className="tabular text-[14px] font-semibold">{formatCurrency(f.outstanding, o.currency)}</span>
                    <StatusBadge meta={payableStatusMeta[f.status]} className="text-[11.5px]" />
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
