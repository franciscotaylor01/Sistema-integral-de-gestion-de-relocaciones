import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormError } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { DEMO_TODAY } from '@/config/brand'
import { getServiceType } from '@/config/serviceCatalog'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import type { Project, ProjectService } from '@/types/domain'
import { ServiceItemsEditor } from './ServiceItemsEditor'

/** Edit the contracted sub-services of a project service; contracted prices stay frozen. */
export function ServiceItemsModal({ service, project, ws, onClose }: { service?: ProjectService; project: Project; ws: Workspace; onClose: () => void }) {
  return (
    <Modal open={Boolean(service)} onClose={onClose} title={service ? `Subservicios de ${getServiceType(service.typeId).label}` : ''} description="Los ítems ya contratados conservan su precio histórico; los nuevos toman el precio vigente de la OC o el tarifario." size="lg">
      {service && <Form service={service} project={project} ws={ws} onClose={onClose} />}
    </Modal>
  )
}

function Form({ service, project, ws, onClose }: { service: ProjectService; project: Project; ws: Workspace; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [items, setItems] = useState(() => (service.items ?? []).map((i) => ({ catalogItemId: i.catalogItemId, quantity: i.quantity })))
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(() => actions.updateServiceItems(service.id, items), { title: 'Subservicios actualizados' })
        if (ok) onClose()
      }}
    >
      <FormError message={formError ?? errors.items} />
      <ServiceItemsEditor ws={ws} project={project} typeId={service.typeId} items={items} onChange={setItems} errors={errors} frozen={service.items} date={DEMO_TODAY} />
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" type="submit" disabled={busy}>
          Guardar subservicios
        </Button>
      </div>
    </form>
  )
}
