import { ChevronDown } from 'lucide-react'
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/*
 * Form controls in the SIGR language: soft bordered surfaces with the same
 * radius rhythm as panels, focus ring from the global :focus-visible accent.
 */

const control =
  'w-full rounded-[14px] border bg-surface px-[14px] text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-200 ease-soft placeholder:text-subtle focus:border-line-strong focus:shadow-pill disabled:opacity-60'

interface FieldProps {
  label: string
  error?: string
  hint?: ReactNode
  required?: boolean
  className?: string
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; 'aria-required'?: boolean }) => ReactNode
}

export function Field({ label, error, hint, required, className, children }: FieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="mb-[6px] block text-[13.5px] font-medium text-ink-secondary">
        {label}
        {required && (
          <span aria-hidden className="ml-[3px] text-accent">
            *
          </span>
        )}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, 'aria-required': required || undefined })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-[6px] text-[12.5px] font-medium text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-[6px] text-[12.5px] text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

const border = (invalid?: boolean) => (invalid ? 'border-danger' : 'border-line')

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(control, 'h-[46px]', border(Boolean(props['aria-invalid'])), className)} />
}

export function DateInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="date" {...props} className={cn(control, 'tabular h-[46px]', border(Boolean(props['aria-invalid'])), className)} />
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cn(control, 'min-h-[92px] resize-y py-[11px] leading-[1.45]', border(Boolean(props['aria-invalid'])), className)} />
}

export function SelectInput({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select {...props} className={cn(control, 'h-[46px] cursor-pointer appearance-none pr-[38px]', border(Boolean(props['aria-invalid'])), className)}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-[14px] top-1/2 size-[16px] -translate-y-1/2 text-muted" strokeWidth={2} />
    </span>
  )
}

/** Accessible on/off switch styled like the theme toggle. */
export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-[14px] bg-surface-muted px-[14px] py-[11px] text-left transition-colors hover:bg-surface-sunken"
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-medium">{label}</span>
        {description && <span className="block text-[12.5px] text-muted">{description}</span>}
      </span>
      <span className={cn('relative h-[24px] w-[42px] shrink-0 rounded-full transition-colors duration-200', checked ? 'bg-contrast' : 'bg-line-strong')}>
        <span
          className={cn(
            'absolute top-[3px] size-[18px] rounded-full bg-surface shadow-pill transition-[left] duration-200 ease-soft',
            checked ? 'left-[21px]' : 'left-[3px]',
          )}
        />
      </span>
    </button>
  )
}

/** Banner for form-level errors. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-[14px] bg-danger-soft px-[14px] py-[11px] text-[13.5px] font-medium text-danger">
      {message}
    </div>
  )
}
