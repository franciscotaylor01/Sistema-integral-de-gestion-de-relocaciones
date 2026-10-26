import { Download } from 'lucide-react'
import { Link } from 'react-router'
import { useToast } from '@/components/feedback/useToast'
import { projectPath } from '@/config/navigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { getServiceType } from '@/config/serviceCatalog'
import { provenanceLabel } from '@/domain/commercial/poExtraction'
import { downloadLocalFile, LOCAL_FILES_NOTE } from '@/features/documents/localFiles'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatDateTime } from '@/lib/dates'
import type { PurchaseOrder } from '@/types/domain'
import { importStatusMeta } from './reviewState'

/** Phase 5.0C.1: where the PO came from — original document and the data validated by a person. */
export function ImportTrace({ po, ws }: { po: PurchaseOrder; ws: Workspace }) {
  const { notify } = useToast()
  const imports = ws.poImports.filter((i) => i.poId === po.id).sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt))
  if (!imports.length) return null
  return (
    <Card aria-labelledby="po-import" className="px-[20px] pb-[20px] pt-[20px]">
      <SectionTitle id="po-import" size="sm" title="Origen documental" description={`Importada con revisión manual. ${LOCAL_FILES_NOTE}`} />
      <Link to={`${projectPath(po.projectId)}/comparacion-oc`} className="mt-[10px] inline-flex items-center gap-[6px] text-[13px] font-medium text-ink hover:underline">
        Ver comparación con la cotización →
      </Link>
      <ul className="mt-[12px] flex flex-col gap-[10px]">
        {imports.map((imp) => (
          <li key={imp.id} className="rounded-[14px] bg-surface-muted px-[12px] py-[10px] text-[13px]">
            <p className="font-medium">
              {imp.mode === 'update' ? 'Actualización' : 'Alta'} · {formatDateTime(imp.confirmedAt)} · {ws.staffById.get(imp.confirmedBy)?.name ?? imp.confirmedBy}
            </p>
            <p className="mt-[2px] truncate text-muted">{imp.source.fileName ?? 'Texto de email pegado'} · lectura local</p>
            {imp.source.attachmentId && (
              <Button
                size="sm"
                variant="outline"
                className="mt-[8px] h-[30px] px-[10px] text-[12.5px]"
                onClick={async () => {
                  if (!(await downloadLocalFile(imp.source.attachmentId!, imp.source.fileName ?? 'OC'))) notify({ title: 'Archivo no disponible', description: 'No está guardado en este navegador.' })
                }}
              >
                <Download aria-hidden className="size-[14px]" strokeWidth={1.9} />
                Documento original
              </Button>
            )}
            {imp.source.text && (
              <details className="mt-[6px]">
                <summary className="cursor-pointer text-ink-secondary">Texto original</summary>
                <pre className="mt-[6px] max-h-[200px] overflow-auto whitespace-pre-wrap rounded-[10px] bg-surface p-[8px] font-mono text-[11.5px]">{imp.source.text}</pre>
              </details>
            )}
            <details className="mt-[6px]">
              <summary className="cursor-pointer text-ink-secondary">Datos validados ({imp.fields.length}) y líneas ({imp.lines.filter((l) => l.included).length} incluidas)</summary>
              <ul className="mt-[6px] flex flex-col gap-[4px]">
                {imp.fields.map((f) => (
                  <li key={f.key} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-[2px]">
                    <span>
                      <span className="text-muted">{f.label}:</span> <span className="font-medium">{f.value ?? '—'}</span>
                      {f.edited && <span className="text-muted"> (detectado: {f.detected ?? '—'})</span>}
                    </span>
                    <StatusBadge meta={importStatusMeta[f.status]} />
                  </li>
                ))}
              </ul>
              <ul className="mt-[8px] flex flex-col gap-[4px] border-t border-line pt-[6px]">
                {imp.lines.map((l, i) => {
                  const s = l.serviceId ? ws.serviceById.get(l.serviceId) : undefined
                  return (
                    <li key={i} className={l.included ? '' : 'text-muted line-through'}>
                      <span className="font-mono text-[11.5px]">{l.raw}</span>
                      <span className="block text-[11.5px] text-muted">
                        {provenanceLabel(l.source)}
                        {l.included && s ? ` → ${getServiceType(s.typeId).label}` : l.included ? '' : ' · excluida'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </details>
            {imp.warnings.length > 0 && <p className="mt-[6px] text-[12px] text-warning">{imp.warnings.join(' · ')}</p>}
          </li>
        ))}
      </ul>
    </Card>
  )
}
