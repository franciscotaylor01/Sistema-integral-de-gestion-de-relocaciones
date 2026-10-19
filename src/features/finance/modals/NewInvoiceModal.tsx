import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Field, SelectInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { DEMO_TODAY } from '@/config/brand'
import { invoicePath } from '@/config/navigation'
import { randomId } from '@/domain/context'
import { addDays } from '@/domain/dates'
import { suggestInvoiceLines, type InvoiceInput } from '@/domain/finance/invoices'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import type { Project } from '@/types/domain'
import { InvoiceForm } from './InvoiceForm'

interface Props {
  open: boolean
  onClose: () => void
  workspace: Workspace
  /** Fixed project; otherwise the user picks one first. */
  project?: Project
}

/** New draft invoice, prefilled with everything still billable for the project. */
export function NewInvoiceModal(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} title="Nueva factura" description="Se guarda como borrador; luego podés emitirla." size="lg">
      {props.open && <NewInvoice {...props} />}
    </Modal>
  )
}

function initialInput(ws: Workspace, project: Project): InvoiceInput {
  const client = ws.clientById.get(project.clientId)
  return {
    projectId: project.id,
    issuerId: ws.legalEntities[0]?.id ?? '',
    kind: client?.headquarters.country === 'AR' ? 'A' : 'E',
    issueDate: DEMO_TODAY,
    dueDate: addDays(DEMO_TODAY, client?.paymentTermsDays ?? 30),
    currency: project.currency,
    lines: suggestInvoiceLines(ws.dataset, project.id, project.currency, DEMO_TODAY),
    taxes: [],
    notes: '',
    externalRef: '',
  }
}

function NewInvoice({ onClose, workspace: ws, project: fixed }: Props) {
  const actions = useActions()
  const navigate = useNavigate()
  const { run, busy, errors, formError } = useCommand()
  const [projectId, setProjectId] = useState(fixed?.id ?? '')
  const project = fixed ?? ws.projectById.get(projectId)
  const [input, setInput] = useState<InvoiceInput | undefined>(() => (fixed ? initialInput(ws, fixed) : undefined))
  const [requestId] = useState(() => randomId('req'))
  const projects = useMemo(() => [...ws.projects].sort((a, b) => b.code.localeCompare(a.code)), [ws.projects])

  const save = async () => {
    if (!input) return
    const r = await run(() => actions.createInvoiceDraft(input, requestId), { title: 'Borrador de factura creado' })
    if (r) {
      onClose()
      navigate(invoicePath(r.invoiceId))
    }
  }

  return (
    <div className="flex flex-col gap-[16px]">
      {!fixed && (
        <Field label="Proyecto" required>
          {(p) => (
            <SelectInput
              {...p}
              data-autofocus
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value)
                const pr = ws.projectById.get(e.target.value)
                setInput(pr ? initialInput(ws, pr) : undefined)
              }}
            >
              <option value="">Elegí un proyecto</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {ws.clientById.get(p.clientId)?.name} · {ws.personById.get(p.beneficiaryId)?.name}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
      )}
      {project && input && (
        <>
          {input.lines.length === 0 && (
            <p className="rounded-[14px] bg-warning-soft px-[14px] py-[11px] text-[13.5px] text-warning">
              No hay montos facturables pendientes para este proyecto (revisá aprobaciones, OC e hitos en Finanzas del proyecto). Podés cargar un reintegro de gastos.
            </p>
          )}
          <InvoiceForm input={input} onChange={setInput} project={project} workspace={ws} errors={errors} formError={formError} />
        </>
      )}
      <div className="sticky bottom-0 -mx-[22px] -mb-[20px] flex flex-wrap justify-end gap-[10px] border-t border-line bg-surface px-[22px] py-[14px]">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" onClick={save} disabled={busy || !input}>
          {busy ? 'Guardando…' : 'Guardar borrador'}
        </Button>
      </div>
    </div>
  )
}
