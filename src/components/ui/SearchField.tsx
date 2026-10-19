import { Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  className?: string
}

/** Vertix table search pill, with a clear button. */
export function SearchField({ value, onChange, label, placeholder = 'Buscar', className }: SearchFieldProps) {
  return (
    <label
      className={cn(
        'flex h-[46px] w-full items-center gap-[10px] rounded-full border border-line bg-surface px-[16px] shadow-pill transition-[border-color,box-shadow] duration-300 ease-soft focus-within:border-line-strong focus-within:shadow-card-hover sm:w-[280px]',
        className,
      )}
    >
      <Search aria-hidden className="size-[18px] shrink-0 text-ink-secondary" strokeWidth={1.9} />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-secondary [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => onChange('')}
          className="grid size-[24px] place-items-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <X className="size-[14px]" strokeWidth={2.2} />
        </button>
      )}
    </label>
  )
}
