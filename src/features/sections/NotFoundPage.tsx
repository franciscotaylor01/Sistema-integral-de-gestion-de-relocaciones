import { Compass } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'

export function NotFoundPage({ title = 'Página no encontrada', description }: { title?: string; description?: string }) {
  return (
    <div className="pt-[5px]">
      <PageHeader title={title} description={description ?? 'La dirección no existe o fue movida.'} />
      <Card className="mt-[34px]">
        <EmptyState
          icon={Compass}
          className="py-14"
          title="No encontramos lo que buscabas"
          description="Revisá el enlace o volvé al inicio para seguir navegando."
          action={<ButtonLink to="/">Ir al Dashboard</ButtonLink>}
        />
      </Card>
    </div>
  )
}
