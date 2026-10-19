import { DEMO_TODAY } from '@/config/brand'
import { clientPath, projectPath, quotationPath } from '@/config/navigation'
import { hasAmount, sumAmounts } from '@/domain/commercial/money'
import { findOverlaps } from '@/domain/commercial/pricing'
import { effectiveStatus } from '@/domain/commercial/quotations'
import { projectCommercial } from '@/domain/commercial/traceability'
import { daysUntil } from '@/lib/dates'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatCurrency } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'
import type { Alert } from '@/types/domain'

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const

/** Actionable commercial alerts derived from live data (not stored). */
export function commercialAlerts(ws: Workspace): Alert[] {
  const alerts: Alert[] = []
  const latest = new Map<string, number>()
  for (const q of ws.quotations) latest.set(q.number, Math.max(latest.get(q.number) ?? 0, q.version))

  for (const q of ws.quotations) {
    if (q.version !== latest.get(q.number)) continue
    const status = effectiveStatus(q, DEMO_TODAY)
    const client = ws.clientById.get(q.clientId)?.name
    if (status === 'expired') {
      alerts.push({
        id: `com_exp_${q.id}`,
        severity: 'warning',
        title: `Cotización vencida — ${client}`,
        description: `${q.number} v${q.version} venció sin respuesta. Reenviá una nueva versión o registrá el rechazo.`,
        date: q.validUntil,
        href: quotationPath(q.id),
      })
    } else if (status === 'sent' && daysUntil(q.validUntil) <= 7) {
      alerts.push({
        id: `com_soon_${q.id}`,
        severity: 'info',
        title: `Cotización por vencer — ${client}`,
        description: `${q.number} v${q.version} vence el ${q.validUntil.split('-').reverse().join('/')}.`,
        date: q.validUntil,
        href: quotationPath(q.id),
      })
    }
  }

  for (const project of ws.projects) {
    if (project.operationalStatus === 'cancelled') continue
    const rows = [...projectCommercial(ws.dataset, project, DEMO_TODAY).values()].filter((r) => hasAmount(r.pendingAuthorization))
    if (rows.length === 0) continue
    const total = sumAmounts(...rows.map((r) => r.pendingAuthorization))
    alerts.push({
      id: `com_po_${project.id}`,
      severity: 'warning',
      title: `Aprobado sin OC — ${ws.clientById.get(project.clientId)?.name}`,
      description: `${project.code} · ${rows.length} ${rows.length === 1 ? 'servicio' : 'servicios'} por ${CURRENCY_ORDER.filter((c) => total[c])
        .map((c) => formatCurrency(total[c] ?? 0, c))
        .join(' · ')} esperando autorización.`,
      date: DEMO_TODAY,
      href: `${projectPath(project.id)}?tab=finanzas`,
    })
  }

  for (const client of ws.clients) {
    const overlapping = ws.priceEntries.filter((e) => e.clientId === client.id && findOverlaps(ws.dataset, e).length > 0)
    if (overlapping.length === 0) continue
    alerts.push({
      id: `com_tar_${client.id}`,
      severity: 'info',
      title: `Tarifas superpuestas — ${client.name}`,
      description: `${overlapping.length} reglas compiten entre sí: las cotizaciones pedirán elegir el precio manualmente.`,
      date: DEMO_TODAY,
      href: `${clientPath(client.id)}?tab=tarifario`,
    })
  }
  return alerts
}

export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.date.localeCompare(a.date))
}
