import { getServiceType } from '@/config/serviceCatalog'
import { approvedAmountsByService } from '@/domain/commercial/quotations'
import { addMoney, cmpMoney, minMoney, subMoney } from '@/domain/finance/money'
import type {
  Client,
  CostCategory,
  CostRecord,
  CustomerReceipt,
  Invoice,
  InvoiceLine,
  ProjectRecord,
  PurchaseOrder,
  Quotation,
  ServiceRecord,
  Supplier,
  SupplierObligation,
  SupplierPayment,
} from '@/types/domain'
import type { LegacyInvoice, LegacyPayable, LegacyPayment, LegacySupplier } from './mock/seedTypes'

/*
 * Converts the Phase 1 flat finance records (amount/collected/paid stored on
 * documents) into Phase 4 records, preserving every historical amount:
 *  - invoices get service lines (mapped onto approved commercial amounts);
 *  - each historical payment becomes a receipt / supplier payment allocation;
 *  - stored "collected"/"paid" not explained by payments become an explicit
 *    migration record, so derived balances equal the original ones.
 */

export const LEGAL_ENTITY_ID = 'le_relocare'

export interface LegacyFinance {
  suppliers: LegacySupplier[] | Supplier[]
  invoices: LegacyInvoice[]
  payables: LegacyPayable[]
  payments: LegacyPayment[]
}

interface Base {
  clients: Client[]
  projects: ProjectRecord[]
  services: ServiceRecord[]
  quotations: Quotation[]
  purchaseOrders: PurchaseOrder[]
}

const SUPPLIER_CONTACTS: Record<string, { contactName: string; phone: string }> = {
  sup_01: { contactName: 'Jeroen Bakker', phone: '+31 20 555 0101' },
  sup_02: { contactName: 'Mariela Ocampo', phone: '+54 299 555 0144' },
  sup_03: { contactName: 'Lucía Serrano', phone: '+34 91 555 0177' },
  sup_04: { contactName: 'Emily Tran', phone: '+1 416 555 0122' },
  sup_05: { contactName: 'Haruto Sato', phone: '+81 3 5555 0190' },
  sup_06: { contactName: 'Renata Lima', phone: '+55 11 5555 0133' },
  sup_07: { contactName: 'Felipe Rojas', phone: '+56 2 2555 0166' },
  sup_08: { contactName: 'Paula Medina', phone: '+54 11 5555 0188' },
  sup_09: { contactName: 'Thiago Souza', phone: '+55 51 5555 0112' },
  sup_10: { contactName: 'Hannah Brooks', phone: '+1 713 555 0119' },
  sup_11: { contactName: 'Diego Funes', phone: '+54 264 555 0150' },
  sup_12: { contactName: 'Carla Ibarra', phone: '+52 81 5555 0161' },
  sup_13: { contactName: 'Andrés Pardo', phone: '+57 1 555 0108' },
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '')

export function convertSuppliers(suppliers: (LegacySupplier | Supplier)[], payables: LegacyPayable[]): Supplier[] {
  return suppliers.map((s) => {
    if ('categories' in s) return s
    const currencies = payables.filter((p) => p.supplierId === s.id).map((p) => p.currency)
    const contact = SUPPLIER_CONTACTS[s.id]
    return {
      id: s.id,
      name: s.name,
      kind: 'company',
      country: s.country,
      contactName: contact?.contactName,
      email: `cuentas@${slug(s.name)}.example`,
      phone: contact?.phone,
      preferredCurrency: currencies[0] ?? 'USD',
      categories: [s.category],
      paymentDetails: 'Datos bancarios a completar (demo)',
      defaultPaymentCondition: 'due-date',
      active: true,
    }
  })
}

const costCategory = (typeId: string): CostCategory =>
  typeId === 'moving' ? 'moving' : ['immigration', 'dni', 'tie', 'apostille', 'cuil-unification'].includes(typeId) ? 'migration' : 'supplier-fee'

const methodOf = (m: LegacyPayment['method']) => m

export function convertLegacyFinance(base: Base, legacy: LegacyFinance) {
  const suppliers = convertSuppliers(legacy.suppliers, legacy.payables)
  const serviceById = new Map(base.services.map((s) => [s.id, s]))
  const projectById = new Map(base.projects.map((p) => [p.id, p]))
  const clientById = new Map(base.clients.map((c) => [c.id, c]))

  /* Invoices → lines mapped onto approved amounts per service (oldest first). */
  const capacity = new Map<string, number>() // `${serviceId}|${currency}`
  const invoices: Invoice[] = []
  const sorted = [...legacy.invoices].filter((i) => projectById.has(i.projectId)).sort((a, b) => a.issueDate.localeCompare(b.issueDate))
  for (const inv of sorted) {
    const project = projectById.get(inv.projectId)!
    const services = base.services.filter((s) => s.projectId === project.id)
    const approved = approvedAmountsByService({ quotations: base.quotations }, project.id)
    const lines: InvoiceLine[] = []
    let remaining = inv.amount
    services.forEach((s, i) => {
      if (cmpMoney(remaining, 0) <= 0) return
      const key = `${s.id}|${inv.currency}`
      if (!capacity.has(key)) capacity.set(key, approved.get(s.id)?.[inv.currency] ?? (project.currency === inv.currency ? (s.price ?? 0) : 0))
      const take = minMoney(remaining, capacity.get(key)!)
      if (cmpMoney(take, 0) <= 0) return
      capacity.set(key, subMoney(capacity.get(key)!, take))
      remaining = subMoney(remaining, take)
      const quote = base.quotations.find((q) => q.projectId === project.id && q.status === 'approved' && !q.supersededById && q.lines.some((l) => l.serviceId === s.id))
      const po = base.purchaseOrders.find((p) => p.projectId === project.id && p.status === 'active' && p.allocations.some((a) => a.serviceId === s.id))
      lines.push({ id: `${inv.id}_l${i + 1}`, serviceId: s.id, quotationId: quote?.id, purchaseOrderId: po?.id, description: `${getServiceType(s.typeId).label} — ${project.code}`, quantity: 1, unitPrice: take })
    })
    if (cmpMoney(remaining, 0) > 0) {
      lines.push({ id: `${inv.id}_adj`, description: `Importe histórico sin servicio asociado — ${project.code}`, quantity: 1, unitPrice: remaining, reimbursable: true })
    }
    const client = clientById.get(inv.clientId)
    invoices.push({
      id: inv.id,
      number: inv.number,
      issuerId: LEGAL_ENTITY_ID,
      kind: client?.headquarters.country === 'AR' ? 'A' : 'E',
      clientId: inv.clientId,
      projectId: inv.projectId,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      currency: inv.currency,
      lines,
      taxes: [],
      lifecycle: inv.status === 'draft' ? 'draft' : 'issued',
      notes: 'Factura histórica migrada: importes sin desglose impositivo.',
      createdAt: `${inv.issueDate}T09:00:00`,
      createdBy: 'stf_05',
      issuedAt: inv.status === 'draft' ? undefined : inv.issueDate,
      legacy: true,
    })
  }

  /* Incoming payments → receipts. */
  const receipts: CustomerReceipt[] = []
  let recSeq = 0
  const recNumber = (date: string) => `REC-${date.slice(0, 4)}-${String(++recSeq).padStart(4, '0')}`
  const invoiceIds = new Set(invoices.map((i) => i.id))
  for (const p of legacy.payments.filter((x) => x.direction === 'incoming' && invoiceIds.has(x.documentId)).sort((a, b) => a.date.localeCompare(b.date))) {
    const inv = invoices.find((i) => i.id === p.documentId)!
    receipts.push({
      id: `rec_${p.id}`,
      number: recNumber(p.date),
      clientId: inv.clientId,
      date: p.date,
      currency: p.currency,
      amount: p.amount,
      method: methodOf(p.method),
      reference: `Transferencia ${p.counterparty}`,
      allocations: [{ id: `ra_${p.id}`, invoiceId: inv.id, amount: p.amount, date: p.date }],
      status: 'recorded',
      createdAt: `${p.date}T12:00:00`,
      createdBy: 'stf_05',
    })
  }
  for (const inv of legacy.invoices.filter((i) => invoiceIds.has(i.id))) {
    const explained = addMoney(...receipts.filter((r) => r.allocations.some((a) => a.invoiceId === inv.id)).map((r) => r.amount))
    const gap = subMoney(inv.collected, explained)
    if (cmpMoney(gap, 0) > 0) {
      receipts.push({
        id: `rec_mig_${inv.id}`,
        number: recNumber(inv.dueDate),
        clientId: inv.clientId,
        date: inv.dueDate,
        currency: inv.currency,
        amount: gap,
        method: 'transfer',
        reference: 'Cobro histórico (migración)',
        notes: 'Generado al migrar: el cobro estaba registrado en la factura sin comprobante de pago.',
        allocations: [{ id: `ra_mig_${inv.id}`, invoiceId: inv.id, amount: gap, date: inv.dueDate }],
        status: 'recorded',
        createdAt: `${inv.dueDate}T12:00:00`,
        createdBy: 'stf_05',
      })
    }
  }

  /* Payables → incurred costs + obligations; outgoing payments → supplier payments. */
  const costs: CostRecord[] = []
  const obligations: SupplierObligation[] = []
  for (const p of legacy.payables.filter((x) => projectById.has(x.projectId))) {
    const service = p.serviceId ? serviceById.get(p.serviceId) : undefined
    const project = projectById.get(p.projectId)!
    const description = `${service ? getServiceType(service.typeId).label : 'Servicio'} — ${project.code}`
    costs.push({
      id: `cost_${p.id}`,
      scope: 'project',
      projectId: p.projectId,
      serviceId: service?.id,
      supplierId: p.supplierId,
      category: costCategory(service?.typeId ?? ''),
      description,
      currency: p.currency,
      amount: p.amount,
      date: p.issueDate,
      status: 'incurred',
      createdAt: `${p.issueDate}T09:00:00`,
      createdBy: 'stf_05',
    })
    obligations.push({
      id: p.id,
      reference: p.reference,
      supplierId: p.supplierId,
      projectId: p.projectId,
      serviceId: service?.id,
      costId: `cost_${p.id}`,
      description,
      issueDate: p.issueDate,
      dueDate: p.dueDate,
      currency: p.currency,
      amount: p.amount,
      paymentCondition: 'due-date',
      lifecycle: p.status === 'pending-approval' ? 'pending-approval' : 'approved',
      createdAt: `${p.issueDate}T09:00:00`,
      createdBy: 'stf_05',
    })
  }
  const supplierPayments: SupplierPayment[] = []
  let paySeq = 0
  const payNumber = (date: string) => `PAG-${date.slice(0, 4)}-${String(++paySeq).padStart(4, '0')}`
  const obligationIds = new Set(obligations.map((o) => o.id))
  for (const p of legacy.payments.filter((x) => x.direction === 'outgoing' && obligationIds.has(x.documentId)).sort((a, b) => a.date.localeCompare(b.date))) {
    const ob = obligations.find((o) => o.id === p.documentId)!
    supplierPayments.push({
      id: `spay_${p.id}`,
      number: payNumber(p.date),
      supplierId: ob.supplierId,
      date: p.date,
      currency: p.currency,
      amount: p.amount,
      method: methodOf(p.method),
      reference: `Pago a ${p.counterparty}`,
      allocations: [{ id: `spa_${p.id}`, obligationId: ob.id, amount: p.amount }],
      status: 'recorded',
      createdAt: `${p.date}T12:00:00`,
      createdBy: 'stf_05',
    })
  }
  for (const p of legacy.payables.filter((x) => obligationIds.has(x.id))) {
    const explained = addMoney(...supplierPayments.filter((sp) => sp.allocations.some((a) => a.obligationId === p.id)).map((sp) => sp.amount))
    const gap = subMoney(p.paid, explained)
    if (cmpMoney(gap, 0) > 0) {
      supplierPayments.push({
        id: `spay_mig_${p.id}`,
        number: payNumber(p.dueDate),
        supplierId: p.supplierId,
        date: p.dueDate,
        currency: p.currency,
        amount: gap,
        method: 'transfer',
        reference: 'Pago histórico (migración)',
        allocations: [{ id: `spa_mig_${p.id}`, obligationId: p.id, amount: gap }],
        status: 'recorded',
        createdAt: `${p.dueDate}T12:00:00`,
        createdBy: 'stf_05',
      })
    }
  }

  return { suppliers, invoices, receipts, costs, obligations, supplierPayments }
}

export type ConvertedFinance = ReturnType<typeof convertLegacyFinance>
