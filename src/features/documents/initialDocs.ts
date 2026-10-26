import { brand } from '@/config/brand'
import type { StatusMeta } from '@/config/catalogs'
import type { InitialDocumentStage } from '@/domain/initialDocuments'
import type { EmailDraft } from '@/features/commercial/documents/emails'
import type { Workspace } from '@/hooks/useWorkspace'
import type { InitialDocument, Project } from '@/types/domain'

export const initialStageMeta: Record<InitialDocumentStage, StatusMeta> = {
  'pending-send': { label: 'Pendiente de enviar', tone: 'neutral' },
  sent: { label: 'Enviado', tone: 'info' },
  awaiting: { label: 'Pendiente de recepción', tone: 'warning' },
  received: { label: 'Recibido', tone: 'success' },
  correction: { label: 'Requiere corrección', tone: 'danger' },
}

/** Email asking the beneficiary to complete the attached forms (prepared only; never sent by SIGR). */
export function initialDocsEmail(ws: Workspace, project: Project, docs: InitialDocument[], senderName?: string): EmailDraft {
  const person = ws.personById.get(project.beneficiaryId)
  const client = ws.clientById.get(project.clientId)
  const first = person?.name.trim().split(/\s+/)[0]
  const lines = docs.map((d) => {
    const t = ws.documentTemplates.find((x) => x.id === d.templateId)
    return `• ${d.name}${t?.description ? ` — ${t.description}` : ''}`
  })
  const body = [
    first ? `Hola ${first},` : 'Hola,',
    '',
    `Como parte de tu proceso de relocación${client ? ` con ${client.name}` : ''} (${project.origin.city} → ${project.destination.city}), te pedimos completar ${docs.length === 1 ? 'el siguiente formulario adjunto' : 'los siguientes formularios adjuntos'}:`,
    ...lines,
    '',
    'Por favor, completalos y respondé este email adjuntando los archivos. Si tenés dudas sobre algún dato, escribinos.',
    '',
    'Saludos,',
    senderName ?? '',
    brand.clientName,
  ]
  return { subject: `Documentación inicial · ${project.code}${person ? ` · ${person.name}` : ''}`, body: body.join('\n').replace(/\n{3,}/g, '\n\n').trim(), to: person?.email }
}
