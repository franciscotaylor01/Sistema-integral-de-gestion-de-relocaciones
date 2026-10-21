import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { DateInput, Field, FormError, TextInput } from '@/components/ui/form'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { Modal } from '@/components/ui/Modal'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import { advanceStatusMeta } from '@/config/finance'
import { supplierPath } from '@/config/navigation'
import { addMoney } from '@/domain/finance/money'
import { advanceInfo, type AdvanceInfo } from '@/domain/finance/supplierPayments'
import { overheadCategoryOf, overheadSummary, periodOf } from '@/domain/finance/supplierViews'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import { matches } from '@/lib/search'
import type { CostRecord, CurrencyCode, SupplierPayment } from '@/types/domain'
import { SupplierPaymentDetailModal, SupplierPaymentModal } from '../modals/PaymentModals'
import { CostModal } from '../modals/SupplierModals'
import { ProjectRef } from './ProjectRef'

const sum = (xs: { currency: CurrencyCode; v: number }[]) => {
  const m = new Map<CurrencyCode, number>()
  for (const x of xs) m.set(x.currency, addMoney(m.get(x.currency) ?? 0, x.v))
  return [...m.entries()].map(([c, v]) => formatMoney(v, c)).join(' · ') || '—'
}

/* ───────────── Advances ───────────── */

interface AdvanceRow {
  p: SupplierPayment
  a: AdvanceInfo
}

export function AdvancesView({ ws, currency, q = '' }: { ws: Workspace; currency: CurrencyCode | ''; q?: string }) {
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<string>()
  const rows: AdvanceRow[] = ws.supplierPayments
    .map((p) => ({ p, a: advanceInfo(p) }))
    .filter((r): r is AdvanceRow => Boolean(r.a))
    .filter(({ p }) => (!currency || p.currency === currency) && matches(q, p.number, p.reference, ws.supplierById.get(p.supplierId)?.name, p.projectId ? ws.projectById.get(p.projectId)?.code : undefined))
    .sort((x, y) => y.p.date.localeCompare(x.p.date) || y.p.number.localeCompare(x.p.number))
  return (
    <Card aria-labelledby="fin-adv" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="fin-adv"
        title="Anticipos a proveedores"
        description={`Dinero entregado por adelantado para un proyecto (no es un costo). Sin aplicar: ${sum(rows.map(({ p, a }) => ({ currency: p.currency, v: a.available })))}`}
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
            Registrar anticipo
          </Button>
        }
      />
      <DataTable<AdvanceRow>
        className="mt-[18px]"
        caption="Anticipos"
        rows={rows}
        getRowId={(r) => r.p.id}
        minWidth={1180}
        dense
        columns={[
          {
            id: 'num',
            header: 'Anticipo',
            width: '130px',
            cell: ({ p }) => (
              <button type="button" onClick={() => setOpen(p.id)} className="tabular font-medium underline-offset-4 hover:underline">
                {p.number}
              </button>
            ),
          },
          { id: 'date', header: 'Fecha', width: '108px', className: 'tabular', cell: ({ p }) => formatDate(p.date) },
          {
            id: 'sup',
            header: 'Proveedor',
            width: '16%',
            cell: ({ p }) => (
              <Link to={supplierPath(p.supplierId)} className="block truncate underline-offset-4 hover:underline">
                {ws.supplierById.get(p.supplierId)?.name}
              </Link>
            ),
          },
          { id: 'proj', header: 'Proyecto', width: '20%', cell: ({ p }) => (p.projectId ? <ProjectRef ws={ws} projectId={p.projectId} serviceId={p.serviceId} /> : <span className="text-[12.5px] text-warning">Histórico sin proyecto (revisar)</span>) },
          { id: 'given', header: 'Entregado', className: 'tabular', cell: ({ p, a }) => formatMoney(a.given, p.currency) },
          { id: 'applied', header: 'Aplicado', className: 'tabular', cell: ({ p, a }) => formatMoney(a.applied, p.currency) },
          { id: 'avail', header: 'Sin aplicar', className: 'tabular font-semibold', cell: ({ p, a }) => formatMoney(a.available, p.currency) },
          { id: 'status', header: 'Estado', width: '190px', cell: ({ a }) => <StatusBadge meta={advanceStatusMeta[a.status]} /> },
        ]}
        empty={<EmptyState title="Sin anticipos" description="Registrá un anticipo para un proyecto aunque todavía no exista la obligación." />}
      />
      <SupplierPaymentModal open={creating} onClose={() => setCreating(false)} workspace={ws} mode="advance" />
      <SupplierPaymentDetailModal paymentId={open} onClose={() => setOpen(undefined)} workspace={ws} />
    </Card>
  )
}

/* ───────────── General (indirect) expenses ───────────── */

export function OverheadsView({ ws, currency, q = '' }: { ws: Workspace; currency: CurrencyCode | ''; q?: string }) {
  const [creating, setCreating] = useState(false)
  const [paying, setPaying] = useState<CostRecord>()
  const [period, setPeriod] = useState('')
  const all = ws.costs.filter((c) => c.scope === 'company' && (!currency || c.currency === currency))
  const periods = [...new Set(all.map(periodOf))].sort().reverse()
  const rows = all
    .filter((c) => (!period || periodOf(c) === period) && matches(q, c.description, overheadCategoryOf(c), c.supplierId ? ws.supplierById.get(c.supplierId)?.name : undefined))
    .sort((a, b) => b.date.localeCompare(a.date))
  const s = overheadSummary(rows)
  const monthly = overheadSummary(all).byMonth
  const status = (c: CostRecord) =>
    c.status === 'void' ? { label: 'Anulado', tone: 'neutral' as const } : c.paymentStatus === 'paid' ? { label: 'Pagado', tone: 'success' as const } : c.paymentStatus === 'pending' ? { label: 'Pendiente', tone: 'warning' as const } : { label: 'Sin estado registrado', tone: 'neutral' as const }
  return (
    <>
      <Card aria-label="Totales de gastos generales" className="grid gap-[14px] p-[18px] sm:grid-cols-2 xl:grid-cols-3">
        {s.byCurrency.length === 0 && <p className="text-[14px] text-muted">Sin gastos generales para los filtros elegidos.</p>}
        {s.byCurrency.map((u) => (
          <div key={u.currency} className="rounded-tile bg-surface-muted p-[16px] text-[13.5px]">
            <p className="text-ink-secondary">Gastos generales · {u.currency}</p>
            <p className="tabular mt-[8px] text-[18px] font-semibold">{formatMoney(u.total, u.currency)}</p>
            <p className="tabular mt-[4px] text-muted">
              Pagado {formatMoney(u.paid, u.currency)} · pendiente {formatMoney(u.pending, u.currency)}
              {u.unknown > 0 && ` · sin estado ${formatMoney(u.unknown, u.currency)}`}
            </p>
          </div>
        ))}
      </Card>
      <Card aria-labelledby="fin-ovh" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle
          id="fin-ovh"
          title="Gastos generales"
          description="Gastos indirectos de la empresa. No pertenecen a proyectos, no se distribuyen entre ellos ni se descuentan de la base de liquidación."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
              Registrar gasto general
            </Button>
          }
        />
        <div className="mt-[14px]">
          <FilterSelect size="sm" label="Mes" value={period} onChange={setPeriod} options={periods.map((p) => ({ value: p, label: p }))} />
        </div>
        <DataTable<CostRecord>
          className="mt-[14px]"
          caption="Gastos generales"
          rows={rows}
          getRowId={(c) => c.id}
          minWidth={1100}
          dense
          columns={[
            { id: 'period', header: 'Período', width: '96px', className: 'tabular', cell: (c) => periodOf(c) },
            { id: 'date', header: 'Fecha', width: '104px', className: 'tabular', cell: (c) => formatDate(c.date) },
            {
              id: 'desc',
              header: 'Concepto',
              width: '24%',
              cell: (c) => (
                <span className="block min-w-0">
                  <span className="block truncate font-medium">{c.description}</span>
                  <span className="block truncate text-[12px] text-muted">{overheadCategoryOf(c)}</span>
                </span>
              ),
            },
            { id: 'proj', header: 'Proyecto', width: '150px', cell: () => <ProjectRef ws={ws} /> },
            { id: 'sup', header: 'Proveedor', width: '14%', cell: (c) => <span className="block truncate text-ink-secondary">{c.supplierId ? ws.supplierById.get(c.supplierId)?.name : '—'}</span> },
            { id: 'amount', header: 'Importe', className: 'tabular font-medium', cell: (c) => formatMoney(c.amount, c.currency) },
            {
              id: 'status',
              header: 'Estado',
              width: '200px',
              cell: (c) => (
                <span className="block">
                  <StatusBadge meta={status(c)} />
                  {c.paymentStatus === 'paid' && (
                    <span className="tabular block text-[12px] text-muted">
                      {c.paidAt && formatDate(c.paidAt)}
                      {c.paymentRef && ` · ${c.paymentRef}`}
                    </span>
                  )}
                  {c.status === 'incurred' && c.paymentStatus !== 'paid' && (
                    <button type="button" onClick={() => setPaying(c)} className="text-[12.5px] font-medium text-ink-secondary underline-offset-2 hover:underline">
                      Registrar pago
                    </button>
                  )}
                </span>
              ),
            },
          ]}
          empty={<EmptyState title="Sin gastos generales" />}
        />
      </Card>
      <div className="grid grid-cols-1 gap-[24px] xl:grid-cols-2">
        <Card aria-labelledby="fin-ovh-cat" className="px-[19px] pb-[19px] pt-[19px]">
          <SectionTitle id="fin-ovh-cat" size="sm" title="Total por categoría" />
          <DataTable caption="Gastos por categoría" className="mt-[12px]" rows={s.byCategory} getRowId={(r) => `${r.category}-${r.currency}`} minWidth={420} dense columns={[
            { id: 'cat', header: 'Categoría', width: '55%', cell: (r) => r.category },
            { id: 'total', header: 'Total', className: 'tabular font-medium', cell: (r) => formatMoney(r.total, r.currency) },
          ]} />
        </Card>
        <Card aria-labelledby="fin-ovh-month" className="px-[19px] pb-[19px] pt-[19px]">
          <SectionTitle id="fin-ovh-month" size="sm" title="Comparación mensual" description="Cada moneda por separado." />
          <DataTable caption="Gastos por mes" className="mt-[12px]" rows={monthly} getRowId={(r) => `${r.period}-${r.currency}`} minWidth={480} dense columns={[
            { id: 'p', header: 'Mes', width: '90px', className: 'tabular', cell: (r) => r.period },
            { id: 'c', header: 'Moneda', width: '80px', cell: (r) => r.currency },
            { id: 't', header: 'Total', className: 'tabular font-medium', cell: (r) => formatMoney(r.total, r.currency) },
            { id: 'pd', header: 'Pagado', className: 'tabular text-success', cell: (r) => formatMoney(r.paid, r.currency) },
            { id: 'pn', header: 'Pendiente', className: 'tabular', cell: (r) => formatMoney(r.pending, r.currency) },
          ]} />
        </Card>
      </div>
      <CostModal open={creating} onClose={() => setCreating(false)} workspace={ws} scope="company" />
      <Modal open={Boolean(paying)} onClose={() => setPaying(undefined)} title="Registrar pago del gasto" description="Se actualiza el mismo gasto: no se crea un gasto nuevo." size="sm">
        {paying && <PayOverhead cost={paying} onClose={() => setPaying(undefined)} />}
      </Modal>
    </>
  )
}

function PayOverhead({ cost, onClose }: { cost: CostRecord; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [date, setDate] = useState(DEMO_TODAY)
  const [reference, setReference] = useState('')
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await run(() => actions.markOverheadPaid(cost.id, { date, reference }), { title: 'Pago registrado' })) onClose()
      }}
    >
      <FormError message={formError} />
      <p className="text-[13.5px] text-ink-secondary">
        {cost.description} · <span className="tabular font-medium">{formatMoney(cost.amount, cost.currency)}</span>
      </p>
      <Field label="Fecha de pago" required error={errors.date}>
        {(p) => <DateInput {...p} data-autofocus value={date} max={DEMO_TODAY} onChange={(e) => setDate(e.target.value)} />}
      </Field>
      <Field label="Referencia">{(p) => <TextInput {...p} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />}</Field>
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" type="submit" disabled={busy}>
          Registrar pago
        </Button>
      </div>
    </form>
  )
}
