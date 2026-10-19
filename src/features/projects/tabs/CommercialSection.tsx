import { BadgeCheck, CircleDashed, FileSignature, Hourglass, Plus, ReceiptText, ShieldCheck } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useToast } from '@/components/feedback/useToast'
import { AmountsText } from '@/components/ui/Amounts'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { MetaBadge } from '@/components/ui/MetaBadge'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { StatTile } from '@/components/ui/StatTile'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import { billingMilestoneLabel, commercialStageMeta } from '@/config/commercial'
import { clientPath, invoicePath, purchaseOrderPath, quotationPath } from '@/config/navigation'
import { getServiceType } from '@/config/serviceCatalog'
import { hasAmount, sumAmounts, type Amounts } from '@/domain/commercial/money'
import { projectCommercial, type ServiceCommercial } from '@/domain/commercial/traceability'
import { DomainError } from '@/domain/errors'
import { billedByService } from '@/domain/finance/invoices'
import { purchaseOrderColumns, quotationColumns } from '@/features/commercial/columns'
import { PurchaseOrderModal } from '@/features/commercial/PurchaseOrderModal'
import { useActions } from '@/hooks/useActions'
import { formatCompactCurrency } from '@/lib/format'
import type { CurrencyCode, ProjectService } from '@/types/domain'
import type { ProjectContext } from '../projectContext'

const link = 'underline-offset-4 hover:underline'

/** One reference per quotation number: its latest version. */
function latestVersions<T extends { number: string; version: number }>(list: T[]): T[] {
  const map = new Map<string, T>()
  for (const q of list) if (!map.has(q.number) || map.get(q.number)!.version < q.version) map.set(q.number, q)
  return [...map.values()]
}

/** Commercial traceability: quotations, POs and invoice eligibility per contracted service. */
export function CommercialSection({ ctx }: { ctx: ProjectContext }) {
  const { project, workspace: ws, client } = ctx
  const actions = useActions()
  const navigate = useNavigate()
  const { notify } = useToast()
  const [creatingPo, setCreatingPo] = useState(false)
  const [busy, setBusy] = useState(false)

  const commercial = useMemo(() => projectCommercial(ws.dataset, project, DEMO_TODAY), [ws.dataset, project])
  const billed = useMemo(() => billedByService(ws.dataset, project.id), [ws.dataset, project.id])
  const rows = [...commercial.values()]
  const total = (pick: (s: ServiceCommercial) => Amounts) => sumAmounts(...rows.map(pick))
  const cur = project.currency
  const format = useCallback((v: number) => formatCompactCurrency(Math.round(v), cur), [cur])
  const quotations = ws.quotations.filter((q) => q.projectId === project.id).sort((a, b) => b.number.localeCompare(a.number) || b.version - a.version)
  const pos = ws.purchaseOrders.filter((p) => p.projectId === project.id).sort((a, b) => b.receivedDate.localeCompare(a.receivedDate))
  const draft = quotations.find((q) => q.status === 'draft')
  const hasApproved = quotations.some((q) => q.status === 'approved' && !q.supersededById)
  const policy = client?.policy

  const newQuotation = async () => {
    if (draft) return navigate(quotationPath(draft.id))
    setBusy(true)
    try {
      const r = await actions.createQuotation(project.id)
      notify({ title: 'Borrador de cotización creado', description: 'Las líneas se precargaron desde los servicios contratados.' })
      navigate(quotationPath(r.quotationId))
    } catch (e) {
      notify({ title: 'No se pudo crear la cotización', description: e instanceof DomainError ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  const other = (a: Amounts) => {
    const rest = (Object.keys(a) as CurrencyCode[]).filter((c) => c !== cur && (a[c] ?? 0) > 0)
    return rest.length ? <span>+ {rest.map((c) => formatCompactCurrency(a[c] ?? 0, c)).join(' · ')}</span> : null
  }

  return (
    <div className="flex flex-col gap-[24px]">
      {policy && client && (
        <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[8px] rounded-card bg-surface px-[18px] py-[14px] text-[13.5px] shadow-card">
          <span className="font-semibold">Política comercial de {client.name}</span>
          <MetaBadge className={policy.requiresPurchaseOrder ? undefined : 'bg-success-soft text-success'}>{policy.requiresPurchaseOrder ? 'Exige OC' : 'No exige OC'}</MetaBadge>
          <MetaBadge>{policy.requiresApprovedQuote ? 'Exige cotización aprobada' : 'Cotización opcional'}</MetaBadge>
          <MetaBadge>Factura {billingMilestoneLabel[policy.billingMilestone].toLowerCase()}</MetaBadge>
          <Link to={`${clientPath(client.id)}`} className={`ml-auto text-ink-secondary ${link}`}>
            Ver cliente
          </Link>
        </div>
      )}

      <Card aria-label="Indicadores comerciales del proyecto" className="grid grid-cols-1 gap-[14px] p-[18px] sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Cotizado" icon={FileSignature} value={total((s) => s.quoted)[cur] ?? 0} format={format} footer={other(total((s) => s.quoted)) ?? <span>Última versión emitida</span>} />
        <StatTile tone="accent" label="Aprobado" icon={BadgeCheck} value={total((s) => s.approved)[cur] ?? 0} format={format} footer={other(total((s) => s.approved)) ?? <span>Cotizaciones aprobadas</span>} />
        <StatTile label="Autorizado por OC" icon={ShieldCheck} value={total((s) => s.authorized)[cur] ?? 0} format={format} footer={<span>{pos.filter((p) => p.status === 'active').length} OC vigentes</span>} />
        <StatTile
          label="Pendiente de OC"
          icon={Hourglass}
          value={total((s) => s.pendingAuthorization)[cur] ?? 0}
          format={format}
          footer={<span>{policy?.requiresPurchaseOrder ? 'Aprobado sin autorizar' : 'El cliente no exige OC'}</span>}
        />
        <StatTile
          label="Facturable"
          icon={ReceiptText}
          value={total((s) => (s.eligibility.eligible ? s.eligibility.amount : {}))[cur] ?? 0}
          format={format}
          footer={<span>{rows.filter((r) => r.eligibility.eligible).length} de {rows.length} servicios</span>}
        />
      </Card>

      <Card aria-labelledby="com-trace" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle
          id="com-trace"
          title="Estado comercial por servicio"
          description="Cotización, aprobación, autorización por OC, ejecución y facturación se evalúan por separado."
        />
        <DataTable<ProjectService>
          className="mt-[18px]"
          caption="Estado comercial de los servicios"
          rows={project.services}
          getRowId={(s) => s.id}
          minWidth={1320}
          columns={[
            {
              id: 'service',
              header: 'Servicio',
              width: '17%',
              cell: (s) => (
                <span className="flex min-w-0 items-center gap-[10px]">
                  <ServiceChip type={s.typeId} />
                  <span className="truncate font-medium">{getServiceType(s.typeId).label}</span>
                </span>
              ),
            },
            { id: 'stage', header: 'Etapa comercial', width: '15%', cell: (s) => <StatusBadge meta={commercialStageMeta[commercial.get(s.id)!.stage]} className="whitespace-normal" /> },
            { id: 'quoted', header: 'Cotizado', width: '10%', cell: (s) => <AmountsText amounts={commercial.get(s.id)!.quoted} /> },
            { id: 'approved', header: 'Aprobado', width: '10%', className: 'font-medium', cell: (s) => <AmountsText amounts={commercial.get(s.id)!.approved} /> },
            { id: 'authorized', header: 'Autorizado OC', width: '10%', cell: (s) => <AmountsText amounts={commercial.get(s.id)!.authorized} /> },
            {
              id: 'pending',
              header: 'Pendiente OC',
              width: '10%',
              cell: (s) => {
                const pending = commercial.get(s.id)!.pendingAuthorization
                return <AmountsText amounts={pending} className={hasAmount(pending) ? 'font-medium text-warning' : undefined} empty={policy?.requiresPurchaseOrder ? '—' : 'No aplica'} />
              },
            },
            {
              id: 'eligibility',
              header: 'Facturación',
              width: '15%',
              cell: (s) => {
                const e = commercial.get(s.id)!.eligibility
                return (
                  <span className="block whitespace-normal" title={[...e.met.map((m) => `✓ ${m}`), ...e.missing.map((m) => `✗ ${m}`)].join('\n')}>
                    {e.eligible ? (
                      <StatusBadge meta={{ label: 'Facturable', tone: 'success' }} />
                    ) : (
                      <StatusBadge meta={{ label: 'No facturable', tone: 'neutral' }} />
                    )}
                    <span className="mt-[2px] block text-[12px] leading-[1.35] text-muted">{e.eligible ? <AmountsText inline amounts={e.amount} /> : e.missing.join(' · ')}</span>
                  </span>
                )
              },
            },
            {
              id: 'billed',
              header: 'Facturado',
              width: '10%',
              cell: (s) => <AmountsText amounts={billed.get(s.id) ?? {}} />,
            },
            {
              id: 'refs',
              header: 'Referencias',
              width: '13%',
              cell: (s) => {
                const c = commercial.get(s.id)!
                const invoices = ws.invoices.filter((i) => i.projectId === project.id && i.lifecycle !== 'cancelled' && i.lines.some((l) => l.serviceId === s.id))
                if (!c.quotations.length && !c.purchaseOrders.length && !invoices.length) return <span className="text-muted">—</span>
                return (
                  <span className="flex flex-col text-[12.5px]">
                    {latestVersions(c.quotations).map((q) => (
                      <Link key={q.id} to={quotationPath(q.id)} className={`tabular truncate ${link}`}>
                        {q.number} v{q.version}
                      </Link>
                    ))}
                    {c.purchaseOrders.map((p) => (
                      <Link key={p.id} to={purchaseOrderPath(p.id)} className={`tabular truncate text-ink-secondary ${link}`}>
                        OC {p.clientPoNumber}
                      </Link>
                    ))}
                    {invoices.map((i) => (
                      <Link key={i.id} to={invoicePath(i.id)} className={`tabular truncate text-ink-secondary ${link}`}>
                        {i.number}
                        {i.lifecycle === 'draft' && ' (borrador)'}
                      </Link>
                    ))}
                  </span>
                )
              },
            },
          ]}
        />
        <p className="mt-[12px] flex items-center gap-[6px] px-[4px] text-[12.5px] text-muted">
          <CircleDashed aria-hidden className="size-[13px]" strokeWidth={2} />
          Recibir una OC no habilita la facturación por sí sola: también se verifican la aprobación y el hito de facturación del cliente.
        </p>
      </Card>

      <Card aria-labelledby="com-quotes" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle
          id="com-quotes"
          title="Cotizaciones"
          description="Cada versión se conserva; las aprobadas no cambian aunque cambie el tarifario."
          action={
            <Button size="sm" onClick={newQuotation} disabled={busy}>
              <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
              {draft ? `Continuar borrador ${draft.number}` : 'Nueva cotización'}
            </Button>
          }
        />
        <DataTable
          className="mt-[18px]"
          caption="Cotizaciones del proyecto"
          rows={quotations}
          getRowId={(q) => q.id}
          rowHref={(q) => quotationPath(q.id)}
          minWidth={760}
          columns={quotationColumns(ws, { withProject: false, withClient: false })}
          empty={<EmptyState icon={FileSignature} title="Sin cotizaciones" description="Generá la primera desde los servicios contratados." />}
        />
      </Card>

      <Card aria-labelledby="com-pos" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle
          id="com-pos"
          title="Órdenes de compra"
          description={policy?.requiresPurchaseOrder ? 'Un proyecto puede tener varias OC; cada una puede autorizar varios servicios.' : 'Este cliente no exige OC; podés registrarlas igual si las emite.'}
          action={
            hasApproved || (policy && !policy.requiresApprovedQuote) ? (
              <Button size="sm" variant="outline" onClick={() => setCreatingPo(true)}>
                <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
                Registrar OC
              </Button>
            ) : (
              <Button size="sm" variant="secondary" disabled title="Primero aprobá una cotización">
                Requiere cotización aprobada
              </Button>
            )
          }
        />
        <DataTable
          className="mt-[18px]"
          caption="Órdenes de compra del proyecto"
          rows={pos}
          getRowId={(p) => p.id}
          rowHref={(p) => purchaseOrderPath(p.id)}
          minWidth={900}
          columns={purchaseOrderColumns(ws, { withProject: false, withClient: false })}
          empty={<EmptyState icon={ShieldCheck} title="Sin órdenes de compra" />}
        />
      </Card>

      <PurchaseOrderModal open={creatingPo} onClose={() => setCreatingPo(false)} workspace={ws} project={project} />
    </div>
  )
}
