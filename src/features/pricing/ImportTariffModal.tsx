import { FileSpreadsheet } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, FormError, SelectInput, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { StatusMeta } from '@/config/catalogs'
import { activeServiceTypes, getServiceType } from '@/config/serviceCatalog'
import { randomId } from '@/domain/context'
import { buildReview, detectHeaderRow, guessMapping, parseRows, previousImport, reviewCounts, type ColumnMapping, type ColumnRole, type ReviewRow, type ReviewStatus, type RowOverride } from '@/domain/commercial/tariffImport'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'
import { columnLetter, readXlsx, XLSX_MAX_BYTES, type Sheet } from '@/lib/xlsx'
import { saveFile } from '@/services/local/attachmentStore'
import type { Client, CurrencyCode } from '@/types/domain'

const roleLabel: Record<ColumnRole, string> = { service: 'Servicio', item: 'Subservicio', price: 'Precio', currency: 'Moneda', unit: 'Unidad', validFrom: 'Vigencia desde', validTo: 'Vigencia hasta' }
const statusMeta: Record<ReviewStatus, StatusMeta> = {
  ready: { label: 'Lista', tone: 'success' },
  review: { label: 'Revisar', tone: 'warning' },
  error: { label: 'Error', tone: 'danger' },
  duplicate: { label: 'Duplicada', tone: 'danger' },
  excluded: { label: 'Excluida', tone: 'neutral' },
}
const actionLabel = { create: 'Nuevo', update: 'Actualiza', unchanged: 'Sin cambios' } as const

async function sha256(buf: ArrayBuffer): Promise<string | undefined> {
  try {
    const h = await crypto.subtle.digest('SHA-256', buf)
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return undefined
  }
}

export function ImportTariffModal({ open, onClose, ws, client }: { open: boolean; onClose: () => void; ws: Workspace; client: Client }) {
  return (
    <Modal open={open} onClose={onClose} title="Importar tarifario desde Excel" description="Lectura local del .xlsx. Nada se guarda hasta que confirmes; los precios nuevos quedan pendientes de aprobación." size="lg">
      {open && <Importer ws={ws} client={client} onClose={onClose} />}
    </Modal>
  )
}

function Importer({ ws, client, onClose }: { ws: Workspace; client: Client; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, formError } = useCommand()
  const inputRef = useRef<HTMLInputElement>(null)
  const [requestId] = useState(() => randomId('req'))
  const [file, setFile] = useState<{ blob: File; name: string; size: number; hash?: string }>()
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [sheetIdx, setSheetIdx] = useState(0)
  const [headerRow, setHeaderRow] = useState(0)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [step, setStep] = useState<'file' | 'map' | 'review' | 'done'>('file')
  const [overrides, setOverrides] = useState<Record<number, RowOverride>>({})
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<{ importId: string; stored: boolean }>()

  const sheet = sheets[sheetIdx]
  const parsed = sheet ? parseRows(sheet.rows, headerRow, mapping) : []
  const rows = step === 'review' || step === 'done' ? buildReview(ws.dataset, client.id, parsed, overrides) : []
  const counts = reviewCounts(rows)
  const prior = previousImport(ws.dataset, client.id, file?.hash)
  const ov = (n: number, p: Partial<RowOverride>) => setOverrides((o) => ({ ...o, [n]: { ...o[n], ...p } }))

  const chooseSheet = (i: number, list = sheets) => {
    setSheetIdx(i)
    const h = detectHeaderRow(list[i]?.rows ?? [])
    setHeaderRow(h)
    setMapping(guessMapping(list[i]?.rows[h] ?? []))
    setOverrides({})
  }

  const onFile = async (f: File) => {
    setError(undefined)
    if (!/\.xlsx$/i.test(f.name)) return setError('Elegí un archivo .xlsx (Excel 2007 o posterior).')
    if (f.size > XLSX_MAX_BYTES) return setError('El archivo supera 5 MB.')
    try {
      const buf = await f.arrayBuffer()
      const list = await readXlsx(buf)
      if (!list.length) return setError('El libro no tiene hojas.')
      setFile({ blob: f, name: f.name, size: f.size, hash: await sha256(buf) })
      setSheets(list)
      // Sheet with the most recognised headers first.
      const best = list.map((s, i) => ({ i, n: Object.keys(guessMapping(s.rows[detectHeaderRow(s.rows)] ?? [])).length })).sort((a, b) => b.n - a.n)[0].i
      chooseSheet(best, list)
      setStep('map')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.')
    }
  }

  const header = sheet?.rows[headerRow] ?? []
  const width = Math.max(header.length, ...(sheet?.rows.slice(headerRow, headerRow + 6).map((r) => r.length) ?? [0]))
  const colOptions = Array.from({ length: width }, (_, i) => ({ value: i, label: `${columnLetter(i)} · ${String(header[i] ?? '').slice(0, 30) || '(sin título)'}` }))

  const confirm = async () => {
    let attachmentId: string | undefined
    let stored = false
    if (file) {
      // Keep a local copy of the original file (this browser only) when possible.
      try {
        const id = randomId('att')
        await saveFile(id, file.blob)
        await actions.addAttachment({ id, entity: 'tariff-import', entityId: client.id, name: file.name, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: file.size, storage: 'indexeddb' })
        attachmentId = id
        stored = true
      } catch {
        stored = false
      }
    }
    let importId: string | undefined
    const ok = await run(async () => {
      const r = await actions.applyTariffImport(client.id, { file: { name: file!.name, size: file!.size, hash: file!.hash, attachmentId }, sheetName: sheet.name, headerRow, rows }, requestId)
      importId = r.importId
      return r
    }, { title: 'Tarifario importado', description: 'Los precios nuevos o modificados quedan pendientes de aprobación.' })
    if (ok && importId) {
      setResult({ importId, stored })
      setStep('done')
    }
  }

  if (step === 'file')
    return (
      <div className="flex flex-col gap-[14px]">
        <FormError message={error} />
        <div className="flex flex-col items-center gap-[10px] rounded-panel bg-surface-muted px-[16px] py-[28px] text-center">
          <FileSpreadsheet aria-hidden className="size-[28px] text-ink-secondary" strokeWidth={1.6} />
          <p className="text-[14px]">Elegí el Excel del tarifario de {client.name}.</p>
          <p className="text-[12.5px] text-muted">Formato .xlsx, hasta 5 MB. Se lee en tu navegador; no se envía a ningún servicio.</p>
          <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label="Archivo Excel" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <Button size="sm" onClick={() => inputRef.current?.click()}>
            Elegir archivo
          </Button>
        </div>
      </div>
    )

  if (step === 'map')
    return (
      <div className="flex flex-col gap-[14px]">
        <p className="text-[13.5px] text-ink-secondary">
          {file?.name} · {sheets.length} hoja(s)
        </p>
        <div className="grid gap-[12px] sm:grid-cols-2">
          <Field label="Hoja">
            {(p) => (
              <SelectInput {...p} value={sheetIdx} onChange={(e) => chooseSheet(Number(e.target.value))}>
                {sheets.map((s, i) => (
                  <option key={i} value={i}>
                    {s.name} ({s.rows.length} filas)
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Fila de encabezados" hint="Número de fila en Excel.">
            {(p) => (
              <TextInput
                {...p}
                type="number"
                min={1}
                value={headerRow + 1}
                onChange={(e) => {
                  const h = Math.max(0, Number(e.target.value) - 1)
                  setHeaderRow(h)
                  setMapping(guessMapping(sheet.rows[h] ?? []))
                }}
              />
            )}
          </Field>
          {(Object.keys(roleLabel) as ColumnRole[]).map((role) => (
            <Field key={role} label={`Columna: ${roleLabel[role]}`}>
              {(p) => (
                <SelectInput {...p} value={mapping[role] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [role]: e.target.value === '' ? undefined : Number(e.target.value) }))}>
                  <option value="">— No usar —</option>
                  {colOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
          ))}
        </div>
        <div className="overflow-x-auto rounded-panel bg-surface-muted p-[8px]">
          <table className="w-full min-w-[560px] text-[12.5px]">
            <tbody>
              {sheet.rows.slice(headerRow, headerRow + 6).map((r, i) => (
                <tr key={i} className={cn('border-t border-line', i === 0 && 'font-semibold')}>
                  {Array.from({ length: width }, (_, c) => (
                    <td key={c} className="max-w-[160px] truncate px-[6px] py-[4px]">
                      {String(r[c] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(mapping.price === undefined || (mapping.service === undefined && mapping.item === undefined)) && <FormError message="Asigná al menos la columna de precio y la de servicio o subservicio." />}
        <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
          <Button size="sm" variant="secondary" onClick={() => setStep('file')}>
            Otro archivo
          </Button>
          <Button size="sm" disabled={mapping.price === undefined || (mapping.service === undefined && mapping.item === undefined)} onClick={() => setStep('review')}>
            Revisar {parsed.length} filas
          </Button>
        </div>
      </div>
    )

  if (step === 'done') {
    const imp = ws.tariffImports.find((x) => x.id === result?.importId)
    return (
      <div className="flex flex-col gap-[12px] text-[14px]">
        <p className="font-medium">Importación registrada.</p>
        {imp && (
          <ul className="rounded-panel bg-surface-muted px-[14px] py-[10px] text-[13.5px]">
            <li>Precios nuevos: {imp.counts.created}</li>
            <li>Precios actualizados (versión pendiente si estaban aprobados): {imp.counts.updated}</li>
            <li>Sin cambios: {imp.counts.unchanged}</li>
            <li>Filas excluidas: {imp.counts.excluded}</li>
            <li>Subservicios creados: {imp.counts.newItems}</li>
          </ul>
        )}
        <p className="text-[12.5px] text-muted">
          {result?.stored ? 'Se guardó una copia del archivo solo en este navegador (no es respaldo en la nube).' : 'No se pudo guardar una copia local del archivo: se registró solo su nombre y tamaño.'} Subir el Excel no equivale a la aprobación del cliente: aprobá los precios desde el tarifario.
        </p>
        <div className="flex justify-end border-t border-line pt-[14px]">
          <Button size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    )
  }

  const blocked = counts.review + counts.error > 0
  const total = counts.create + counts.update
  return (
    <div className="flex flex-col gap-[12px]">
      <FormError message={formError} />
      {prior && <p className="rounded-[14px] bg-info-soft px-[12px] py-[9px] text-[13px] text-info">Este archivo ya se importó el {formatDate(prior.importedAt.slice(0, 10))}. Las filas sin cambios no se vuelven a escribir.</p>}
      <div className="flex flex-wrap gap-[8px] text-[12.5px]">
        <StatusBadge meta={{ label: `${counts.create} se importarán`, tone: 'success' }} />
        <StatusBadge meta={{ label: `${counts.update} se actualizarán`, tone: 'info' }} />
        <StatusBadge meta={{ label: `${counts.unchanged} sin cambios`, tone: 'neutral' }} />
        <StatusBadge meta={{ label: `${counts.excluded} excluidas`, tone: 'neutral' }} />
        <StatusBadge meta={{ label: `${counts.review} requieren revisión`, tone: 'warning' }} />
        <StatusBadge meta={{ label: `${counts.error} con errores/duplicadas`, tone: 'danger' }} />
      </div>
      <div className="flex flex-wrap gap-[8px]">
        <Button size="sm" variant="outline" onClick={() => rows.filter((r) => r.status === 'review').forEach((r) => ov(r.parsed.sourceRow, { confirmed: true }))}>
          Confirmar coincidencias propuestas
        </Button>
        <Button size="sm" variant="outline" onClick={() => rows.filter((r) => r.status === 'error' || r.status === 'duplicate').forEach((r) => ov(r.parsed.sourceRow, { excluded: true }))}>
          Excluir filas con errores
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-muted">
              <th className="px-[6px] py-[6px] font-normal">Fila</th>
              <th className="px-[6px] py-[6px] font-normal">Servicio detectado</th>
              <th className="px-[6px] py-[6px] font-normal">Subservicio</th>
              <th className="px-[6px] py-[6px] font-normal">Precio</th>
              <th className="px-[6px] py-[6px] font-normal">Moneda</th>
              <th className="px-[6px] py-[6px] font-normal">Coincidencia SIGR</th>
              <th className="px-[6px] py-[6px] font-normal">Estado</th>
              <th className="px-[6px] py-[6px] font-normal">Excluir</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <ReviewLine key={r.parsed.sourceRow} ws={ws} r={r} ov={(p) => ov(r.parsed.sourceRow, p)} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-[10px] border-t border-line pt-[14px]">
        {blocked && <span className="text-[12.5px] text-warning">Resolvé o excluí las filas marcadas para continuar.</span>}
        <Button size="sm" variant="secondary" onClick={() => setStep('map')} disabled={busy}>
          Volver al mapeo
        </Button>
        <Button size="sm" disabled={busy || blocked || !(total + counts.unchanged)} onClick={confirm}>
          Importar {total} registro(s)
        </Button>
      </div>
    </div>
  )
}

function ReviewLine({ ws, r, ov }: { ws: Workspace; r: ReviewRow; ov: (p: Partial<RowOverride>) => void }) {
  const items = r.serviceTypeId ? ws.catalogItems.filter((i) => i.serviceTypeId === r.serviceTypeId && i.active) : []
  const excluded = r.status === 'excluded'
  return (
    <tr className={cn('border-t border-line align-top', excluded && 'opacity-55')}>
      <td className="tabular px-[6px] py-[6px] text-muted">{r.parsed.sourceRow}</td>
      <td className="px-[6px] py-[6px]">{r.parsed.serviceText || '—'}</td>
      <td className="px-[6px] py-[6px]">{r.parsed.itemText || '—'}</td>
      <td className="px-[6px] py-[6px]">
        <TextInput aria-label={`Precio fila ${r.parsed.sourceRow}`} inputMode="decimal" disabled={excluded} className="h-[34px] w-[120px]" defaultValue={r.unitPrice ?? ''} onBlur={(e) => { const v = Number(e.target.value.replace(',', '.')); if (Number.isFinite(v) && v !== r.unitPrice) ov({ price: v }) }} />
        <span className="block text-[11.5px] text-muted">Original: {r.parsed.priceRaw || '—'}</span>
      </td>
      <td className="px-[6px] py-[6px]">
        <SelectInput aria-label={`Moneda fila ${r.parsed.sourceRow}`} disabled={excluded} className="h-[34px] w-[104px]" value={r.currency ?? ''} onChange={(e) => ov({ currency: (e.target.value || undefined) as CurrencyCode | undefined })}>
          <option value="">?</option>
          {CURRENCY_ORDER.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectInput>
        {r.parsed.currencyRaw && <span className="block text-[11.5px] text-muted">«{r.parsed.currencyRaw}»</span>}
      </td>
      <td className="px-[6px] py-[6px]">
        <div className="flex flex-col gap-[4px]">
          <SelectInput aria-label={`Servicio fila ${r.parsed.sourceRow}`} disabled={excluded} className="h-[34px]" value={r.serviceTypeId ?? ''} onChange={(e) => ov({ serviceTypeId: e.target.value || undefined, itemId: undefined })}>
            <option value="">Elegí el servicio</option>
            {activeServiceTypes().map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </SelectInput>
          {r.serviceTypeId && items.length > 0 && (
            <SelectInput aria-label={`Subservicio fila ${r.parsed.sourceRow}`} disabled={excluded} className="h-[34px]" value={r.itemId ?? ''} onChange={(e) => ov({ itemId: e.target.value === '__none' ? undefined : e.target.value, newItemName: e.target.value === 'new' ? r.parsed.itemText : undefined })}>
              {r.itemId === undefined && <option value="__none">Elegí el subservicio</option>}
              <option value="">{getServiceType(r.serviceTypeId).label} — servicio completo</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
              {r.parsed.itemText && <option value="new">Crear subservicio «{r.parsed.itemText}»</option>}
            </SelectInput>
          )}
        </div>
      </td>
      <td className="max-w-[260px] px-[6px] py-[6px]">
        <StatusBadge meta={statusMeta[r.status]} />
        {r.action && r.status === 'ready' && <span className="ml-[6px] text-[12px] text-muted">{actionLabel[r.action]}{r.action !== 'unchanged' && r.unitPrice && r.currency ? ` ${formatMoney(r.unitPrice, r.currency)}` : ''}</span>}
        {r.messages.map((m) => (
          <span key={m} className="block text-[12px] leading-[1.35] text-ink-secondary">
            {m}
          </span>
        ))}
        {r.status === 'review' && (
          <button type="button" className="mt-[2px] text-[12px] font-medium underline-offset-2 hover:underline" onClick={() => ov({ confirmed: true })}>
            Confirmar
          </button>
        )}
      </td>
      <td className="px-[6px] py-[6px]">
        <input type="checkbox" aria-label={`Excluir fila ${r.parsed.sourceRow}`} className="size-[16px] accent-[var(--color-ink)]" checked={excluded} onChange={(e) => ov({ excluded: e.target.checked })} />
      </td>
    </tr>
  )
}

