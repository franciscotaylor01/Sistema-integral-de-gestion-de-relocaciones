import type { MouseEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { cn } from '@/lib/cn'

export interface Column<T> {
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  /** Extra classes for the body cell (e.g. 'tabular font-medium'). */
  className?: string
  headerClassName?: string
  /** Column width, e.g. '14%' or '120px'. */
  width?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  getRowId: (row: T) => string
  caption: string
  /** Makes the whole row clickable. Keyboard users reach it via a link inside the row. */
  rowHref?: (row: T) => string
  minWidth?: number
  empty?: ReactNode
  dense?: boolean
  className?: string
}

const th = 'h-[49px] px-[8px] text-left text-[14.5px] font-normal text-muted whitespace-nowrap first:pl-[20px] last:pr-[16px]'

/**
 * The Vertix "Recent Activities" table, generalised: muted panel, white
 * row block with hairline separators, rounded outer corners, hover tint.
 */
export function DataTable<T>({ columns, rows, getRowId, caption, rowHref, minWidth = 760, empty, dense, className }: DataTableProps<T>) {
  const navigate = useNavigate()

  const onRowClick = (row: T) => (e: MouseEvent<HTMLTableRowElement>) => {
    if (!rowHref) return
    const target = e.target as HTMLElement
    if (target.closest('a,button,input,label')) return
    if (window.getSelection()?.toString()) return
    navigate(rowHref(row))
  }

  const td = cn(
    'bg-surface px-[8px] text-[15px] whitespace-nowrap transition-colors duration-200 ease-soft group-hover:bg-canvas first:pl-[20px] last:pr-[16px]',
    dense ? 'h-[48px]' : 'h-[56px]',
  )

  return (
    <div className={cn('relative overflow-x-auto rounded-panel bg-surface-muted px-[2px] pb-[2px]', className)}>
      <table className="w-full table-fixed border-separate border-spacing-0" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {columns.map((c) => (
            <col key={c.id} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.id} scope="col" className={cn(th, c.headerClassName)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="rounded-[14px] bg-surface">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const first = i === 0
              const last = i === rows.length - 1
              return (
                <tr key={getRowId(row)} onClick={onRowClick(row)} className={cn('group', rowHref && 'cursor-pointer')}>
                  {columns.map((c, ci) => (
                    <td
                      key={c.id}
                      className={cn(
                        td,
                        c.className,
                        !last && 'border-b border-line',
                        first && ci === 0 && 'rounded-tl-[14px]',
                        first && ci === columns.length - 1 && 'rounded-tr-[14px]',
                        last && ci === 0 && 'rounded-bl-[14px]',
                        last && ci === columns.length - 1 && 'rounded-br-[14px]',
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
