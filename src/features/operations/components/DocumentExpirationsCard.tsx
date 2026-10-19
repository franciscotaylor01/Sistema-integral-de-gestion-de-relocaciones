import { FileCheck2 } from 'lucide-react'
import { Link } from 'react-router'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { documentKindMeta, documentStatusMeta } from '@/config/catalogs'
import { projectPath } from '@/config/navigation'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { daysUntil, formatDate, formatRelativeDays } from '@/lib/dates'

const HORIZON_DAYS = 90

export function DocumentExpirationsCard({ workspace }: { workspace: Workspace }) {
  const docs = workspace.documents
    .filter((d) => d.expiresAt && daysUntil(d.expiresAt) <= HORIZON_DAYS)
    .sort((a, b) => (a.expiresAt ?? '').localeCompare(b.expiresAt ?? ''))

  return (
    <Card id="vencimientos" aria-labelledby="doc-exp-title" className="h-full scroll-mt-6 px-[20px] pb-[18px] pt-[20px]">
      <SectionTitle id="doc-exp-title" size="sm" title="Vencimientos de documentos" description={`Vencidos y próximos ${HORIZON_DAYS} días`} />
      {docs.length === 0 ? (
        <EmptyState icon={FileCheck2} title="Sin vencimientos próximos" />
      ) : (
        <ul className="mt-[14px] flex flex-col gap-[8px]">
          {docs.map((d) => {
            const days = daysUntil(d.expiresAt as string)
            const Icon = documentKindMeta[d.kind].icon
            return (
              <li key={d.id}>
                <Link
                  to={`${projectPath(d.projectId)}?tab=documentos`}
                  className="flex items-center gap-[12px] rounded-[14px] bg-surface-muted px-[12px] py-[10px] transition-[background-color,transform] duration-200 ease-soft hover:bg-surface-sunken active:scale-[0.99]"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-[32px] shrink-0 place-items-center rounded-full',
                      days < 0 ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
                    )}
                  >
                    <Icon className="size-[15px]" strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">
                      {d.name} · {d.holder}
                    </span>
                    <span className="block truncate text-[12px] text-muted">
                      {workspace.projectById.get(d.projectId)?.code} · {formatDate(d.expiresAt as string)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-[2px]">
                    <StatusBadge meta={documentStatusMeta[days < 0 ? 'expired' : 'expiring']} className="text-[12px]" />
                    <span className={cn('text-[11.5px]', days < 0 ? 'text-danger' : 'text-muted')}>{formatRelativeDays(d.expiresAt as string)}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
