import type { ProcedureSeed } from './seedTypes'

/* Fictional procedures inside migration services — demo data only. */

export const mockProcedureSeeds: ProcedureSeed[] = [
  { id: 'prc_01', serviceId: 'prj_0158_s1', typeId: 'residence', personRef: 'asg_01', owner: 'stf_03', status: 'in-progress', done: 3, start: '2026-09-05', due: '2026-11-05', reference: 'DNM-2026-118734' },
  { id: 'prc_02', serviceId: 'prj_0158_s1', typeId: 'residence', personRef: 'fam_01', owner: 'stf_03', status: 'in-progress', done: 2, start: '2026-09-05', due: '2026-11-10', reference: 'DNM-2026-118735' },
  { id: 'prc_03', serviceId: 'prj_0158_s1', typeId: 'dni', personRef: 'asg_01', owner: 'stf_03', status: 'not-started', done: 0, start: '2026-11-06', due: '2026-12-15' },
  { id: 'prc_04', serviceId: 'prj_0161_s1', typeId: 'work-visa', personRef: 'asg_05', owner: 'stf_03', status: 'in-progress', done: 1, start: '2026-10-14', due: '2026-12-10', reference: 'CGE-BA-44821' },
  { id: 'prc_05', serviceId: 'prj_0161_s1', typeId: 'tie', personRef: 'asg_05', owner: 'stf_03', status: 'not-started', done: 0, start: '2026-12-11', due: '2027-01-25' },
  { id: 'prc_06', serviceId: 'prj_0160_s1', typeId: 'residence', personRef: 'asg_08', owner: 'stf_03', status: 'in-progress', done: 3, start: '2026-09-25', due: '2026-11-20', reference: 'DNM-2026-120552' },
  { id: 'prc_07', serviceId: 'prj_0160_s1', typeId: 'residence', personRef: 'fam_12', owner: 'stf_03', status: 'in-progress', done: 3, start: '2026-09-25', due: '2026-11-20', reference: 'DNM-2026-120553' },
  { id: 'prc_08', serviceId: 'prj_0155_s1', typeId: 'work-visa', personRef: 'asg_02', owner: 'stf_03', status: 'blocked', done: 2, start: '2026-08-15', due: '2026-10-25', reference: 'IRCC-W307-2291' },
  { id: 'prc_09', serviceId: 'prj_0152_s1', typeId: 'residence', personRef: 'asg_03', owner: 'stf_03', status: 'in-progress', done: 4, start: '2026-07-25', due: '2026-11-10', reference: 'CRNM-SP-77120' },
  { id: 'prc_10', serviceId: 'prj_0149_s1', typeId: 'work-visa', personRef: 'asg_04', owner: 'stf_03', status: 'completed', done: 4, start: '2026-06-20', due: '2026-08-15', reference: 'INM-MTY-30981' },
]
