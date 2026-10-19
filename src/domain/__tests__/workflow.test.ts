import { describe, expect, it } from 'vitest'
import { projectProgress, serviceProgress } from '@/domain/progress'
import { createProject } from '@/domain/projects'
import { addService, updateService } from '@/domain/services'
import { addWorkNote, applyStageAction, completeWork, reopenWork, setWorkStatus } from '@/domain/workItems'
import { completeStage, setCurrentStage, stageProgress } from '@/domain/workflow'
import { projectInput, seed, testContext } from './helpers'

function setup() {
  const ctx = testContext()
  const created = createProject(seed(), projectInput(), 'r', ctx)
  const services = created.ds.services.filter((s) => s.projectId === created.projectId)
  return { ctx, ds: created.ds, projectId: created.projectId, immigration: services[0], housing: services[1] }
}

describe('stage transitions', () => {
  it('completing the current stage activates the next one', () => {
    const { immigration } = setup()
    const { stages, activated } = completeStage(immigration.stages, immigration.stages[0].id, '2026-10-19')
    expect(stages[0]).toMatchObject({ status: 'done', completedAt: '2026-10-19' })
    expect(activated?.id).toBe(stages[1].id)
    expect(stages.filter((s) => s.status === 'current')).toHaveLength(1)
  })

  it('keeps a single current stage when jumping', () => {
    const { immigration } = setup()
    const stages = setCurrentStage(immigration.stages, immigration.stages[3].id)
    expect(stages.filter((s) => s.status === 'current').map((s) => s.id)).toEqual([immigration.stages[3].id])
  })

  it('progress is computed from completed stages, including procedures', () => {
    const { immigration } = setup()
    expect(stageProgress(immigration.stages)).toEqual({ done: 0, total: 6, pct: 0 })
    const { stages } = completeStage(immigration.stages, immigration.stages[0].id, '2026-10-19')
    expect(serviceProgress({ stages }).pct).toBe(17)
    const procedure = { stages: [{ id: 'a', key: 'a', label: 'A', status: 'done' as const }, { id: 'b', key: 'b', label: 'B', status: 'pending' as const }] }
    expect(serviceProgress({ stages }, [procedure])).toEqual({ done: 2, total: 8, pct: 25 })
    expect(projectProgress([{ stages }], [procedure]).done).toBe(2)
  })
})

describe('applyStageAction', () => {
  it('starts a not-started service, spawns stage tasks and promotes the project', () => {
    const { ds, ctx, housing, projectId } = setup()
    const next = applyStageAction(ds, { kind: 'service', id: housing.id }, { type: 'complete', stageId: housing.stages[0].id }, ctx)
    const svc = next.services.find((s) => s.id === housing.id)!
    expect(svc.status).toBe('in-progress')
    expect(svc.stages[1].status).toBe('current')
    expect(next.tasks.some((t) => t.stageId === svc.stages[1].id && t.serviceId === housing.id)).toBe(true)
    expect(next.projects.find((p) => p.id === projectId)!.operationalStatus).toBe('in-progress')
  })

  it('adds and updates custom stages', () => {
    const { ds, ctx, housing } = setup()
    const scope = { kind: 'service' as const, id: housing.id }
    let next = applyStageAction(ds, scope, { type: 'add', input: { label: 'Inspección técnica', afterStageId: housing.stages[2].id, dueDate: '2026-11-20' } }, ctx)
    let svc = next.services.find((s) => s.id === housing.id)!
    expect(svc.stages).toHaveLength(7)
    expect(svc.stages[3].label).toBe('Inspección técnica')
    next = applyStageAction(next, scope, { type: 'update', stageId: svc.stages[3].id, patch: { label: 'Inspección', ownerId: 'stf_06', notes: 'Con arquitecto' } }, ctx)
    svc = next.services.find((s) => s.id === housing.id)!
    expect(svc.stages[3]).toMatchObject({ label: 'Inspección', ownerId: 'stf_06', notes: 'Con arquitecto' })
    expect(() => applyStageAction(next, scope, { type: 'add', input: { label: '  ' } }, ctx)).toThrow()
  })
})

describe('service lifecycle', () => {
  it('requires explicit confirmation to close open stages, then can be reopened', () => {
    const { ds, ctx, housing } = setup()
    const scope = { kind: 'service' as const, id: housing.id }
    expect(() => completeWork(ds, scope, ctx)).toThrow(/etapas abiertas/)
    const done = completeWork(ds, scope, ctx, { closeOpenStages: true })
    const closed = done.services.find((s) => s.id === housing.id)!
    expect(closed.status).toBe('completed')
    expect(closed.stages.every((s) => s.status === 'done')).toBe(true)
    expect(() => applyStageAction(done, scope, { type: 'complete', stageId: closed.stages[0].id }, ctx)).toThrow(/Reabrilo/)
    expect(() => reopenWork(done, scope, ' ', ctx)).toThrow()
    const reopened = reopenWork(done, scope, 'El propietario rescindió', ctx).services.find((s) => s.id === housing.id)!
    expect(reopened.status).toBe('in-progress')
    expect(reopened.completedAt).toBeUndefined()
    expect(reopened.stages.at(-1)!.status).toBe('current')
  })

  it('changes status, owner, supplier and notes with activity', () => {
    const { ds, ctx, housing } = setup()
    const scope = { kind: 'service' as const, id: housing.id }
    let next = setWorkStatus(ds, scope, 'blocked', ctx)
    next = updateService(next, housing.id, { ownerId: 'stf_02', supplierId: 'sup_02' }, ctx)
    next = addWorkNote(next, scope, 'Propietario pide garantía bancaria', ctx)
    const svc = next.services.find((s) => s.id === housing.id)!
    expect(svc).toMatchObject({ status: 'blocked', ownerId: 'stf_02', supplierId: 'sup_02' })
    expect(svc.notes[0].text).toBe('Propietario pide garantía bancaria')
    expect(next.activity.slice(0, 3).map((a) => a.kind)).toEqual(['note', 'service', 'status'])
    expect(() => updateService(next, housing.id, { dueDate: '2026-10-01' }, ctx)).toThrow()
  })

  it('adds services to an existing project but not to a closed one', () => {
    const ctx = testContext()
    const ds = seed()
    const { ds: next, service } = addService(ds, 'prj_0158', { typeId: 'dni', ownerId: 'stf_03', startDate: '2026-11-01', dueDate: '2026-12-10' }, ctx)
    expect(next.services.find((s) => s.id === service.id)?.templateId).toBe('wf-dni')
    expect(() => addService(ds, 'prj_0143', { typeId: 'dni', ownerId: 'stf_03', startDate: '2026-05-01', dueDate: '2026-06-01' }, ctx)).toThrow(/cerrado/)
  })
})
