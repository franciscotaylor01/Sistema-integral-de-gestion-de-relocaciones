import { describe, expect, it } from 'vitest'
import { addProcedure } from '@/domain/procedures'
import { createProject } from '@/domain/projects'
import { createTask, updateTask } from '@/domain/tasks'
import { applyStageAction } from '@/domain/workItems'
import { fieldsOf, projectInput, seed, testContext } from './helpers'

function setup() {
  const ctx = testContext()
  const created = createProject(seed(), projectInput(), 'r', ctx)
  const services = created.ds.services.filter((s) => s.projectId === created.projectId)
  const people = created.ds.participants.filter((p) => p.projectId === created.projectId)
  const beneficiary = people.find((p) => p.role === 'beneficiary')!.personId
  return { ctx, ds: created.ds, projectId: created.projectId, immigration: services[0], housing: services[1], beneficiary }
}

describe('procedures', () => {
  it('opens several procedures for the same person inside a migration service', () => {
    const { ds, ctx, immigration, beneficiary } = setup()
    const a = addProcedure(ds, immigration.id, { typeId: 'residence', personId: beneficiary, ownerId: 'stf_03', startDate: '2026-11-02' }, ctx)
    const b = addProcedure(a.ds, immigration.id, { typeId: 'dni', personId: beneficiary, ownerId: 'stf_03', startDate: '2027-01-10', reference: 'RENAPER-1' }, ctx)
    const procs = b.ds.procedures.filter((p) => p.serviceId === immigration.id)
    expect(procs.map((p) => p.typeId)).toEqual(['residence', 'dni'])
    expect(procs.every((p) => p.personId === beneficiary && p.projectId === immigration.projectId)).toBe(true)
    // Own workflow; first stage active; due date proposed from the catalog.
    expect(procs[1].stages[0]).toMatchObject({ label: 'Turno RENAPER', status: 'current' })
    expect(procs[1].dueDate).toBe('2027-02-24')
    // Procedures are not projects.
    expect(b.ds.projects).toHaveLength(ds.projects.length)
    // Their stage tasks link back to project → service → procedure.
    const task = b.ds.tasks.find((t) => t.procedureId === procs[1].id)!
    expect(task).toMatchObject({ projectId: immigration.projectId, serviceId: immigration.id })
  })

  it('rejects people outside the project and services without procedures', () => {
    const { ds, ctx, immigration, housing } = setup()
    expect(fieldsOf(() => addProcedure(ds, immigration.id, { typeId: 'dni', personId: 'per_asg_02', ownerId: 'stf_03', startDate: '2026-11-02' }, ctx)).personId).toMatch(/persona/i)
    const beneficiary = ds.participants.find((p) => p.role === 'beneficiary' && p.projectId === immigration.projectId)!.personId
    expect(() => addProcedure(ds, housing.id, { typeId: 'dni', personId: beneficiary, ownerId: 'stf_03', startDate: '2026-11-02' }, ctx)).toThrow()
  })

  it('advances procedure stages independently from the service', () => {
    const { ds, ctx, immigration, beneficiary } = setup()
    const { ds: next, procedure } = addProcedure(ds, immigration.id, { typeId: 'tie', personId: beneficiary, ownerId: 'stf_03', startDate: '2026-11-02' }, ctx)
    const after = applyStageAction(next, { kind: 'procedure', id: procedure.id }, { type: 'complete', stageId: procedure.stages[0].id }, ctx)
    expect(after.procedures.find((p) => p.id === procedure.id)!.stages[1].status).toBe('current')
    expect(after.services.find((s) => s.id === immigration.id)!.stages).toEqual(next.services.find((s) => s.id === immigration.id)!.stages)
  })
})

describe('tasks', () => {
  it('requires a project and one of its services', () => {
    const { ds, ctx, immigration } = setup()
    const base = { title: 'Llamar al consulado', ownerId: 'stf_01' }
    expect(() => createTask(ds, { ...base, projectId: '', serviceId: immigration.id }, ctx)).toThrow(/proyecto/)
    expect(() => createTask(ds, { ...base, projectId: 'prj_0158', serviceId: immigration.id }, ctx)).toThrow(/servicio/)
    expect(() => createTask(ds, { ...base, projectId: immigration.projectId, serviceId: immigration.id, procedureId: 'prc_01' }, ctx)).toThrow(/trámite/)
  })

  it('creates, waits, completes and reopens a task', () => {
    const { ds, ctx, immigration } = setup()
    const { ds: d1, task } = createTask(ds, { projectId: immigration.projectId, serviceId: immigration.id, title: 'Pedir turno', ownerId: 'stf_01', dueDate: '2026-11-05' }, ctx)
    expect(task.status).toBe('todo')
    expect(fieldsOf(() => updateTask(d1, task.id, { status: 'waiting' }, ctx)).waitingOn).toMatch(/esperando/)
    const d2 = updateTask(d1, task.id, { status: 'waiting', waitingOn: 'Consulado' }, ctx)
    expect(d2.tasks.find((t) => t.id === task.id)).toMatchObject({ status: 'waiting', waitingOn: 'Consulado' })
    const d3 = updateTask(d2, task.id, { status: 'done' }, ctx)
    expect(d3.tasks.find((t) => t.id === task.id)).toMatchObject({ status: 'done', completedAt: '2026-10-19', waitingOn: undefined })
    const d4 = updateTask(d3, task.id, { status: 'todo' }, ctx)
    expect(d4.tasks.find((t) => t.id === task.id)!.completedAt).toBeUndefined()
    expect(d4.activity[0]).toMatchObject({ kind: 'task', taskId: task.id })
  })
})
