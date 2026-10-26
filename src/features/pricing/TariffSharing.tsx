import { Download, Mail, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { DEMO_TODAY } from '@/config/brand'
import { tariffSheet } from '@/domain/commercial/documents'
import { EmailModal } from '@/features/commercial/documents/EmailModal'
import { downloadFile, tariffEmail } from '@/features/commercial/documents/emails'
import { dmy } from '@/features/commercial/documents/layout'
import { tariffPdf } from '@/features/commercial/documents/tariffPdf'
import { useActions } from '@/hooks/useActions'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatDate } from '@/lib/dates'
import type { Client } from '@/types/domain'

/** Phase 5.0B: export the tariff in force (approved prices only when required) and record its sending. */
export function TariffSharing({ workspace: ws, client }: { workspace: Workspace; client: Client }) {
  const actions = useActions()
  const user = useCurrentUser()
  const [emailing, setEmailing] = useState(false)
  const sheet = tariffSheet(ws.dataset, client.id, DEMO_TODAY)
  const rows = sheet.groups.reduce((n, g) => n + g.rows.length, 0)
  const contact = client.contacts.find((c) => c.primary) ?? client.contacts[0]
  const contactText = contact ? [contact.name, contact.role, contact.email].filter(Boolean).join(' · ') : undefined
  const makePdf = () => tariffPdf(sheet, dmy(DEMO_TODAY), contactText)
  const history = ws.communications.filter((c) => c.kind === 'tariff' && c.clientId === client.id).sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))

  return (
    <Card aria-labelledby="tshare-title" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="tshare-title"
        title="Enviar tarifario"
        description={`Tarifario vigente al ${formatDate(DEMO_TODAY)}: ${rows} ${rows === 1 ? 'precio' : 'precios'} en ${sheet.groups.length} servicios. ${sheet.requiresApproval ? 'El cliente exige aprobación: solo se incluyen precios aprobados.' : 'Se incluyen los precios vigentes.'} Las versiones pendientes nunca se incluyen.`}
        action={
          <div className="flex flex-wrap gap-[8px]">
            <Button size="sm" variant="outline" disabled={!rows} onClick={() => downloadFile(makePdf(), sheet.fileName)}>
              <Download aria-hidden className="size-[15px]" strokeWidth={1.9} />
              Exportar PDF
            </Button>
            <Button size="sm" disabled={!rows} onClick={() => setEmailing(true)}>
              <Mail aria-hidden className="size-[15px]" strokeWidth={1.9} />
              Preparar email
            </Button>
          </div>
        }
      />
      {(sheet.excluded > 0 || sheet.conflicts.length > 0) && (
        <div className="mt-[12px] flex flex-col gap-[4px] rounded-[14px] bg-warning-soft px-[12px] py-[10px] text-[13px] text-warning">
          {sheet.excluded > 0 && (
            <span className="flex items-center gap-[6px]">
              <TriangleAlert aria-hidden className="size-[14px] shrink-0" strokeWidth={2} />
              {sheet.excluded} {sheet.excluded === 1 ? 'precio queda' : 'precios quedan'} fuera por estar pendientes de aprobación.
            </span>
          )}
          {sheet.conflicts.map((c) => (
            <span key={c.label} className="flex items-center gap-[6px]">
              <TriangleAlert aria-hidden className="size-[14px] shrink-0" strokeWidth={2} />
              {c.label}: {c.count} reglas superpuestas, no se incluyen hasta resolverlas en el listado detallado.
            </span>
          ))}
        </div>
      )}
      <div className="mt-[14px]">
        <p className="text-[13px] font-medium text-muted">Envíos registrados</p>
        {history.length === 0 ? (
          <p className="mt-[4px] text-[13px] text-subtle">Todavía no se registró ningún envío del tarifario.</p>
        ) : (
          <ul className="mt-[6px] flex flex-col gap-[6px]" aria-label="Historial de envíos del tarifario">
            {history.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[14px] bg-surface-muted px-[12px] py-[9px] text-[13px]">
                <span className="min-w-0">
                  <span className="block font-medium">
                    Enviado el {formatDate(c.sentAt)}
                    {c.reference ? ` · ${c.reference}` : ''}
                  </span>
                  <span className="block truncate text-muted">{c.recipients ? `A ${c.recipients}` : c.subject}</span>
                </span>
                <span className="text-muted">{c.tariffSnapshot?.length ?? 0} precios enviados</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <EmailModal
        open={emailing}
        onClose={() => setEmailing(false)}
        mode="email"
        title={`Tarifario para ${client.name}`}
        draft={tariffEmail(sheet, contact, user?.name)}
        docLabel={sheet.fileName}
        downloads={[{ label: 'Descargar PDF', onDownload: () => downloadFile(makePdf(), sheet.fileName) }]}
        onRegister={(input, requestId) => actions.registerTariffSent(client.id, input, requestId)}
      />
    </Card>
  )
}
