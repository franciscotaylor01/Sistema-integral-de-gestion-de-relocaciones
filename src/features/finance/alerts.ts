import { DEMO_TODAY } from '@/config/brand'
import { invoicePath, supplierPath } from '@/config/navigation'
import type { Workspace } from '@/hooks/useWorkspace'
import { daysUntil } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import type { Alert } from '@/types/domain'

/** Actionable finance alerts derived from live records (never stored, so always consistent). */
export function financeAlerts(ws: Workspace): Alert[] {
  const alerts: Alert[] = []
  for (const inv of ws.invoices) {
    const f = ws.invoiceFin.get(inv.id)!
    if (!f.overdue) continue
    alerts.push({
      id: `fin_inv_${inv.id}`,
      severity: f.daysOverdue > 15 ? 'critical' : 'warning',
      title: `Factura vencida — ${ws.clientById.get(inv.clientId)?.name}`,
      description: `${inv.number} · saldo ${formatCurrency(f.outstanding, inv.currency)} · ${f.daysOverdue} días de atraso.`,
      date: inv.dueDate,
      href: invoicePath(inv.id),
    })
  }
  for (const ob of ws.obligations) {
    const f = ws.obligationFin.get(ob.id)!
    const supplier = ws.supplierById.get(ob.supplierId)?.name
    if (f.overdue) {
      alerts.push({
        id: `fin_obl_${ob.id}`,
        severity: 'warning',
        title: `Pago a proveedor vencido — ${supplier}`,
        description: `${ob.reference} · ${formatCurrency(f.outstanding, ob.currency)} vencido hace ${f.daysOverdue} días.`,
        date: ob.dueDate,
        href: supplierPath(ob.supplierId),
      })
    } else if (f.status === 'pending-approval' && daysUntil(ob.dueDate) <= 7) {
      alerts.push({
        id: `fin_apr_${ob.id}`,
        severity: 'info',
        title: `Obligación a aprobar — ${supplier}`,
        description: `${ob.reference} · ${formatCurrency(ob.amount, ob.currency)} vence ${ob.dueDate.split('-').reverse().join('/')}.`,
        date: ob.dueDate,
        href: supplierPath(ob.supplierId),
      })
    }
  }
  return alerts.filter((a) => a.date <= DEMO_TODAY || a.severity === 'info')
}
