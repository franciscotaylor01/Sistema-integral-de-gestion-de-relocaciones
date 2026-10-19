import type { ActivityEvent } from '@/types/domain'

/* Fictional project timeline — demo data only. */

export const mockActivity: ActivityEvent[] = [
  { id: 'evt_01', projectId: 'prj_0158', date: '2026-10-18T16:20:00', actorId: 'stf_04', kind: 'document', message: 'Subió el borrador del contrato de locación en Neuquén para revisión del cliente.' },
  { id: 'evt_02', projectId: 'prj_0158', date: '2026-10-17T11:05:00', actorId: 'stf_06', kind: 'service', message: 'Embalaje completado en Rotterdam; contenedor asignado a la naviera.' },
  { id: 'evt_03', projectId: 'prj_0158', date: '2026-10-15T09:40:00', actorId: 'stf_03', kind: 'status', message: 'Presentación migratoria realizada ante la Dirección Nacional de Migraciones.' },
  { id: 'evt_04', projectId: 'prj_0158', date: '2026-10-10T14:00:00', actorId: 'stf_05', kind: 'finance', message: 'Se registró la orden de compra PO-NV-2026-0712.' },
  { id: 'evt_05', projectId: 'prj_0158', date: '2026-09-20T18:30:00', actorId: 'stf_02', kind: 'service', message: 'Programa de orientación finalizado con la familia Vermeulen.' },
  { id: 'evt_06', projectId: 'prj_0155', date: '2026-10-16T10:15:00', actorId: 'stf_03', kind: 'status', message: 'Trámite migratorio bloqueado: certificado de antecedentes vencido.' },
  { id: 'evt_07', projectId: 'prj_0155', date: '2026-10-12T12:00:00', actorId: 'stf_05', kind: 'finance', message: 'Emitida la factura FA-0001-00001855 por mudanza internacional.' },
  { id: 'evt_08', projectId: 'prj_0155', date: '2026-09-25T15:45:00', actorId: 'stf_04', kind: 'service', message: 'Entrega de llaves en Toronto confirmada.' },
  { id: 'evt_09', projectId: 'prj_0152', date: '2026-10-10T09:10:00', actorId: 'stf_05', kind: 'finance', message: 'Cobro parcial recibido de Helvion Pharma (EUR 1.900).' },
  { id: 'evt_10', projectId: 'prj_0152', date: '2026-10-05T13:30:00', actorId: 'stf_03', kind: 'document', message: 'Presentado el Registro Nacional Migratorio de Clara Baumann.' },
  { id: 'evt_11', projectId: 'prj_0151', date: '2026-10-14T08:50:00', actorId: 'stf_04', kind: 'status', message: 'Escolaridad bloqueada: falta el historial escolar traducido de Noah.' },
  { id: 'evt_12', projectId: 'prj_0151', date: '2026-10-01T17:00:00', actorId: 'stf_05', kind: 'finance', message: 'Factura FA-0001-00001836 vencida; se envió recordatorio al cliente.' },
  { id: 'evt_13', projectId: 'prj_0149', date: '2026-10-15T10:00:00', actorId: 'stf_05', kind: 'finance', message: 'Cobro total recibido de Kestrel Automotive (USD 8.000).' },
  { id: 'evt_14', projectId: 'prj_0149', date: '2026-10-09T16:10:00', actorId: 'stf_04', kind: 'service', message: 'Negociación de contrato de vivienda en etapa final.' },
  { id: 'evt_15', projectId: 'prj_0161', date: '2026-10-17T12:25:00', actorId: 'stf_03', kind: 'document', message: 'Recibido el certificado de antecedentes penales para revisión.' },
  { id: 'evt_16', projectId: 'prj_0161', date: '2026-10-14T09:00:00', actorId: 'stf_03', kind: 'status', message: 'Proyecto creado y cotización enviada a Lumen Fintech.' },
  { id: 'evt_17', projectId: 'prj_0162', date: '2026-10-16T15:30:00', actorId: 'stf_02', kind: 'status', message: 'Proyecto creado a partir del alta de Oceanic Logistics.' },
  { id: 'evt_18', projectId: 'prj_0159', date: '2026-10-13T11:20:00', actorId: 'stf_03', kind: 'status', message: 'Trámite migratorio bloqueado: pasaporte vencido el 12/10.' },
  { id: 'evt_19', projectId: 'prj_0147', date: '2026-10-02T10:45:00', actorId: 'stf_04', kind: 'status', message: 'Proyecto en pausa a pedido del cliente hasta regularizar el pago.' },
  { id: 'evt_20', projectId: 'prj_0154', date: '2026-10-16T14:05:00', actorId: 'stf_05', kind: 'finance', message: 'Cobro recibido de Pampa Agritech (ARS 5.400.000).' },
  { id: 'evt_21', projectId: 'prj_0154', date: '2026-10-11T09:30:00', actorId: 'stf_06', kind: 'service', message: 'La mudanza cruzó la frontera en Paso de los Libres.' },
  { id: 'evt_22', projectId: 'prj_0160', date: '2026-10-08T13:15:00', actorId: 'stf_03', kind: 'document', message: 'Iniciada la radicación temporaria de Valeria Castro.' },
  { id: 'evt_23', projectId: 'prj_0157', date: '2026-10-05T10:40:00', actorId: 'stf_05', kind: 'finance', message: 'Emitida la factura FA-0001-00001853.' },
  { id: 'evt_24', projectId: 'prj_0146', date: '2026-10-06T16:00:00', actorId: 'stf_05', kind: 'finance', message: 'Cobro parcial de Helvion Pharma (EUR 3.600).' },
  { id: 'evt_25', projectId: 'prj_0143', date: '2026-10-08T12:00:00', actorId: 'stf_05', kind: 'finance', message: 'Proyecto cobrado en su totalidad.' },
  { id: 'evt_26', projectId: 'prj_0143', date: '2026-08-30T17:20:00', actorId: 'stf_06', kind: 'status', message: 'Proyecto finalizado. Encuesta de satisfacción enviada.' },
]
