import { Link } from 'react-router'
import { ServiceChipStack } from '@/components/ui/ServiceChip'
import { Flag } from '@/components/ui/Flag'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { Column } from '@/components/ui/DataTable'
import { countryNames, financialStatusMeta, operationalStatusMeta } from '@/config/catalogs'
import { projectPath } from '@/config/navigation'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatDate } from '@/lib/dates'
import type { Project } from '@/types/domain'

export type ProjectColumnId =
  | 'code'
  | 'client'
  | 'assignee'
  | 'origin'
  | 'destination'
  | 'route'
  | 'services'
  | 'owner'
  | 'operational'
  | 'financial'
  | 'start'

/** Column catalogue for project tables; screens pick the subset they need. */
export function projectColumns(ws: Workspace, ids: ProjectColumnId[]): Column<Project>[] {
  const all: Record<ProjectColumnId, Column<Project>> = {
    code: {
      id: 'code',
      header: 'Proyecto',
      width: '138px',
      className: 'font-medium',
      cell: (p) => (
        <Link to={projectPath(p.id)} className="rounded-[4px] underline-offset-4 hover:underline">
          {p.code}
        </Link>
      ),
    },
    client: {
      id: 'client',
      header: 'Cliente',
      width: '15%',
      cell: (p) => <span className="block truncate">{ws.clientById.get(p.clientId)?.name}</span>,
    },
    assignee: {
      id: 'assignee',
      header: 'Beneficiario',
      width: '15%',
      cell: (p) => {
        const a = ws.assigneeById.get(p.assigneeId)
        return (
          <span className="block min-w-0">
            <span className="block truncate font-medium">{a?.name}</span>
            {a && a.family.length > 0 && <span className="block text-[12px] text-muted">+{a.family.length} familiares</span>}
          </span>
        )
      },
    },
    origin: {
      id: 'origin',
      header: 'Origen',
      width: '11%',
      cell: (p) => (
        <span className="flex min-w-0 items-center gap-[8px]" title={`${p.origin.city}, ${countryNames[p.origin.country]}`}>
          <Flag country={p.origin.country} className="size-[18px]" />
          <span className="truncate">{countryNames[p.origin.country]}</span>
        </span>
      ),
    },
    destination: {
      id: 'destination',
      header: 'Destino',
      width: '11%',
      cell: (p) => (
        <span className="flex min-w-0 items-center gap-[8px]" title={`${p.destination.city}, ${countryNames[p.destination.country]}`}>
          <Flag country={p.destination.country} className="size-[18px]" />
          <span className="truncate">{countryNames[p.destination.country]}</span>
        </span>
      ),
    },
    route: {
      id: 'route',
      header: 'Ruta',
      width: '17%',
      cell: (p) => (
        <span className="flex min-w-0 items-center gap-[6px]" title={`${p.origin.city} → ${p.destination.city}`}>
          <Flag country={p.origin.country} className="size-[18px]" />
          <span aria-hidden className="text-subtle">→</span>
          <Flag country={p.destination.country} className="size-[18px]" />
          <span className="truncate">{p.destination.city}</span>
        </span>
      ),
    },
    services: {
      id: 'services',
      header: 'Servicios',
      width: '112px',
      cell: (p) => <ServiceChipStack types={p.services.map((s) => s.type)} />,
    },
    owner: {
      id: 'owner',
      header: 'Responsable',
      width: '12%',
      cell: (p) => <span className="block truncate">{ws.staffById.get(p.ownerId)?.name}</span>,
    },
    operational: {
      id: 'operational',
      header: 'Estado',
      width: '116px',
      cell: (p) => <StatusBadge meta={operationalStatusMeta[p.operationalStatus]} />,
    },
    financial: {
      id: 'financial',
      header: 'Finanzas',
      width: '128px',
      cell: (p) => <StatusBadge meta={financialStatusMeta[p.financialStatus]} />,
    },
    start: {
      id: 'start',
      header: 'Inicio',
      width: '112px',
      className: 'tabular',
      cell: (p) => formatDate(p.startDate),
    },
  }
  return ids.map((id) => all[id])
}
