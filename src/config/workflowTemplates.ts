/*
 * Workflow templates — configurable per service type and per procedure type.
 * Every stage may define default tasks; they are created automatically when
 * the stage becomes current. `weight` spreads due dates across the period.
 *
 * To customise a workflow, edit (or add) a template here and reference it from
 * the service or procedure catalog. Later this moves to a database table.
 */

export interface StageTemplate {
  key: string
  label: string
  weight?: number
  tasks?: string[]
}

export interface WorkflowTemplate {
  id: string
  name: string
  stages: StageTemplate[]
}

const t = (id: string, name: string, stages: StageTemplate[]): WorkflowTemplate => ({ id, name, stages })

export const workflowTemplates: WorkflowTemplate[] = [
  t('wf-immigration', 'Migraciones', [
    { key: 'requirements', label: 'Relevamiento de requisitos', tasks: ['Relevar requisitos migratorios del país de destino', 'Enviar checklist de documentación al beneficiario'] },
    { key: 'documents', label: 'Documentación', weight: 2, tasks: ['Recibir y revisar documentación personal'] },
    { key: 'legalization', label: 'Legalizaciones', tasks: ['Coordinar apostillas y traducciones'] },
    { key: 'filing', label: 'Presentación', tasks: ['Presentar el expediente ante la autoridad migratoria'] },
    { key: 'resolution', label: 'Resolución', weight: 2, tasks: ['Hacer seguimiento del expediente'] },
    { key: 'issued', label: 'Residencia emitida', tasks: ['Entregar constancia de residencia al beneficiario'] },
  ]),
  t('wf-housing', 'Housing', [
    { key: 'brief', label: 'Brief de necesidades', tasks: ['Entrevista de necesidades de vivienda'] },
    { key: 'shortlist', label: 'Preselección', tasks: ['Enviar preselección de propiedades'] },
    { key: 'visits', label: 'Visitas', tasks: ['Coordinar agenda de visitas'] },
    { key: 'negotiation', label: 'Negociación', tasks: ['Negociar condiciones con el propietario'] },
    { key: 'contract', label: 'Firma de contrato', tasks: ['Revisar contrato y coordinar firma'] },
    { key: 'handover', label: 'Entrega de llaves', tasks: ['Realizar inventario de entrega'] },
  ]),
  t('wf-schooling', 'Schooling', [
    { key: 'survey', label: 'Relevamiento', tasks: ['Relevar perfil educativo de los hijos'] },
    { key: 'visits', label: 'Visitas a colegios', tasks: ['Agendar visitas a colegios'] },
    { key: 'application', label: 'Aplicación', tasks: ['Enviar aplicaciones a colegios'] },
    { key: 'admission', label: 'Admisión', tasks: ['Seguir entrevistas y exámenes de admisión'] },
    { key: 'enrolment', label: 'Inscripción', tasks: ['Confirmar inscripción y vacante'] },
  ]),
  t('wf-moving', 'Mudanzas', [
    { key: 'quote', label: 'Cotización', tasks: ['Solicitar cotizaciones a proveedores de mudanza'] },
    { key: 'inventory', label: 'Inventario', tasks: ['Coordinar survey de inventario'] },
    { key: 'packing', label: 'Embalaje', tasks: ['Confirmar fecha de embalaje'] },
    { key: 'transit', label: 'Tránsito', weight: 2, tasks: ['Seguir el embarque'] },
    { key: 'customs', label: 'Aduana', tasks: ['Gestionar despacho aduanero'] },
    { key: 'delivery', label: 'Entrega', tasks: ['Coordinar entrega en destino'] },
  ]),
  t('wf-orientation', 'Orientación', [
    { key: 'agenda', label: 'Agenda', tasks: ['Armar agenda de orientación'] },
    { key: 'tour', label: 'Tour de ciudad' },
    { key: 'local', label: 'Trámites locales' },
    { key: 'close', label: 'Cierre' },
  ]),
  t('wf-settling-in', 'Instalación', [
    { key: 'utilities', label: 'Servicios del hogar', tasks: ['Contratar servicios del hogar'] },
    { key: 'bank', label: 'Cuenta bancaria', tasks: ['Acompañar apertura de cuenta bancaria'] },
    { key: 'registration', label: 'Registro local' },
    { key: 'close', label: 'Cierre' },
  ]),
  t('wf-tax-advisory', 'Asesoría fiscal', [
    { key: 'diagnosis', label: 'Diagnóstico', tasks: ['Reunión de diagnóstico fiscal'] },
    { key: 'planning', label: 'Planificación' },
    { key: 'filings', label: 'Presentaciones' },
    { key: 'close', label: 'Cierre' },
  ]),
  t('wf-departure', 'Salida / repatriación', [
    { key: 'lease-end', label: 'Fin de contrato', tasks: ['Notificar fin de contrato de alquiler'] },
    { key: 'inspection', label: 'Inspección' },
    { key: 'deregistration', label: 'Bajas de servicios' },
    { key: 'close', label: 'Cierre' },
  ]),
  t('wf-dni', 'DNI', [
    { key: 'appointment', label: 'Turno RENAPER', tasks: ['Solicitar turno en RENAPER'] },
    { key: 'biometrics', label: 'Toma de datos', tasks: ['Acompañar toma de datos biométricos'] },
    { key: 'tracking', label: 'Seguimiento', weight: 2, tasks: ['Seguir el estado del trámite de DNI'] },
    { key: 'delivery', label: 'Entrega del DNI' },
  ]),
  t('wf-tie', 'TIE', [
    { key: 'appointment', label: 'Cita previa', tasks: ['Solicitar cita previa de huellas'] },
    { key: 'fingerprints', label: 'Toma de huellas', tasks: ['Preparar formulario EX-17 y tasa 790'] },
    { key: 'resolution', label: 'Resolución', weight: 2 },
    { key: 'pickup', label: 'Recogida de la TIE', tasks: ['Coordinar recogida de la tarjeta'] },
  ]),
  t('wf-visa', 'Visa de trabajo', [
    { key: 'requirements', label: 'Requisitos', tasks: ['Confirmar tipo de visa y requisitos'] },
    { key: 'documents', label: 'Documentación', tasks: ['Reunir documentación de respaldo'] },
    { key: 'consulate', label: 'Presentación consular', tasks: ['Agendar turno consular'] },
    { key: 'resolution', label: 'Resolución', weight: 2 },
  ]),
  t('wf-residence', 'Residencia', [
    { key: 'requirements', label: 'Requisitos', tasks: ['Relevar requisitos de residencia'] },
    { key: 'documents', label: 'Documentación', tasks: ['Reunir documentación apostillada'] },
    { key: 'appointment', label: 'Turno', tasks: ['Solicitar turno migratorio'] },
    { key: 'filing', label: 'Presentación' },
    { key: 'resolution', label: 'Resolución', weight: 2, tasks: ['Seguir la resolución del expediente'] },
    { key: 'issued', label: 'Residencia otorgada' },
  ]),
  t('wf-intercultural', 'Talleres interculturales', [
    { key: 'survey', label: 'Relevamiento del grupo', tasks: ['Relevar perfil del grupo participante'] },
    { key: 'planning', label: 'Planificación', tasks: ['Confirmar facilitador y agenda'] },
    { key: 'sessions', label: 'Sesiones', weight: 2 },
    { key: 'evaluation', label: 'Evaluación', tasks: ['Enviar encuesta de evaluación'] },
  ]),
  t('wf-dual-career', 'Dual career', [
    { key: 'intake', label: 'Entrevista inicial', tasks: ['Entrevista inicial con el/la acompañante'] },
    { key: 'plan', label: 'Plan de carrera' },
    { key: 'search', label: 'Búsqueda y networking', weight: 3 },
    { key: 'close', label: 'Cierre' },
  ]),
  t('wf-driving-license', 'Licencia de conducir', [
    { key: 'requirements', label: 'Requisitos', tasks: ['Verificar canje o examen requerido'] },
    { key: 'appointment', label: 'Turno', tasks: ['Solicitar turno'] },
    { key: 'exams', label: 'Exámenes' },
    { key: 'issued', label: 'Emisión' },
  ]),
  t('wf-cuil', 'Unificación de CUIL', [
    { key: 'survey', label: 'Relevamiento ANSES', tasks: ['Verificar CUIL provisorios existentes'] },
    { key: 'filing', label: 'Presentación', tasks: ['Presentar unificación ante ANSES'] },
    { key: 'resolution', label: 'Resolución' },
  ]),
  t('wf-apostille', 'Apostillas', [
    { key: 'intake', label: 'Recepción de documentos', tasks: ['Recibir originales a apostillar'] },
    { key: 'legalization', label: 'Legalización' },
    { key: 'apostille', label: 'Apostilla', tasks: ['Gestionar apostilla de La Haya'] },
    { key: 'delivery', label: 'Entrega' },
  ]),
  t('wf-pre-migration', 'Charla premigratoria', [
    { key: 'scheduling', label: 'Coordinación', tasks: ['Coordinar fecha de la charla'] },
    { key: 'talk', label: 'Charla' },
    { key: 'materials', label: 'Envío de material', tasks: ['Enviar guía premigratoria'] },
  ]),
]

const byId = new Map(workflowTemplates.map((w) => [w.id, w]))

export function getWorkflowTemplate(id: string): WorkflowTemplate | undefined {
  return byId.get(id)
}
