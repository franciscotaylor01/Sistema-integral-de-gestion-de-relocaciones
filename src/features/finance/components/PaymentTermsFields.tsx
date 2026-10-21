import { Field, SelectInput, TextInput } from '@/components/ui/form'
import type { PaymentTerms } from '@/types/domain'

/** Optional payment condition of a PO: days counted from the invoice issue date, calendar or business. */
export function PaymentTermsFields({ value, onChange, error }: { value?: PaymentTerms; onChange: (t: PaymentTerms | undefined) => void; error?: string }) {
  return (
    <div className="grid gap-[12px] sm:grid-cols-2">
      <Field label="Condición de pago de la OC (días)" error={error} hint="Desde la fecha de emisión de la factura. Vacío = usa la condición del cliente.">
        {(p) => (
          <TextInput
            {...p}
            type="number"
            min={0}
            max={365}
            value={value?.days ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : { days: Number(e.target.value), dayType: value?.dayType ?? 'calendar' })}
          />
        )}
      </Field>
      <Field label="Tipo de días" hint="Hábiles: excluye sábados y domingos (feriados no configurados).">
        {(p) => (
          <SelectInput {...p} value={value?.dayType ?? 'calendar'} disabled={!value} onChange={(e) => value && onChange({ ...value, dayType: e.target.value as PaymentTerms['dayType'] })}>
            <option value="calendar">Corridos</option>
            <option value="business">Hábiles</option>
          </SelectInput>
        )}
      </Field>
    </div>
  )
}
