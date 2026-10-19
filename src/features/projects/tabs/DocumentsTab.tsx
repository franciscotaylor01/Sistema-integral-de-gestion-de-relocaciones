import { FileStack, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useToast } from '@/components/feedback/useToast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { SearchField } from '@/components/ui/SearchField'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { documentKindMeta, documentStatusMeta, serviceTypeMeta } from '@/config/catalogs'
import { cn } from '@/lib/cn'
import { daysUntil, formatDate, formatRelativeDays } from '@/lib/dates'
import { matches } from '@/lib/search'
import type { DocumentStatus } from '@/types/domain'
import type { ProjectContext } from '../projectContext'

export function DocumentsTab({ ctx }: { ctx: ProjectContext }) {
  const { notify } = useToast()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const serviceById = useMemo(() => new Map(ctx.project.services.map((s) => [s.id, s])), [ctx.project.services])

  const rows = ctx.documents.filter(
    (d) => (!status || d.status === status) && matches(query, d.name, d.holder, documentKindMeta[d.kind].label),
  )

  return (
    <Card aria-labelledby="docs-title" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="docs-title"
        title="Documentación"
        description="Pasaportes, visas, permisos y contratos asociados al proyecto"
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => notify({ title: 'Carga de documentos en preparación', description: 'El almacenamiento de archivos se habilitará con el backend.' })}
          >
            <Upload aria-hidden className="size-[15px]" strokeWidth={2} />
            Subir documento
          </Button>
        }
      />
      <div className="mt-[18px] flex flex-wrap items-center gap-[10px]">
        <SearchField value={query} onChange={setQuery} label="Buscar documentos" placeholder="Documento o titular" />
        <FilterSelect
          size="sm"
          label="Estado"
          value={status}
          onChange={setStatus}
          options={(Object.keys(documentStatusMeta) as DocumentStatus[]).map((s) => ({ value: s, label: documentStatusMeta[s].label }))}
        />
      </div>
      <DataTable
        className="mt-[18px]"
        caption="Documentos del proyecto"
        rows={rows}
        getRowId={(d) => d.id}
        minWidth={860}
        columns={[
          {
            id: 'name',
            header: 'Documento',
            width: '28%',
            cell: (d) => {
              const Icon = documentKindMeta[d.kind].icon
              return (
                <span className="flex min-w-0 items-center gap-[10px]">
                  <span aria-hidden className="grid size-[28px] shrink-0 place-items-center rounded-[8px] bg-surface-sunken text-ink-secondary">
                    <Icon className="size-[14px]" strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{d.name}</span>
                    <span className="block text-[12px] text-muted">{documentKindMeta[d.kind].label}</span>
                  </span>
                </span>
              )
            },
          },
          { id: 'holder', header: 'Titular', width: '17%', cell: (d) => <span className="block truncate">{d.holder}</span> },
          {
            id: 'service',
            header: 'Servicio',
            width: '15%',
            cell: (d) => {
              const s = d.serviceId ? serviceById.get(d.serviceId) : undefined
              return <span className="block truncate text-ink-secondary">{s ? serviceTypeMeta[s.type].label : 'General'}</span>
            },
          },
          { id: 'uploaded', header: 'Cargado', width: '12%', className: 'tabular', cell: (d) => (d.uploadedAt ? formatDate(d.uploadedAt) : '—') },
          {
            id: 'expires',
            header: 'Vencimiento',
            width: '15%',
            cell: (d) =>
              d.expiresAt ? (
                <span className="block">
                  <span className="tabular block">{formatDate(d.expiresAt)}</span>
                  <span className={cn('block text-[12px]', daysUntil(d.expiresAt) < 0 ? 'text-danger' : daysUntil(d.expiresAt) <= 45 ? 'text-warning' : 'text-muted')}>
                    {formatRelativeDays(d.expiresAt)}
                  </span>
                </span>
              ) : (
                <span className="text-muted">—</span>
              ),
          },
          { id: 'status', header: 'Estado', width: '13%', cell: (d) => <StatusBadge meta={documentStatusMeta[d.status]} /> },
        ]}
        empty={
          <EmptyState
            icon={FileStack}
            title={ctx.documents.length ? 'Sin coincidencias' : 'Sin documentos'}
            description={ctx.documents.length ? 'Probá con otra búsqueda o estado.' : 'Todavía no se cargó documentación.'}
          />
        }
      />
    </Card>
  )
}
