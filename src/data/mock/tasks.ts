import type { TaskSeed } from './seedTypes'

/*
 * Hand-written tasks (most assigned to the demo user, stf_01). Stage tasks for
 * the rest of the team are generated from the workflow templates in seed.ts.
 */

export const mockTaskSeeds: TaskSeed[] = [
  { id: 'tsk_m01', serviceId: 'prj_0162_s1', title: 'Aprobar cotización para Oceanic Logistics', owner: 'stf_01', status: 'todo', due: '2026-10-21' },
  { id: 'tsk_m02', serviceId: 'prj_0158_s2', title: 'Revisar contrato de locación de Neuquén', description: 'Validar cláusulas de rescisión anticipada y depósito antes de la firma.', owner: 'stf_01', status: 'in-progress', due: '2026-10-20' },
  { id: 'tsk_m03', serviceId: 'prj_0151_s2', title: 'Aprobar pago a Sakura Home Search', owner: 'stf_01', status: 'todo', due: '2026-10-17' },
  { id: 'tsk_m04', serviceId: 'prj_0155_s1', procedureId: 'prc_08', title: 'Escalar bloqueo de antecedentes con el cliente', description: 'El certificado apostillado venció el 01/10; coordinar uno nuevo con Andes Minerals.', owner: 'stf_01', status: 'in-progress', due: '2026-10-16' },
  { id: 'tsk_m05', serviceId: 'prj_0159_s1', title: 'Confirmar renovación urgente de pasaporte', owner: 'stf_01', status: 'waiting', waitingOn: 'Consulado de Países Bajos', due: '2026-10-24' },
  { id: 'tsk_m06', serviceId: 'prj_0147_s1', title: 'Reactivar trámite tras regularización de pago', owner: 'stf_01', status: 'waiting', waitingOn: 'Pampa Agritech — Tesorería', due: '2026-10-22' },
  { id: 'tsk_m07', serviceId: 'prj_0161_s1', procedureId: 'prc_04', title: 'Validar carta de oferta para la visa', owner: 'stf_01', status: 'todo', due: '2026-10-27' },
  { id: 'tsk_m08', serviceId: 'prj_0154_s3', title: 'Aprobar despacho aduanero de la mudanza', owner: 'stf_01', status: 'done', due: '2026-10-15', completedAt: '2026-10-15' },
  { id: 'tsk_m09', serviceId: 'prj_0146_s1', title: 'Revisar informe migratorio para Helvion', owner: 'stf_01', status: 'done', due: '2026-10-14', completedAt: '2026-10-14' },
  { id: 'tsk_m10', serviceId: 'prj_0152_s1', procedureId: 'prc_09', title: 'Firmar poder para el trámite CRNM', owner: 'stf_01', status: 'todo', due: '2026-11-02' },
  { id: 'tsk_m11', serviceId: 'prj_0151_s3', title: 'Recibir historial escolar traducido de Noah', owner: 'stf_04', status: 'waiting', waitingOn: 'Familia Meier', due: '2026-10-25' },
  { id: 'tsk_m12', serviceId: 'prj_0160_s2', title: 'Enviar segunda preselección de propiedades', owner: 'stf_04', status: 'in-progress', due: '2026-10-22' },
]
