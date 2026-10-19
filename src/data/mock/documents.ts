import type { ProjectDocument } from '@/types/domain'

/* Fictional document records — demo data only. */

export const mockDocuments: ProjectDocument[] = [
  { id: 'doc_01', projectId: 'prj_0158', serviceId: 'prj_0158_s1', name: 'Pasaporte', kind: 'passport', holder: 'Erik Vermeulen', status: 'valid', uploadedAt: '2026-09-03', expiresAt: '2031-03-12' },
  { id: 'doc_02', projectId: 'prj_0158', serviceId: 'prj_0158_s1', name: 'Pasaporte', kind: 'passport', holder: 'Lotte Vermeulen', status: 'expiring', uploadedAt: '2026-09-03', expiresAt: '2026-11-10' },
  { id: 'doc_03', projectId: 'prj_0158', serviceId: 'prj_0158_s1', name: 'Visa de trabajo (en trámite)', kind: 'visa', holder: 'Erik Vermeulen', status: 'in-review', uploadedAt: '2026-10-02' },
  { id: 'doc_04', projectId: 'prj_0158', serviceId: 'prj_0158_s2', name: 'Contrato de locación — Neuquén', kind: 'lease', holder: 'Erik Vermeulen', status: 'in-review', uploadedAt: '2026-10-15' },
  { id: 'doc_05', projectId: 'prj_0155', serviceId: 'prj_0155_s1', name: 'Certificado de antecedentes apostillado', kind: 'certificate', holder: 'Diego Fuentes', status: 'expired', uploadedAt: '2026-08-20', expiresAt: '2026-10-01' },
  { id: 'doc_06', projectId: 'prj_0155', serviceId: 'prj_0155_s1', name: 'Pasaporte', kind: 'passport', holder: 'Diego Fuentes', status: 'valid', uploadedAt: '2026-08-14', expiresAt: '2029-05-30' },
  { id: 'doc_07', projectId: 'prj_0155', serviceId: 'prj_0155_s2', name: 'Lease agreement — Toronto', kind: 'lease', holder: 'Diego Fuentes', status: 'valid', uploadedAt: '2026-09-24', expiresAt: '2027-09-30' },
  { id: 'doc_08', projectId: 'prj_0152', serviceId: 'prj_0152_s1', name: 'Registro Nacional Migratorio (CRNM)', kind: 'residence-card', holder: 'Clara Baumann', status: 'in-review', uploadedAt: '2026-10-05' },
  { id: 'doc_09', projectId: 'prj_0152', serviceId: 'prj_0152_s2', name: 'Contrato de alquiler — São Paulo', kind: 'lease', holder: 'Clara Baumann', status: 'valid', uploadedAt: '2026-08-28', expiresAt: '2028-07-31' },
  { id: 'doc_10', projectId: 'prj_0149', serviceId: 'prj_0149_s1', name: 'Permiso de trabajo (FM3)', kind: 'work-permit', holder: 'Michael Torres', status: 'valid', uploadedAt: '2026-08-12', expiresAt: '2027-09-01' },
  { id: 'doc_11', projectId: 'prj_0161', serviceId: 'prj_0161_s1', name: 'Pasaporte', kind: 'passport', holder: 'Agustina Méndez', status: 'valid', uploadedAt: '2026-10-15', expiresAt: '2033-02-18' },
  { id: 'doc_12', projectId: 'prj_0161', serviceId: 'prj_0161_s1', name: 'Certificado de antecedentes penales', kind: 'certificate', holder: 'Agustina Méndez', status: 'in-review', uploadedAt: '2026-10-17' },
  { id: 'doc_13', projectId: 'prj_0161', serviceId: 'prj_0161_s1', name: 'Seguro médico internacional', kind: 'insurance', holder: 'Agustina Méndez', status: 'missing' },
  { id: 'doc_14', projectId: 'prj_0147', serviceId: 'prj_0147_s1', name: 'Pasaporte', kind: 'passport', holder: 'Rodrigo Sosa', status: 'expiring', uploadedAt: '2026-08-05', expiresAt: '2026-11-28' },
  { id: 'doc_15', projectId: 'prj_0160', serviceId: 'prj_0160_s1', name: 'Radicación temporaria', kind: 'residence-card', holder: 'Valeria Castro', status: 'in-review', uploadedAt: '2026-10-08' },
  { id: 'doc_16', projectId: 'prj_0160', serviceId: 'prj_0160_s3', name: 'Certificado analítico escolar', kind: 'certificate', holder: 'Martina Castro', status: 'valid', uploadedAt: '2026-10-01' },
  { id: 'doc_17', projectId: 'prj_0151', serviceId: 'prj_0151_s1', name: 'Certificate of Eligibility', kind: 'visa', holder: 'Lukas Meier', status: 'valid', uploadedAt: '2026-09-10', expiresAt: '2027-07-01' },
  { id: 'doc_18', projectId: 'prj_0151', serviceId: 'prj_0151_s3', name: 'Historial escolar traducido', kind: 'certificate', holder: 'Noah Meier', status: 'missing' },
  { id: 'doc_19', projectId: 'prj_0151', name: 'Seguro de salud familiar', kind: 'insurance', holder: 'Familia Meier', status: 'expiring', uploadedAt: '2026-07-05', expiresAt: '2026-11-03' },
  { id: 'doc_20', projectId: 'prj_0157', serviceId: 'prj_0157_s1', name: 'Petición L-1A', kind: 'visa', holder: 'Ana Lucía Rivas', status: 'in-review', uploadedAt: '2026-10-01' },
  { id: 'doc_21', projectId: 'prj_0146', serviceId: 'prj_0146_s1', name: 'Visa M — trabajador', kind: 'visa', holder: 'Paul Schneider', status: 'expiring', uploadedAt: '2026-06-20', expiresAt: '2026-12-01' },
  { id: 'doc_22', projectId: 'prj_0154', serviceId: 'prj_0154_s1', name: 'Constancia de baja de domicilio', kind: 'certificate', holder: 'Mariana Gil', status: 'valid', uploadedAt: '2026-09-28' },
  { id: 'doc_23', projectId: 'prj_0159', serviceId: 'prj_0159_s1', name: 'Pasaporte', kind: 'passport', holder: 'Pieter de Groot', status: 'expired', uploadedAt: '2026-10-03', expiresAt: '2026-10-12' },
  { id: 'doc_24', projectId: 'prj_0162', name: 'Pasaporte', kind: 'passport', holder: 'Hannah Clarke', status: 'valid', uploadedAt: '2026-10-16', expiresAt: '2030-08-22' },
  { id: 'doc_25', projectId: 'prj_0143', serviceId: 'prj_0143_s1', name: 'L-1 Visa', kind: 'visa', holder: 'Ingrid Haugen', status: 'valid', uploadedAt: '2026-06-08', expiresAt: '2029-06-07' },
]
