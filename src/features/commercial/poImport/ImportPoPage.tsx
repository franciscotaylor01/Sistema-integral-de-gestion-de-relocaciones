import { ClipboardPaste, Cpu, Eye, FileSearch, FileUp, Plus, TriangleAlert } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { DateInput, FormError, SelectInput, TextArea, TextInput } from '@/components/ui/form'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import { priceUnitLabel, purchaseOrderStatusMeta } from '@/config/commercial'
import { projectPath, purchaseOrderPath } from '@/config/navigation'
import { getServiceType } from '@/config/serviceCatalog'
import { effectivePolicy } from '@/domain/commercial/catalog'
import { extractPo, FIELD_LABELS, provenanceLabel, type PoDocument, type PoFieldKey } from '@/domain/commercial/poExtraction'
import { duplicatePos, MAX_SOURCE_TEXT, poInputFromReview, reviewProblems } from '@/domain/commercial/poImport'
import { availableToAuthorize, validatePurchaseOrder } from '@/domain/commercial/purchaseOrders'
import { randomId, type DomainContext } from '@/domain/context'
import { validateFile } from '@/domain/finance/attachments'
import { storeLocalFile } from '@/features/documents/localFiles'
import { NotFoundPage } from '@/features/sections/NotFoundPage'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import { useWorkspace, type Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatCurrency } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'
import { deleteFile } from '@/services/local/attachmentStore'
import { kindOf, localProvider, remoteProvider } from '@/services/extraction/poReaders'
import type { CurrencyCode, PoImportField, PriceUnit, Project } from '@/types/domain'
import { importStatusMeta, parseTarget, targetKey, toImportLines, toReview, VERIFY_ONLY, type ReviewLine } from './reviewState'

export function ImportPoPage() {
  const { projectId = '' } = useParams()
  const { workspace, loading } = useWorkspace()
  if (loading || !workspace) {
    return (
      <div className="pt-[5px]" aria-busy="true" aria-label="Cargando">
        <Skeleton className="h-[34px] w-[260px] rounded-full" />
        <Skeleton className="mt-[28px] h-[360px] rounded-card" />
      </div>
    )
  }
  const project = workspace.projectById.get(projectId)
  if (!project) return <NotFoundPage title="Proyecto no encontrado" />
  return <ImportView ws={workspace} project={project} />
}

const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')))

function ImportView({ ws, project }: { ws: Workspace; project: Project }) {
  const actions = useActions()
  const navigate = useNavigate()
  const { run, busy, errors, formError } = useCommand()
  const client = ws.clientById.get(project.clientId)
  const policy = effectivePolicy(client, project)
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'file' | 'text'>('file')
  const [file, setFile] = useState<File>()
  const [text, setText] = useState('')
  const [doc, setDoc] = useState<PoDocument>()
  const [fields, setFields] = useState<PoImportField[]>([])
  const [lines, setLines] = useState<ReviewLine[]>([])
  const [readError, setReadError] = useState<string>()
  const [reading, setReading] = useState(false)
  const [target, setTarget] = useState<string>('')
  const [overwrite, setOverwrite] = useState(false)
  const [requestId] = useState(() => randomId('req'))
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : undefined), [file])

  const analyze = async () => {
    setReadError(undefined)
    if (mode === 'file') {
      if (!file) return setReadError('Elegí un PDF o un Excel .xlsx.')
      const err = !kindOf(file) ? 'Formato no admitido: PDF o Excel .xlsx.' : validateFile(kindOf(file) === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', file.size)
      if (err) return setReadError(err)
    } else if (text.length > MAX_SOURCE_TEXT) return setReadError(`El texto supera ${MAX_SOURCE_TEXT} caracteres.`)
    setReading(true)
    try {
      const d = await localProvider.read(mode === 'file' ? { file } : { text })
      setDoc(d)
      const review = toReview(extractPo(ws.dataset, project.id, d))
      setFields(review.fields)
      setLines(review.lines)
      setTarget('')
      setOverwrite(false)
    } catch (e) {
      setReadError(e instanceof Error ? e.message : 'No se pudo leer el documento.')
    } finally {
      setReading(false)
    }
  }

  const setField = (key: string, value: string) => setFields((fs) => fs.map((f) => (f.key === key ? { ...f, value: value || undefined, edited: value !== (f.detected ?? ''), confirmed: true } : f)))
  const confirmField = (key: string, confirmed: boolean) => setFields((fs) => fs.map((f) => (f.key === key ? { ...f, confirmed } : f)))
  const setLine = (key: string, p: Partial<ReviewLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)))
  const addLine = () =>
    setLines((ls) => [...ls, { key: `m${ls.length + 1}`, raw: '(línea agregada manualmente)', description: '', quantity: 1, status: 'missing', included: true, confirmed: true, candidates: [], source: { section: 'Carga manual' } }])

  const value = (k: PoFieldKey) => fields.find((f) => f.key === k)?.value ?? ''
  const reviewInput = { projectId: project.id, fields, lines: toImportLines(lines), receivedDate: DEMO_TODAY }
  const problems = doc ? reviewProblems(reviewInput) : {}
  const poInput = doc ? poInputFromReview(ws.dataset, reviewInput) : undefined
  const dups = duplicatePos(ws.dataset, project.clientId, value('poNumber'))
  const activeDup = dups.find((p) => p.status === 'active')
  const updating = Boolean(target)
  const ctx: DomainContext = { actorId: '', now: () => DEMO_TODAY, today: () => DEMO_TODAY, newId: (p) => p }
  const poErrors = poInput ? validatePurchaseOrder(ws.dataset, poInput, ctx, updating ? target : undefined) : {}
  if (!updating) delete poErrors.clientPoNumber
  const currency = value('currency') as CurrencyCode | ''
  const available = currency ? availableToAuthorize(ws.dataset, project.id, currency, updating ? target : undefined) : new Map<string, number>()
  const sum = lines.filter((l) => l.included).reduce((s, l) => s + (l.amount ?? 0), 0)
  const projectServices = ws.services.filter((s) => s.projectId === project.id)
  const targetOptions = projectServices.flatMap((s) => {
    const label = getServiceType(s.typeId).label
    return [
      { value: targetKey({ serviceId: s.id }), label: `${label} (servicio)` },
      ...ws.catalogItems.filter((i) => i.serviceTypeId === s.typeId && i.active).map((i) => ({ value: targetKey({ serviceId: s.id, catalogItemId: i.id }), label: `${label} — ${i.name}` })),
      ...(s.items ?? []).filter((i) => i.special).map((i) => ({ value: targetKey({ serviceId: s.id, serviceItemId: i.id }), label: `${label} — ${i.name} (especial)` })),
    ]
  })
  const canConfirm = doc && !Object.keys(problems).length && !Object.keys(poErrors).length && (!activeDup || (updating && overwrite))

  const confirm = async () => {
    let stored: Awaited<ReturnType<typeof storeLocalFile>> | undefined
    if (mode === 'file' && file) {
      try {
        stored = await storeLocalFile(file)
      } catch (e) {
        return setReadError(e instanceof Error ? e.message : 'No se pudo guardar el archivo en este navegador.')
      }
    }
    const result = await run(
      () =>
        actions.confirmPoImport(
          {
            ...reviewInput,
            mode: updating ? 'update' : 'create',
            targetPoId: updating ? target : undefined,
            overwriteConfirmed: overwrite,
            provider: localProvider.id,
            source: { kind: doc!.kind, fileName: file?.name, file: stored && { attachmentId: stored.attachmentId, mime: stored.mime, size: stored.size }, text: mode === 'text' ? text : undefined },
          },
          requestId,
        ),
      { title: updating ? 'OC actualizada' : 'OC registrada', description: 'Datos validados y documento original conservados.' },
    )
    if (result) navigate(purchaseOrderPath(result.poId))
    else if (stored) await deleteFile(stored.attachmentId).catch(() => undefined)
  }

  return (
    <div className="pt-[5px]">
      <PageHeader
        eyebrow={<BackLink to={`${projectPath(project.id)}?tab=finanzas`} label={project.code} />}
        title="Importar orden de compra"
        description={`${client?.name} · ${ws.personById.get(project.beneficiaryId)?.name}. SIGR lee el documento localmente y propone los datos; la OC se registra recién cuando confirmás la revisión.`}
      />

      {policy.poMode === 'open' && (
        <p className="mt-[20px] rounded-panel bg-info-soft px-[14px] py-[11px] text-[13.5px] text-info">
          Este proyecto factura contra una OC abierta administrada desde Clientes: no necesita una OC por proyecto.
        </p>
      )}

      <Card aria-labelledby="poi-doc" className="mt-[24px] px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle id="poi-doc" title="Documento" description="PDF con texto seleccionable, Excel .xlsx o el texto del email. El archivo se guarda solo en este navegador." />
        <div className="mt-[14px] inline-flex rounded-full bg-surface-muted p-[3px]" role="tablist" aria-label="Tipo de entrada">
          {(
            [
              ['file', 'Archivo PDF / Excel', FileUp],
              ['text', 'Texto de email', ClipboardPaste],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn('inline-flex items-center gap-[6px] rounded-full px-[14px] py-[7px] text-[13.5px] font-medium', mode === m ? 'bg-contrast text-on-contrast' : 'text-ink-secondary hover:text-ink')}
            >
              <Icon aria-hidden className="size-[15px]" strokeWidth={1.9} />
              {label}
            </button>
          ))}
        </div>
        <div className="mt-[14px]">
          {mode === 'file' ? (
            <div className="flex flex-wrap items-center gap-[10px]">
              <input ref={fileRef} type="file" className="sr-only" aria-label="Documento de la OC" accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setFile(e.target.files?.[0])} />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <FileUp aria-hidden className="size-[16px]" strokeWidth={1.9} />
                Elegir archivo
              </Button>
              {file && <span className="truncate text-[14px]">{file.name}</span>}
            </div>
          ) : (
            <TextArea aria-label="Texto del email" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pegá aquí el cuerpo del email con la orden de compra…" className="font-[inherit] text-[13.5px]" />
          )}
        </div>
        <FormError message={readError} />
        <div className="mt-[14px] flex flex-wrap items-center gap-[10px]">
          <Button onClick={analyze} disabled={reading}>
            <FileSearch aria-hidden className="size-[16px]" strokeWidth={1.9} />
            {reading ? 'Leyendo…' : 'Analizar documento'}
          </Button>
          <Button variant="secondary" disabled title={remoteProvider.unavailableReason} className="h-auto min-h-[46px] whitespace-normal py-[8px] text-left">
            <Cpu aria-hidden className="size-[16px]" strokeWidth={1.9} />
            {remoteProvider.label}: no configurado
          </Button>
        </div>

        {doc && (
          <div className="mt-[14px] flex flex-col gap-[8px]">
            {doc.status === 'ok' ? (
              <p className="rounded-[14px] bg-success-soft px-[12px] py-[9px] text-[13px] text-success">
                Lectura local: {doc.lines.length} líneas de texto{doc.tables.length ? ` y ${doc.tables.reduce((n, t) => n + t.rows.length, 0)} filas de tabla` : ''}. Revisá cada dato antes de registrar.
              </p>
            ) : (
              <p className="flex items-start gap-[8px] rounded-[14px] bg-warning-soft px-[12px] py-[9px] text-[13px] text-warning">
                <TriangleAlert aria-hidden className="mt-[1px] size-[15px] shrink-0" strokeWidth={2} />
                <span>
                  {doc.reason} {doc.status === 'requires-processor' ? 'Requiere revisión manual o un procesador IA/OCR (no configurado). No se extrajo ningún dato.' : ''} Podés completar los datos a mano.
                </span>
              </p>
            )}
            <details className="text-[13px]">
              <summary className="inline-flex cursor-pointer items-center gap-[6px] font-medium text-ink-secondary">
                <Eye aria-hidden className="size-[14px]" strokeWidth={1.9} />
                Ver documento original
              </summary>
              <div className="mt-[8px]">
                {fileUrl && (
                  <a href={fileUrl} target="_blank" rel="noopener" className="font-medium text-ink underline">
                    Abrir {file?.name} en otra pestaña
                  </a>
                )}
                <pre className="mt-[8px] max-h-[260px] overflow-auto whitespace-pre-wrap rounded-[12px] bg-surface-muted p-[10px] font-mono text-[12px] leading-[1.5]">
                  {mode === 'text' ? text : doc.lines.map((l) => `${provenanceLabel({ ...l.source, file: undefined })}  ${l.text}`).join('\n') || '(sin texto legible)'}
                </pre>
              </div>
            </details>
          </div>
        )}
      </Card>

      {doc && (
        <>
          <Card aria-labelledby="poi-fields" className="mt-[24px] px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle id="poi-fields" title="Datos de la OC" description="Corregí o completá lo necesario. Los datos dudosos o inconsistentes necesitan tu confirmación. Los datos de verificación nunca modifican el cliente ni el proyecto." />
            <DataTable<PoImportField>
              className="mt-[16px]"
              caption="Datos extraídos"
              rows={fields}
              getRowId={(f) => f.key}
              minWidth={900}
              columns={[
                { id: 'label', header: 'Dato extraído', width: '17%', cell: (f) => <span className="font-medium">{f.label}</span> },
                {
                  id: 'raw',
                  header: 'Valor detectado',
                  width: '28%',
                  cell: (f) => (
                    <span className="block min-w-0">
                      <span className="block truncate" title={f.raw}>
                        {f.raw ?? <span className="text-subtle">—</span>}
                      </span>
                      <span className="block truncate text-[11.5px] text-muted">{provenanceLabel(f.source)}</span>
                    </span>
                  ),
                },
                { id: 'sigr', header: 'Campo SIGR', width: '27%', cell: (f) => <FieldInput f={f} ws={ws} project={project} onChange={(v) => setField(f.key, v)} /> },
                {
                  id: 'status',
                  header: 'Estado',
                  width: '28%',
                  cell: (f) => (
                    <span className="block whitespace-normal">
                      <StatusBadge meta={importStatusMeta[f.status]} />
                      {f.edited && <span className="ml-[6px] text-[12px] text-muted">· corregido</span>}
                      {f.note && <span className="block text-[12px] leading-[1.35] text-muted">{f.note}</span>}
                      {(f.status === 'confirm' || f.status === 'inconsistent') && (
                        <label className="mt-[4px] flex items-center gap-[6px] text-[12.5px]">
                          <input type="checkbox" className="size-[15px] accent-[var(--color-ink)]" checked={f.confirmed} onChange={(e) => confirmField(f.key, e.target.checked)} aria-label={`Confirmar ${f.label}`} />
                          Confirmado
                        </label>
                      )}
                      {problems[`fields.${fields.indexOf(f)}`] && <span className="block text-[12px] font-medium text-danger">Pendiente de confirmar</span>}
                    </span>
                  ),
                },
              ]}
            />
          </Card>

          <Card aria-labelledby="poi-lines" className="mt-[24px] px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle
              id="poi-lines"
              title="Líneas y correspondencias"
              description="Cada línea conserva su texto original. Elegí el servicio del proyecto o excluí la línea: SIGR no crea servicios nuevos."
              action={
                <Button size="sm" variant="outline" onClick={addLine}>
                  <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
                  Agregar línea manual
                </Button>
              }
            />
            <FormError message={problems.lines} />
            <div className="mt-[14px] flex flex-col gap-[8px]">
              {lines.length === 0 && <p className="text-[13.5px] text-muted">No se detectaron líneas. Agregalas manualmente.</p>}
              {lines.map((l, i) => (
                <section key={l.key} aria-label={`Línea ${i + 1}`} className={cn('rounded-panel px-[14px] py-[12px]', l.included ? 'bg-surface-muted' : 'bg-surface-muted/50 opacity-70')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <label className="flex min-w-0 flex-1 basis-[260px] items-start gap-[8px] text-[13.5px]">
                      <input type="checkbox" className="mt-[3px] size-[16px] accent-[var(--color-ink)]" checked={l.included} onChange={(e) => setLine(l.key, { included: e.target.checked })} aria-label={`Incluir línea ${i + 1}`} />
                      <span className="min-w-0">
                        <span className="block break-words font-mono text-[12.5px]">{l.raw}</span>
                        <span className="block text-[11.5px] text-muted">{provenanceLabel(l.source)}</span>
                      </span>
                    </label>
                    <span className="flex flex-col items-end gap-[4px] text-right">
                      <StatusBadge meta={importStatusMeta[l.status]} />
                      {l.included && (l.status !== 'recognized') && (
                        <label className="flex items-center gap-[6px] text-[12.5px]">
                          <input type="checkbox" className="size-[15px] accent-[var(--color-ink)]" checked={l.confirmed} onChange={(e) => setLine(l.key, { confirmed: e.target.checked })} aria-label={`Confirmar línea ${i + 1}`} />
                          Confirmada
                        </label>
                      )}
                    </span>
                  </div>
                  {l.note && <p className="mt-[4px] pl-[24px] text-[12px] text-muted">{l.note}</p>}
                  {l.included && (
                    <div className="mt-[10px] grid gap-[8px] pl-[24px] sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_90px_130px_130px_130px_minmax(0,2fr)]">
                      <TextInput aria-label={`Descripción línea ${i + 1}`} value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} />
                      <TextInput aria-label={`Cantidad línea ${i + 1}`} inputMode="decimal" value={l.quantity ?? ''} onChange={(e) => { const q = num(e.target.value); setLine(l.key, { quantity: q, amount: q !== undefined && l.unitPrice !== undefined ? Math.round(q * l.unitPrice * 100) / 100 : l.amount }) }} />
                      <SelectInput aria-label={`Unidad línea ${i + 1}`} value={l.unit ?? ''} onChange={(e) => setLine(l.key, { unit: (e.target.value || undefined) as PriceUnit | undefined })}>
                        <option value="">Unidad…</option>
                        {(Object.keys(priceUnitLabel) as PriceUnit[]).map((u) => (
                          <option key={u} value={u}>
                            {priceUnitLabel[u]}
                          </option>
                        ))}
                      </SelectInput>
                      <TextInput aria-label={`Precio unitario línea ${i + 1}`} inputMode="decimal" value={l.unitPrice ?? ''} onChange={(e) => { const p = num(e.target.value); setLine(l.key, { unitPrice: p, amount: p !== undefined && l.quantity !== undefined ? Math.round(p * l.quantity * 100) / 100 : l.amount }) }} />
                      <TextInput aria-label={`Importe línea ${i + 1}`} inputMode="decimal" value={l.amount ?? ''} onChange={(e) => setLine(l.key, { amount: num(e.target.value) })} />
                      <SelectInput aria-label={`Servicio SIGR línea ${i + 1}`} value={targetKey(l)} onChange={(e) => setLine(l.key, { ...parseTarget(e.target.value), confirmed: true })}>
                        <option value="">Elegí el servicio del proyecto…</option>
                        {l.candidates.length > 0 && (
                          <optgroup label="Sugeridos">
                            {l.candidates.map((c) => (
                              <option key={`s-${c.value}`} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Servicios del proyecto">
                          {targetOptions.filter((o) => !l.candidates.some((c) => c.value === o.value)).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </optgroup>
                      </SelectInput>
                    </div>
                  )}
                  {l.included && problems[`lines.${i}.serviceId`] && <p className="mt-[4px] pl-[24px] text-[12px] font-medium text-danger">{problems[`lines.${i}.serviceId`]}</p>}
                </section>
              ))}
            </div>
          </Card>

          <Card aria-labelledby="poi-confirm" className="mt-[24px] px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle id="poi-confirm" title="Registro" description="Se crea la OC con el flujo comercial habitual (montos dentro de lo aprobado). Nada se aprueba automáticamente." />
            <div className="mt-[14px] grid gap-[12px] md:grid-cols-2">
              <div className="rounded-panel bg-surface-muted px-[14px] py-[12px] text-[13.5px]">
                <p className="font-medium">Asignación por servicio</p>
                <ul className="mt-[6px] flex flex-col gap-[4px]">
                  {(poInput?.allocations ?? []).map((a) => {
                    const s = ws.serviceById.get(a.serviceId)
                    const max = available.get(a.serviceId)
                    return (
                      <li key={a.serviceId} className="flex justify-between gap-3">
                        <span>{s ? getServiceType(s.typeId).label : a.serviceId}</span>
                        <span className="tabular">
                          {currency ? formatCurrency(a.amount, currency) : a.amount}
                          <span className="ml-[6px] text-[12px] text-muted">disponible {max !== undefined && currency ? formatCurrency(max, currency) : '—'}</span>
                        </span>
                      </li>
                    )
                  })}
                  {!poInput?.allocations.length && <li className="text-muted">Sin líneas incluidas.</li>}
                </ul>
                <p className="mt-[8px] text-[12.5px] text-muted">
                  Suma de líneas {currency ? formatCurrency(sum, currency, { decimals: 2 }) : sum} · total de la OC {currency && value('total') ? formatCurrency(Number(value('total')), currency, { decimals: 2 }) : '—'}
                </p>
              </div>
              <div className="flex flex-col gap-[8px]">
                {dups.length > 0 ? (
                  <div className="rounded-panel bg-warning-soft px-[14px] py-[12px] text-[13.5px] text-warning">
                    <p className="font-medium">Posible duplicado: el cliente ya tiene la OC {value('poNumber')}</p>
                    <ul className="mt-[6px] flex flex-col gap-[4px] text-ink">
                      {dups.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center gap-[8px]">
                          <Link to={purchaseOrderPath(p.id)} className="font-medium underline">
                            {p.internalNumber}
                          </Link>
                          <StatusBadge meta={purchaseOrderStatusMeta[p.status]} />
                          <span className="tabular">{formatCurrency(p.authorizedAmount, p.currency)}</span>
                          <span className="text-muted">{ws.projectById.get(p.projectId)?.code}</span>
                        </li>
                      ))}
                    </ul>
                    {activeDup && activeDup.projectId === project.id && (
                      <div className="mt-[8px] flex flex-col gap-[6px] text-ink">
                        <label className="flex items-center gap-[6px]">
                          <input type="checkbox" className="size-[15px] accent-[var(--color-ink)]" checked={updating} onChange={(e) => (setTarget(e.target.checked ? activeDup.id : ''), setOverwrite(false))} />
                          Actualizar la OC existente {activeDup.internalNumber} con estos datos
                        </label>
                        {updating && (
                          <label className="flex items-start gap-[6px]">
                            <input type="checkbox" className="mt-[3px] size-[15px] accent-[var(--color-ink)]" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} aria-label="Confirmar reemplazo" />
                            Revisé las diferencias ({formatCurrency(activeDup.authorizedAmount, activeDup.currency)} → {currency && value('total') ? formatCurrency(Number(value('total')), currency) : '—'}) y quiero reemplazar los datos de la OC.
                          </label>
                        )}
                      </div>
                    )}
                    {activeDup && !updating && <p className="mt-[6px] text-[12.5px]">No se crea una OC duplicada: corregí el número o elegí actualizar la existente.</p>}
                  </div>
                ) : (
                  value('poNumber') && <p className="rounded-panel bg-surface-muted px-[14px] py-[12px] text-[13px] text-muted">No hay otra OC del cliente con el número {value('poNumber')}.</p>
                )}
                {Object.entries(poErrors).length > 0 && (
                  <ul className="rounded-panel bg-danger-soft px-[14px] py-[10px] text-[12.5px] text-danger">
                    {Object.entries(poErrors).map(([k, v]) => (
                      <li key={k}>{v}</li>
                    ))}
                  </ul>
                )}
                {value('total') && Math.abs(Number(value('total')) - sum) > 0.01 && (
                  <p className="text-[12.5px] text-warning">El total de la OC no coincide con la suma de las líneas incluidas: revisá si corresponde.</p>
                )}
                {Object.keys(problems).length > 0 && <p className="text-[12.5px] text-warning">Quedan {Object.keys(problems).length} dato(s) por revisar.</p>}
              </div>
            </div>
            <FormError message={formError ?? Object.values(errors)[0]} />
            <div className="mt-[14px] flex justify-end">
              <Button onClick={confirm} disabled={!canConfirm || busy}>
                {busy ? 'Registrando…' : updating ? 'Actualizar OC' : 'Confirmar y registrar OC'}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function FieldInput({ f, ws, project, onChange }: { f: PoImportField; ws: Workspace; project: Project; onChange: (v: string) => void }) {
  const key = f.key as PoFieldKey
  const label = FIELD_LABELS[key]?.sigr ?? f.label
  const v = f.value ?? ''
  if (VERIFY_ONLY.includes(key)) {
    const current = key === 'client' ? ws.clientById.get(project.clientId)?.name : key === 'taxId' ? ws.clientById.get(project.clientId)?.taxId || 'Sin registrar' : key === 'province' ? (project.province ?? 'Sin provincia') : project.code
    return (
      <span className="block text-[13px]">
        <span className="block truncate font-medium">{current}</span>
        <span className="block text-[11.5px] text-muted">{label}</span>
      </span>
    )
  }
  const common = { 'aria-label': `${f.label} (SIGR)` }
  if (key === 'issueDate' || key === 'validTo') return <DateInput {...common} value={v} max={key === 'issueDate' ? DEMO_TODAY : undefined} onChange={(e) => onChange(e.target.value)} />
  if (key === 'currency')
    return (
      <SelectInput {...common} value={v} onChange={(e) => onChange(e.target.value)}>
        <option value="">Elegí la moneda…</option>
        {CURRENCY_ORDER.map((c) => (
          <option key={c} value={c}>
            {c}
            {c === project.currency ? ' (moneda del proyecto)' : ''}
          </option>
        ))}
      </SelectInput>
    )
  if (key === 'quotationRef') {
    const approved = ws.quotations.filter((q) => q.projectId === project.id && q.status === 'approved' && !q.supersededById)
    return (
      <SelectInput {...common} value={approved.some((q) => q.number === v) ? v : ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Sin cotización</option>
        {approved.map((q) => (
          <option key={q.id} value={q.number}>
            {q.number} v{q.version}
          </option>
        ))}
      </SelectInput>
    )
  }
  return <TextInput {...common} value={v} inputMode={key === 'total' ? 'decimal' : undefined} placeholder={key === 'paymentTerms' ? 'Días, ej. 45 o «30 hábiles»' : undefined} onChange={(e) => onChange(key === 'total' ? e.target.value.replace(',', '.') : e.target.value)} />
}
