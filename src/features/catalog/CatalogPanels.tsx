import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { DateInput, Field, FormError, SelectInput, Switch, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import { priceUnitLabel } from '@/config/commercial'
import { certificatePath, projectPath } from '@/config/navigation'
import { activeServiceTypes, getServiceType } from '@/config/serviceCatalog'
import { randomId } from '@/domain/context'
import { effectivePolicy, isServiceOffered, openOrderLive, type CatalogItemInput, type OpenOrderInput } from '@/domain/commercial/catalog'
import { certificateTotal } from '@/domain/commercial/certificates'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import type { CatalogItem, Client, OpenOrderStatus, OpenPurchaseOrder, PriceUnit } from '@/types/domain'
import { certificateStatusMeta, openOrderStatusMeta, poModeLabel } from './meta'
import { PaymentTermsFields } from '@/features/finance/components/PaymentTermsFields'

const Footer = ({ onClose, busy, label }: { onClose: () => void; busy: boolean; label: string }) => (
  <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
    <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
      Cancelar
    </Button>
    <Button size="sm" type="submit" disabled={busy}>
      {busy ? 'Guardando…' : label}
    </Button>
  </div>
)

/* ───────────── Main services offered to a client ───────────── */

export function OfferedServicesCard({ workspace: ws, client }: { workspace: Workspace; client: Client }) {
  const actions = useActions()
  const { run, busy } = useCommand()
  const [sel, setSel] = useState<string[]>(() => client.offeredServices ?? activeServiceTypes().map((s) => s.id))
  const dirty = JSON.stringify([...sel].sort()) !== JSON.stringify([...(client.offeredServices ?? activeServiceTypes().map((s) => s.id))].sort())
  const policy = effectivePolicy(client)
  return (
    <Card aria-labelledby="offered-title" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="offered-title"
        title="Servicios ofrecidos y política"
        description={`${poModeLabel[policy.poMode]}${policy.requiresCertificate ? ' · exige certificado aprobado' : ''}. Elegí qué servicios principales ofrece Relocare a este cliente.`}
        action={
          <Button size="sm" disabled={!dirty || busy} onClick={() => run(() => actions.setOfferedServices(client.id, sel), { title: 'Servicios ofrecidos actualizados' })}>
            Guardar selección
          </Button>
        }
      />
      <div className="mt-[16px] flex flex-wrap gap-[8px]">
        {activeServiceTypes().map((t) => {
          const on = sel.includes(t.id)
          const items = ws.catalogItems.filter((i) => i.serviceTypeId === t.id && i.active).length
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => setSel((s) => (on ? s.filter((x) => x !== t.id) : [...s, t.id]))}
              className={cn('flex items-center gap-[8px] rounded-full border py-[5px] pl-[5px] pr-[12px] text-[13.5px] transition-colors', on ? 'border-ink bg-surface font-medium' : 'border-line text-muted hover:bg-surface-muted')}
            >
              <ServiceChip type={t.id} />
              {t.label}
              <span className="text-[12px] text-muted">{items ? `${items} ítems` : 'sin subservicios'}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

/* ───────────── Global catalog of sub-services ───────────── */

export function CatalogPanel({ workspace: ws, client }: { workspace: Workspace; client?: Client }) {
  const [editing, setEditing] = useState<CatalogItem | { serviceTypeId: string }>()
  const types = activeServiceTypes().filter((t) => !client || isServiceOffered(client, t.id))
  return (
    <Card aria-labelledby="catalog-title" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="catalog-title"
        title="Catálogo de servicios y subservicios"
        description="Catálogo general compartido por todos los clientes. Los subservicios son ítems comerciales facturables (no tareas operativas); los precios se definen en cada tarifario."
      />
      <div className="mt-[16px] flex flex-col gap-[8px]">
        {types.map((t) => {
          const items = ws.catalogItems.filter((i) => i.serviceTypeId === t.id)
          return (
            <details key={t.id} className="group rounded-[16px] bg-surface-muted">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-[14px] py-[11px]">
                <span className="flex items-center gap-[10px] text-[14px] font-medium">
                  <ServiceChip type={t.id} />
                  {t.label}
                  <span className="text-[12.5px] font-normal text-muted">{items.length ? `${items.length} subservicios` : 'Se factura como línea única'}</span>
                </span>
                <ChevronDown aria-hidden className="size-[16px] text-muted transition-transform group-open:rotate-180" strokeWidth={2} />
              </summary>
              <div className="px-[8px] pb-[8px]">
                {items.length > 0 && (
                  <ul className="flex flex-col gap-[4px]">
                    {items.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-3 rounded-[12px] bg-surface px-[12px] py-[8px] text-[13.5px]">
                        <span className="min-w-0">
                          <span className={cn('block truncate font-medium', !i.active && 'text-muted line-through')}>{i.name}</span>
                          <span className="block truncate text-[12px] text-muted">
                            {priceUnitLabel[i.unit]}
                            {i.description && ` · ${i.description}`}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-[8px]">
                          {!i.active && <StatusBadge meta={{ label: 'Inactivo', tone: 'neutral' }} />}
                          <button type="button" aria-label={`Editar ${i.name}`} onClick={() => setEditing(i)} className="grid size-[30px] place-items-center rounded-full text-ink-secondary hover:bg-surface-muted">
                            <Pencil aria-hidden className="size-[14px]" strokeWidth={1.9} />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Button size="sm" variant="outline" className="mt-[8px]" onClick={() => setEditing({ serviceTypeId: t.id })}>
                  <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
                  Subservicio de {t.label}
                </Button>
              </div>
            </details>
          )
        })}
      </div>
      <Modal open={Boolean(editing)} onClose={() => setEditing(undefined)} title={editing && 'id' in editing ? 'Editar subservicio' : 'Nuevo subservicio'} description={editing ? getServiceType(editing.serviceTypeId).label : undefined} size="sm">
        {editing && <CatalogItemForm item={editing} onClose={() => setEditing(undefined)} />}
      </Modal>
    </Card>
  )
}

function CatalogItemForm({ item, onClose }: { item: CatalogItem | { serviceTypeId: string }; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const existing = 'id' in item ? item : undefined
  const [input, setInput] = useState<CatalogItemInput>({ serviceTypeId: item.serviceTypeId, name: existing?.name ?? '', description: existing?.description ?? '', unit: existing?.unit ?? 'service', active: existing?.active ?? true })
  const patch = (p: Partial<CatalogItemInput>) => setInput((i) => ({ ...i, ...p }))
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(() => (existing ? actions.updateCatalogItem(existing.id, input) : actions.createCatalogItem(input)), { title: existing ? 'Subservicio actualizado' : 'Subservicio creado' })
        if (ok) onClose()
      }}
    >
      <FormError message={formError} />
      <Field label="Nombre" required error={errors.name}>
        {(p) => <TextInput {...p} data-autofocus value={input.name} onChange={(e) => patch({ name: e.target.value })} maxLength={80} />}
      </Field>
      <Field label="Descripción" error={errors.description}>
        {(p) => <TextInput {...p} value={input.description} onChange={(e) => patch({ description: e.target.value })} maxLength={300} />}
      </Field>
      <Field label="Unidad de medida">
        {(p) => (
          <SelectInput {...p} value={input.unit} onChange={(e) => patch({ unit: e.target.value as PriceUnit })}>
            {(Object.keys(priceUnitLabel) as PriceUnit[]).map((u) => (
              <option key={u} value={u}>
                {priceUnitLabel[u]}
              </option>
            ))}
          </SelectInput>
        )}
      </Field>
      <Switch checked={input.active} onChange={(v) => patch({ active: v })} label="Activo" description="Los inactivos no se pueden contratar; los proyectos existentes los conservan." />
      <Footer onClose={onClose} busy={busy} label={existing ? 'Guardar' : 'Crear subservicio'} />
    </form>
  )
}

/* ───────────── Open purchase orders ───────────── */

export function OpenOrdersPanel({ workspace: ws, client }: { workspace: Workspace; client?: Client }) {
  const actions = useActions()
  const { run } = useCommand()
  const [creating, setCreating] = useState(false)
  const orders = ws.openOrders.filter((o) => !client || o.clientId === client.id)
  const itemLabel = (o: OpenPurchaseOrder['items'][number]) => (o.catalogItemId ? (ws.catalogItems.find((i) => i.id === o.catalogItemId)?.name ?? o.catalogItemId) : 'Servicio completo')
  return (
    <Card aria-labelledby="oca-title" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="oca-title"
        title="OC abiertas"
        description="Autorizan servicios y subservicios a precios aprobados por cliente y provincia. Se reutilizan en varios proyectos y no tienen saldo consumible."
        action={
          client && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
              Nueva OC abierta
            </Button>
          )
        }
      />
      {orders.length === 0 ? (
        <EmptyState title="Sin OC abiertas" description={client ? 'Registrá la OC abierta del cliente para cada provincia.' : undefined} />
      ) : (
        <div className="mt-[16px] flex flex-col gap-[10px]">
          {orders.map((o) => {
            const projects = ws.projects.filter((p) => p.openOrderId === o.id)
            const certs = ws.certificates.filter((c) => c.openOrderId === o.id)
            const live = openOrderLive(o, DEMO_TODAY)
            return (
              <details key={o.id} className="group rounded-[16px] bg-surface-muted" open={orders.length === 1}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-[14px] py-[12px]">
                  <span className="min-w-0">
                    <span className="tabular block text-[14.5px] font-semibold">
                      OC {o.number} · {o.province}
                    </span>
                    <span className="block text-[12.5px] text-muted">
                      {client ? '' : `${ws.clientById.get(o.clientId)?.name} · `}
                      {formatDate(o.validFrom)} – {o.validTo ? formatDate(o.validTo) : 'sin fin'} · {o.items.length} ítems · {projects.length} proyectos · {certs.length} certificados
                    </span>
                  </span>
                  <span className="flex items-center gap-[8px]">
                    <StatusBadge meta={o.status === 'active' && !live ? { label: 'Fuera de vigencia', tone: 'warning' } : openOrderStatusMeta[o.status]} />
                    <ChevronDown aria-hidden className="size-[16px] text-muted transition-transform group-open:rotate-180" strokeWidth={2} />
                  </span>
                </summary>
                <div className="flex flex-col gap-[10px] px-[8px] pb-[10px]">
                  {(o.conditions || o.paymentTerms) && (
                    <p className="px-[6px] text-[13px] text-ink-secondary">
                      {o.paymentTerms && `Pago a ${o.paymentTerms.days} días ${o.paymentTerms.dayType === 'business' ? 'hábiles' : 'corridos'} desde la emisión. `}
                      {o.conditions && `Condiciones: ${o.conditions}`}
                    </p>
                  )}
                  <DataTable
                    caption={`Ítems autorizados en OC ${o.number}`}
                    rows={o.items}
                    getRowId={(i) => i.id}
                    minWidth={560}
                    dense
                    columns={[
                      {
                        id: 'svc',
                        header: 'Servicio',
                        width: '34%',
                        cell: (i) => (
                          <span className="flex items-center gap-[8px]">
                            <ServiceChip type={i.serviceTypeId} />
                            <span className="truncate">{getServiceType(i.serviceTypeId).label}</span>
                          </span>
                        ),
                      },
                      { id: 'item', header: 'Subservicio', width: '34%', cell: (i) => <span className="block truncate">{itemLabel(i)}</span> },
                      { id: 'price', header: 'Precio aprobado', className: 'tabular font-medium', cell: (i) => `${formatMoney(i.unitPrice, o.currency)} / ${priceUnitLabel[i.unit].toLowerCase()}` },
                    ]}
                  />
                  <div className="grid gap-[10px] sm:grid-cols-2">
                    <div className="rounded-[14px] bg-surface px-[12px] py-[10px] text-[13.5px]">
                      <p className="font-medium">Proyectos</p>
                      {projects.length ? (
                        <ul className="mt-[4px] flex flex-col gap-[2px]">
                          {projects.map((p) => (
                            <li key={p.id}>
                              <Link to={`${projectPath(p.id)}?tab=finanzas`} className="tabular hover:underline">
                                {p.code}
                              </Link>{' '}
                              <span className="text-muted">· {ws.personById.get(p.beneficiaryId)?.name}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted">Sin proyectos todavía.</p>
                      )}
                    </div>
                    <div className="rounded-[14px] bg-surface px-[12px] py-[10px] text-[13.5px]">
                      <p className="font-medium">Certificados</p>
                      {certs.length ? (
                        <ul className="mt-[4px] flex flex-col gap-[2px]">
                          {certs.map((c) => (
                            <li key={c.id} className="flex items-center justify-between gap-2">
                              <Link to={certificatePath(c.id)} className="tabular hover:underline">
                                {c.externalNumber ?? c.number}
                              </Link>
                              <span className="flex items-center gap-[6px]">
                                <span className="tabular text-muted">{formatMoney(certificateTotal(c), c.currency)}</span>
                                <StatusBadge meta={certificateStatusMeta[c.status]} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted">Sin certificados.</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-[8px] px-[4px]">
                    {(['active', 'suspended', 'cancelled'] as OpenOrderStatus[])
                      .filter((st) => st !== o.status)
                      .map((st) => (
                        <Button key={st} size="sm" variant="secondary" onClick={() => run(() => actions.setOpenOrderStatus(o.id, st), { title: `OC ${o.number}: ${openOrderStatusMeta[st].label.toLowerCase()}` })}>
                          Marcar {openOrderStatusMeta[st].label.toLowerCase()}
                        </Button>
                      ))}
                  </div>
                </div>
              </details>
            )
          })}
        </div>
      )}
      {client && (
        <Modal open={creating} onClose={() => setCreating(false)} title="Nueva OC abierta" description="Número oficial del cliente, provincia, vigencia y los ítems autorizados con su precio aprobado." size="lg">
          {creating && <OpenOrderForm ws={ws} client={client} onClose={() => setCreating(false)} />}
        </Modal>
      )}
    </Card>
  )
}

function OpenOrderForm({ ws, client, onClose }: { ws: Workspace; client: Client; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [requestId] = useState(() => randomId('req'))
  const [input, setInput] = useState<OpenOrderInput>({ number: '', clientId: client.id, province: '', currency: client.billingCurrency, validFrom: DEMO_TODAY, validTo: '', conditions: '', items: [] })
  const patch = (p: Partial<OpenOrderInput>) => setInput((i) => ({ ...i, ...p }))
  const setItem = (idx: number, p: Partial<OpenOrderInput['items'][number]>) => patch({ items: input.items.map((it, j) => (j === idx ? { ...it, ...p } : it)) })
  const types = activeServiceTypes().filter((t) => isServiceOffered(client, t.id))
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(() => actions.createOpenOrder(input, requestId), { title: 'OC abierta registrada' })
        if (ok) onClose()
      }}
    >
      <FormError message={formError} />
      <div className="grid gap-[12px] sm:grid-cols-3">
        <Field label="N.º oficial de OC" required error={errors.number}>
          {(p) => <TextInput {...p} data-autofocus value={input.number} onChange={(e) => patch({ number: e.target.value })} maxLength={40} />}
        </Field>
        <Field label="Provincia" required error={errors.province}>
          {(p) => <TextInput {...p} value={input.province} onChange={(e) => patch({ province: e.target.value })} maxLength={60} />}
        </Field>
        <Field label="Moneda" required error={errors.currency}>
          {(p) => (
            <SelectInput {...p} value={input.currency} onChange={(e) => patch({ currency: e.target.value as OpenOrderInput['currency'] })}>
              {client.currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Vigente desde" required error={errors.validFrom}>
          {(p) => <DateInput {...p} value={input.validFrom} onChange={(e) => patch({ validFrom: e.target.value })} />}
        </Field>
        <Field label="Vigente hasta" error={errors.validTo}>
          {(p) => <DateInput {...p} value={input.validTo} onChange={(e) => patch({ validTo: e.target.value })} />}
        </Field>
        <Field label="Condiciones comerciales">
          {(p) => <TextInput {...p} value={input.conditions} onChange={(e) => patch({ conditions: e.target.value })} maxLength={300} />}
        </Field>
      </div>
      <PaymentTermsFields value={input.paymentTerms} onChange={(t) => patch({ paymentTerms: t })} error={errors.paymentTerms} />
      <div className="flex flex-col gap-[8px] rounded-panel bg-surface-muted p-[8px]">
        {input.items.map((it, i) => (
          <div key={i} className="grid items-end gap-[8px] rounded-[14px] bg-surface p-[10px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_auto]">
            <Field label="Servicio" error={errors[`items.${i}.serviceTypeId`]}>
              {(p) => (
                <SelectInput {...p} value={it.serviceTypeId} onChange={(e) => setItem(i, { serviceTypeId: e.target.value, catalogItemId: undefined })}>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
            <Field label="Subservicio" error={errors[`items.${i}.catalogItemId`]}>
              {(p) => (
                <SelectInput
                  {...p}
                  value={it.catalogItemId ?? ''}
                  onChange={(e) => {
                    const ci = ws.catalogItems.find((x) => x.id === e.target.value)
                    setItem(i, { catalogItemId: e.target.value || undefined, unit: ci?.unit ?? it.unit })
                  }}
                >
                  <option value="">Servicio completo</option>
                  {ws.catalogItems
                    .filter((c) => c.serviceTypeId === it.serviceTypeId && c.active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </SelectInput>
              )}
            </Field>
            <Field label={`Precio (${input.currency})`} error={errors[`items.${i}.unitPrice`]}>
              {(p) => <TextInput {...p} inputMode="decimal" value={it.unitPrice || ''} onChange={(e) => setItem(i, { unitPrice: Number(e.target.value.replace(',', '.')) })} />}
            </Field>
            <Button size="sm" variant="secondary" className="h-[46px]" aria-label="Quitar ítem" onClick={() => patch({ items: input.items.filter((_, j) => j !== i) })}>
              <Trash2 aria-hidden className="size-[15px]" strokeWidth={1.9} />
            </Button>
          </div>
        ))}
        {errors.items && <p className="px-[6px] text-[12.5px] font-medium text-danger">{errors.items}</p>}
        <Button size="sm" variant="outline" className="self-start" onClick={() => patch({ items: [...input.items, { serviceTypeId: types[0]?.id ?? '', unit: 'service', unitPrice: 0 }] })}>
          <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
          Autorizar ítem
        </Button>
      </div>
      <Footer onClose={onClose} busy={busy} label="Registrar OC" />
    </form>
  )
}
