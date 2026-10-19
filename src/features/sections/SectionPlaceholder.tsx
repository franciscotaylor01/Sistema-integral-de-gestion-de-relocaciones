import { Construction } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { brand } from '@/config/brand'

/** Shell for modules anticipated in the architecture but scheduled for later phases. */
export function SectionPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="pt-[5px]">
      <PageHeader title={title} description="Este módulo forma parte de la hoja de ruta de SIGR y llegará en una próxima fase." />
      <Card className="mt-[34px] flex flex-col items-start gap-5 p-8">
        <span aria-hidden className="grid size-[44px] place-items-center rounded-full bg-surface-sunken text-ink-secondary">
          <Construction className="size-[19px]" strokeWidth={1.8} />
        </span>
        <div>
          <p className="text-[16px] font-medium">Próximamente</p>
          <p className="mt-[6px] max-w-[560px] text-[15px] leading-[1.5] text-ink-secondary">{description}</p>
        </div>
        <ButtonLink to="/">Volver al Dashboard</ButtonLink>
        <p className="text-[12.5px] text-subtle">
          {brand.productName} · {brand.productFullName}
        </p>
      </Card>
    </div>
  )
}
