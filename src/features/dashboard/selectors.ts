import { getServiceType } from '@/config/serviceCatalog'
import { certificatePath, invoicePath, projectPath, quotationPath } from '@/config/navigation'
import { effectivePolicy } from '@/domain/commercial/catalog'
import { certifiableUnits } from '@/domain/commercial/certificates'
import { addAmount, hasAmount, sumAmounts, type Amounts } from '@/domain/commercial/money'
import { comparePoWithQuotation, isSettled } from '@/domain/commercial/poComparison'
import { effectiveStatus } from '@/domain/commercial/quotations'
import { projectCommercial } from '@/domain/commercial/traceability'
import type { Dataset } from '@/domain/dataset'
import { invoiceTotals } from '@/domain/finance/derive'
import { billableByService, billedQuantities, suggestInvoiceLines } from '@/domain/finance/invoices'
import { initialDocStage, nextStep, type InitialDocumentStage } from '@/domain/initialDocuments'
import { subMoney } from '@/domain/finance/money'
import { ACTIVE_PROJECT_STATUSES } from '@/features/projects/selectors'
import { taskBucket } from '@/features/tasks/selectors'
import type { CurrencyCode, ProjectRecord } from '@/types/domain'

/*
 * Phase 5.0D — Eugenia's daily work queue. Everything is derived from the
 * existing billing, commercial and operational selectors (billableByService,
 * projectCommercial, comparePoWithQuotation, certifiableUnits, …): no new
 * financial logic and no stored entity.
 */

export interface Action {
  label: string
  href: string
}

export type BillingState = 'ready' | 'draft' | 'review' | 'certificate' | 'waiting' | 'milestone'

export const BILLING_ORDER: BillingState[] = ['ready', 'draft', 'review', 'certificate', 'waiting', 'milestone']

export interface BillingRow {
  key: string
  state: BillingState
  projectId: string
  projectCode: string
  clientName: string
  concept: string
  /** Sub-services ready to bill (from the invoice suggestion). */
  items: string[]
  po?: string
  certificate?: string
  /** Ready: billable remaining · draft: reserved in the draft · blocked: amount on hold. */
  amounts: Amounts
  reason: string
  action: Action
}

const isActive = (p: Pick<ProjectRecord, 'operationalStatus'>) => (ACTIVE_PROJECT_STATUSES as readonly string[]).includes(p.operationalStatus)
const minus = (a: Amounts, b: Amounts): Amounts => {
  const out: Amounts = {}
  for (const [c, v] of Object.entries(a) as [CurrencyCode, number][]) {
    const r = subMoney(v, b[c] ?? 0)
    if (r > 0) out[c] = r
  }
  return out
}

/** Which bucket a blocked service belongs to, from the existing eligibility reasons. */
function blockedState(missing: string[]): BillingState {
  const text = missing.join(' | ')
  if (/OC vs\. cotización|^No autorizado:|\| No autorizado:/.test(text)) return 'review'
  if (/certificado/i.test(text)) return 'certificate'
  if (/Falta OC|cotización aprobada|OC abierta|no vigente|Ítems no autorizados|pendientes de aprobación comercial|Falta precio/.test(text)) return 'waiting'
  return 'milestone'
}

function certificateLabel(ds: Dataset, projectId: string, serviceId: string): string | undefined {
  const certs = ds.certificates.filter((c) => c.projectId === projectId && c.status !== 'rejected' && c.lines.some((l) => l.serviceId === serviceId))
  if (!certs.length) return undefined
  const c = certs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const status = { draft: 'en borrador', submitted: 'presentado', approved: 'aprobado', rejected: 'rechazado' }[c.status]
  return `${c.externalNumber ?? c.number} · ${status}`
}

export function billingQueue(ds: Dataset, today: string): BillingRow[] {
  const rows: BillingRow[] = []
  for (const project of ds.projects) {
    if (project.operationalStatus === 'cancelled') continue
    const client = ds.clients.find((c) => c.id === project.clientId)
    const clientName = client?.name ?? ''
    const policy = effectivePolicy(client, project)
    const commercial = projectCommercial(ds, project, today)
    const billable = billableByService(ds, project.id, today)
    let suggestion: ReturnType<typeof suggestInvoiceLines> | undefined
    const suggested = () => {
      if (!suggestion) {
        const currencies = new Set([...billable.values()].flatMap((b) => Object.keys(b.remaining) as CurrencyCode[]))
        suggestion = [...currencies].flatMap((c) => suggestInvoiceLines(ds, project.id, c, today))
      }
      return suggestion
    }
    for (const s of ds.services.filter((x) => x.projectId === project.id)) {
      const b = billable.get(s.id)
      const c = commercial.get(s.id)
      if (!b || !c) continue
      const label = getServiceType(s.typeId).label
      const po = c.openOrder ? `OC abierta ${c.openOrder.number}` : c.purchaseOrders.map((p) => p.clientPoNumber).join(', ') || undefined
      const certificate = policy.requiresCertificate ? (certificateLabel(ds, project.id, s.id) ?? 'Sin certificado') : undefined
      const base = { projectId: project.id, projectCode: project.code, clientName, concept: label, po, certificate }
      if (b.eligible) {
        if (!hasAmount(b.remaining)) continue
        const items = suggested()
          .filter((l) => l.serviceId === s.id)
          .map((l) => l.description.replace(`${label} — `, ''))
          .filter((d) => d !== project.code && d !== label)
        rows.push({ ...base, key: `ready|${s.id}`, state: 'ready', items, amounts: b.remaining as Amounts, reason: b.missing.length ? b.missing.join(' · ') : 'Autorizado y sin facturar', action: { label: 'Preparar factura', href: `${projectPath(project.id)}?tab=finanzas` } })
        continue
      }
      // Blocked: show what is on hold (approved, else quoted, else agreed price) minus what is already invoiced.
      const commitment = hasAmount(c.approved) ? c.approved : hasAmount(c.quoted) ? c.quoted : s.price ? ({ [project.currency]: s.price } as Amounts) : {}
      const onHold = minus(commitment, b.billed as Amounts)
      if (!hasAmount(onHold) && hasAmount(b.billed as Amounts)) continue // already invoiced
      // Not started commercially on a finished/paused project: nothing to chase today.
      if (c.stage === 'not-quoted' && !hasAmount(c.quoted) && !isActive(project) && policy.poMode !== 'open') continue
      const state = blockedState(b.missing)
      const action: Action =
        state === 'review'
          ? { label: 'Revisar diferencias', href: `${projectPath(project.id)}/comparacion-oc` }
          : state === 'milestone'
            ? { label: 'Ver servicio', href: `${projectPath(project.id)}?tab=servicios` }
            : { label: state === 'certificate' ? 'Gestionar certificado' : c.stage === 'not-quoted' ? 'Cotizar' : 'Seguir aprobación / OC', href: `${projectPath(project.id)}?tab=finanzas` }
      rows.push({ ...base, key: `${state}|${s.id}`, state, items: [], amounts: onHold, reason: b.missing.join(' · ') || 'Sin monto facturable', action })
    }
  }
  // Prepared drafts (their amounts are already reserved by billableByService).
  for (const inv of ds.invoices.filter((i) => i.lifecycle === 'draft')) {
    const project = ds.projects.find((p) => p.id === inv.projectId)
    if (!project || project.operationalStatus === 'cancelled') continue
    const t = invoiceTotals(inv)
    rows.push({
      key: `draft|${inv.id}`,
      state: 'draft',
      projectId: project.id,
      projectCode: project.code,
      clientName: ds.clients.find((c) => c.id === inv.clientId)?.name ?? '',
      concept: inv.number,
      items: inv.lines.map((l) => l.description),
      po: [...new Set(inv.lines.map((l) => ds.purchaseOrders.find((p) => p.id === l.purchaseOrderId)?.clientPoNumber).filter(Boolean))].join(', ') || undefined,
      amounts: { [inv.currency]: t.total },
      reason: 'Preparada: falta emitirla en el sistema fiscal y confirmar la emisión externa.',
      action: { label: 'Completar emisión', href: invoicePath(inv.id) },
    })
  }
  return rows.sort((a, b) => BILLING_ORDER.indexOf(a.state) - BILLING_ORDER.indexOf(b.state) || a.projectCode.localeCompare(b.projectCode))
}

/* ───────────── Purchase orders needing attention ───────────── */

export interface PoRow {
  key: string
  kind: 'quote-sent' | 'no-po' | 'po-review'
  projectId: string
  projectCode: string
  clientName: string
  reference: string
  status: string
  date?: string
  reason: string
  /** Amount concerned, per currency (formatted by the UI). */
  amounts?: Amounts
  action: Action
}

/** Per-project PO work only: open-PO and no-PO projects never produce artificial pendings. */
export function poQueue(ds: Dataset, today: string): PoRow[] {
  const rows: PoRow[] = []
  for (const project of ds.projects) {
    if (project.operationalStatus === 'cancelled') continue
    const client = ds.clients.find((c) => c.id === project.clientId)
    const policy = effectivePolicy(client, project)
    if (policy.poMode !== 'project') continue
    const base = { projectId: project.id, projectCode: project.code, clientName: client?.name ?? '' }

    const commercial = [...projectCommercial(ds, project, today).values()].filter((r) => hasAmount(r.pendingAuthorization))
    if (commercial.length) {
      const total = sumAmounts(...commercial.map((r) => r.pendingAuthorization))
      const quotes = [...new Set(commercial.flatMap((r) => r.quotations.map((q) => q.id)))].map((id) => ds.quotations.find((q) => q.id === id)).filter((q) => q?.status === 'approved' && !q.supersededById)
      rows.push({
        ...base,
        key: `no-po|${project.id}`,
        kind: 'no-po',
        reference: quotes.map((q) => `${q!.number} v${q!.version}`).join(', ') || 'Cotización aprobada',
        status: 'Aprobada sin OC',
        date: quotes.map((q) => q!.approvedAt).filter(Boolean).sort().at(-1),
        reason: `${commercial.length} ${commercial.length === 1 ? 'servicio' : 'servicios'} esperando OC.`,
        amounts: total,
        action: { label: 'Registrar o importar OC', href: `${projectPath(project.id)}?tab=finanzas` },
      })
    }

    const cmp = comparePoWithQuotation(ds, project.id)
    if (cmp.applicable) {
      const pending = cmp.rows.filter((r) => r.kind === 'item' && !isSettled(r))
      const stale = cmp.rows.filter((r) => r.staleReview)
      if (pending.length || stale.length) {
        const imports = ds.poImports.filter((i) => cmp.purchaseOrders.some((p) => p.id === i.poId)).map((i) => i.confirmedAt.slice(0, 10))
        rows.push({
          ...base,
          key: `po-review|${project.id}`,
          kind: 'po-review',
          reference: cmp.purchaseOrders.map((p) => p.clientPoNumber).join(', '),
          status: stale.length ? 'Resolución desactualizada' : 'Diferencias sin resolver',
          date: imports.sort().at(-1),
          reason: `${pending.length} ${pending.length === 1 ? 'concepto' : 'conceptos'} de la OC importada sin resolver frente a la cotización.`,
          action: { label: 'Revisar comparación', href: `${projectPath(project.id)}/comparacion-oc` },
        })
      }
    }

    // Quotations sent and still valid: the PO usually comes after the client's approval.
    const latest = new Map<string, number>()
    for (const q of ds.quotations) if (q.projectId === project.id) latest.set(q.number, Math.max(latest.get(q.number) ?? 0, q.version))
    for (const q of ds.quotations.filter((x) => x.projectId === project.id && x.version === latest.get(x.number) && effectiveStatus(x, today) === 'sent')) {
      rows.push({
        ...base,
        key: `quote|${q.id}`,
        kind: 'quote-sent',
        reference: `${q.number} v${q.version}`,
        status: 'Cotización enviada',
        date: q.sentAt,
        reason: `Esperando aprobación del cliente (válida hasta ${q.validUntil.split('-').reverse().join('/')}) para recibir la OC.`,
        action: { label: 'Ver cotización', href: quotationPath(q.id) },
      })
    }
  }
  const order = { 'po-review': 0, 'no-po': 1, 'quote-sent': 2 }
  return rows.sort((a, b) => order[a.kind] - order[b.kind] || (a.date ?? '').localeCompare(b.date ?? ''))
}

/* ───────────── Certificates ───────────── */

export interface CertificateRow {
  key: string
  kind: 'to-generate' | 'draft' | 'submitted' | 'approved-unbilled'
  projectId: string
  projectCode: string
  clientName: string
  reference: string
  amounts: Amounts
  date?: string
  action: Action
}

export function certificateQueue(ds: Dataset, today: string): CertificateRow[] {
  const rows: CertificateRow[] = []
  for (const project of ds.projects) {
    if (project.operationalStatus === 'cancelled') continue
    const client = ds.clients.find((c) => c.id === project.clientId)
    if (!effectivePolicy(client, project).requiresCertificate) continue
    const base = { projectId: project.id, projectCode: project.code, clientName: client?.name ?? '' }
    // Units to certify: only where the certificate is the sole missing requirement.
    const commercial = projectCommercial(ds, project, today)
    const certOnly = (serviceId: string) => {
      const m = commercial.get(serviceId)?.eligibility.missing ?? []
      return m.every((x) => /certificado/i.test(x))
    }
    const units = certifiableUnits(ds, project.id).filter((u) => u.available > 0 && certOnly(u.serviceId))
    if (units.length) {
      let amounts: Amounts = {}
      for (const u of units) amounts = addAmount(amounts, project.currency, Math.round(u.available * u.unitPrice * 100) / 100)
      rows.push({ ...base, key: `gen|${project.id}`, kind: 'to-generate', reference: `${units.length} ${units.length === 1 ? 'ítem' : 'ítems'} por certificar`, amounts, action: { label: 'Generar certificado', href: `${projectPath(project.id)}?tab=finanzas` } })
    }
    const billed = billedQuantities(ds, project.id)
    for (const c of ds.certificates.filter((x) => x.projectId === project.id)) {
      const total = c.lines.reduce<Amounts>((a, l) => addAmount(a, c.currency, Math.round(l.quantity * l.unitPrice * 100) / 100), {})
      const common = { ...base, reference: c.externalNumber ?? c.number, action: { label: 'Ver certificado', href: certificatePath(c.id) } }
      if (c.status === 'draft') rows.push({ ...common, key: c.id, kind: 'draft', amounts: total, date: c.createdAt.slice(0, 10) })
      else if (c.status === 'submitted') rows.push({ ...common, key: c.id, kind: 'submitted', amounts: total, date: c.submittedAt })
      else if (c.status === 'approved') {
        let left: Amounts = {}
        for (const l of c.lines) {
          const done = billed.get(`${c.id}|${l.serviceId}|${l.serviceItemId ?? ''}`) ?? 0
          const rest = Math.round((l.quantity - done) * 1000) / 1000
          if (rest > 0) left = addAmount(left, c.currency, Math.round(rest * l.unitPrice * 100) / 100)
        }
        if (hasAmount(left)) rows.push({ ...common, key: c.id, kind: 'approved-unbilled', amounts: left, date: c.approvedAt, action: { label: 'Facturar', href: `${projectPath(project.id)}?tab=finanzas` } })
      }
    }
  }
  const order = { 'approved-unbilled': 0, 'to-generate': 1, submitted: 2, draft: 3 }
  return rows.sort((a, b) => order[a.kind] - order[b.kind] || a.projectCode.localeCompare(b.projectCode))
}

/* ───────────── Operations ───────────── */

export interface AttentionRow {
  projectId: string
  projectCode: string
  clientName: string
  reasons: { text: string; href: string }[]
}

/** Active projects with real operational blockers (overdue tasks, blocked services, documents). */
export function projectsNeedingAttention(ds: Dataset, today: string): AttentionRow[] {
  const out: AttentionRow[] = []
  for (const p of ds.projects.filter(isActive)) {
    const reasons: AttentionRow['reasons'] = []
    const overdue = ds.tasks.filter((t) => t.projectId === p.id && taskBucket(t, today) === 'overdue').length
    if (overdue) reasons.push({ text: `${overdue} ${overdue === 1 ? 'tarea vencida' : 'tareas vencidas'}`, href: `${projectPath(p.id)}?tab=operaciones` })
    const blocked = ds.services.filter((s) => s.projectId === p.id && s.status === 'blocked')
    if (blocked.length) reasons.push({ text: `Bloqueado: ${blocked.map((s) => getServiceType(s.typeId).label).join(', ')}`, href: `${projectPath(p.id)}?tab=servicios` })
    const docs = ds.documents.filter((d) => d.projectId === p.id && (d.status === 'expired' || d.status === 'missing')).length
    if (docs) reasons.push({ text: `${docs} ${docs === 1 ? 'documento vencido o faltante' : 'documentos vencidos o faltantes'}`, href: `${projectPath(p.id)}?tab=documentos` })
    const initial = ds.initialDocuments.filter((d) => d.projectId === p.id && ['awaiting', 'correction'].includes(initialDocStage(d, today))).length
    if (initial) reasons.push({ text: `${initial} ${initial === 1 ? 'formulario del beneficiario' : 'formularios del beneficiario'} sin respuesta o con corrección`, href: `${projectPath(p.id)}?tab=documentos` })
    if (reasons.length) out.push({ projectId: p.id, projectCode: p.code, clientName: ds.clients.find((c) => c.id === p.clientId)?.name ?? '', reasons })
  }
  return out.sort((a, b) => b.reasons.length - a.reasons.length || a.projectCode.localeCompare(b.projectCode))
}

export interface InitialDocRow {
  id: string
  projectId: string
  projectCode: string
  name: string
  stage: InitialDocumentStage
  step: string
  href: string
}

/** Initial documentation not yet received (tasks are not duplicated here). */
export function pendingInitialDocs(ds: Dataset, today: string): InitialDocRow[] {
  const order: InitialDocumentStage[] = ['correction', 'awaiting', 'pending-send', 'sent', 'received']
  return ds.initialDocuments
    .filter((d) => d.status !== 'received' && ds.projects.find((p) => p.id === d.projectId && p.operationalStatus !== 'cancelled'))
    .map((d) => ({ id: d.id, projectId: d.projectId, projectCode: ds.projects.find((p) => p.id === d.projectId)!.code, name: d.name, stage: initialDocStage(d, today), step: nextStep(d, today) ?? '', href: `${projectPath(d.projectId)}?tab=documentos` }))
    .sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage))
}

/* ───────────── KPIs ───────────── */

export interface WorkQueue {
  billing: BillingRow[]
  pos: PoRow[]
  certificates: CertificateRow[]
  attention: AttentionRow[]
  initialDocs: InitialDocRow[]
}

export function workQueue(ds: Dataset, today: string): WorkQueue {
  return { billing: billingQueue(ds, today), pos: poQueue(ds, today), certificates: certificateQueue(ds, today), attention: projectsNeedingAttention(ds, today), initialDocs: pendingInitialDocs(ds, today) }
}

/** Amounts per currency (never added across currencies). */
export const totalOf = (rows: { amounts: Amounts }[]): Amounts => sumAmounts(...rows.map((r) => r.amounts))


