import { describe, expect, it } from 'vitest'
import { DomainError } from '@/domain/errors'
import { createProject, nextProjectCode, updateProject, validateProjectInput } from '@/domain/projects'
import { fieldsOf, projectInput, seed, testContext } from './helpers'

describe('createProject', () => {
  it('creates the project, its people, participants and multiple services', () => {
    const ds = seed()
    const ctx = testContext()
    const { ds: next, projectId, duplicate } = createProject(ds, projectInput(), 'req-1', ctx)
    const project = next.projects.find((p) => p.id === projectId)!

    expect(duplicate).toBe(false)
    expect(project.code).toBe('REL-2026-0165')
    expect(project.operationalStatus).toBe('onboarding')
    expect(project.currency).toBe('USD') // client billing currency

    const participants = next.participants.filter((p) => p.projectId === projectId)
    expect(participants.map((p) => p.role).sort()).toEqual(['beneficiary', 'child', 'spouse'])
    expect(next.people.length).toBe(ds.people.length + 3)
    // The client record is referenced, never copied.
    expect(next.clients).toBe(ds.clients)

    const services = next.services.filter((s) => s.projectId === projectId)
    expect(services.map((s) => s.typeId)).toEqual(['immigration', 'housing', 'schooling'])
    expect(new Set(services.map((s) => s.id)).size).toBe(3)
    // Each service gets its own workflow from its template.
    expect(services[0].stages[0].label).toBe('Relevamiento de requisitos')
    expect(services[1].stages[0].label).toBe('Brief de necesidades')
    // Started service: first stage current + template tasks created and linked.
    expect(services[0].status).toBe('in-progress')
    expect(services[0].stages[0].status).toBe('current')
    expect(services[1].status).toBe('not-started')
    expect(services[1].stages.every((s) => s.status === 'pending')).toBe(true)
    const tasks = next.tasks.filter((t) => t.projectId === projectId)
    expect(tasks).toHaveLength(2)
    expect(tasks.every((t) => t.serviceId === services[0].id && t.stageId === services[0].stages[0].id)).toBe(true)
    // Price prefilled only when exactly one tariff applies: Nordvik has two
    // overlapping immigration rules from October (ambiguous → left empty),
    // and a market-specific housing price for Argentina.
    expect(services[0].price).toBeUndefined()
    expect(services[1].price).toBe(4500)
    expect(next.activity[0].projectId).toBe(projectId)
  })

  it('is idempotent for repeated submissions with the same request id', () => {
    const ctx = testContext()
    const first = createProject(seed(), projectInput(), 'req-dup', ctx)
    const second = createProject(first.ds, projectInput(), 'req-dup', ctx)
    expect(second.duplicate).toBe(true)
    expect(second.projectId).toBe(first.projectId)
    expect(second.ds.projects).toHaveLength(first.ds.projects.length)
  })

  it('assigns sequential codes', () => {
    const ctx = testContext()
    const a = createProject(seed(), projectInput(), 'a', ctx)
    const b = createProject(a.ds, projectInput(), 'b', ctx)
    expect(b.ds.projects.at(-1)!.code).toBe('REL-2026-0166')
    expect(nextProjectCode(b.ds, '2027-01-02')).toBe('REL-2027-0167')
  })

  it('validates required fields and date relationships', () => {
    const ds = seed()
    const errors = validateProjectInput(
      ds,
      projectInput({
        clientId: '',
        beneficiary: { name: ' ', nationality: '' },
        family: [{ name: '', role: 'child' }],
        startDate: '2026-11-01',
        targetDate: '2026-10-01',
        services: [{ typeId: 'housing', ownerId: 'stf_04', startDate: '2026-10-15', dueDate: '2026-10-10' }],
      }),
    )
    expect(errors).toMatchObject({
      clientId: expect.any(String),
      'beneficiary.name': expect.any(String),
      'beneficiary.nationality': expect.any(String),
      'family.0.name': expect.any(String),
      targetDate: 'Debe ser posterior a la fecha de inicio.',
    })
    expect(errors['services.0.dueDate']).toBeDefined()
  })

  it('requires at least one service and rejects identical origin/destination', () => {
    const errors = validateProjectInput(seed(), projectInput({ services: [], destination: { country: 'NL', city: 'rotterdam' } }))
    expect(errors.services).toBeDefined()
    expect(errors['destination.city']).toBeDefined()
  })

  it('throws a DomainError with field messages', () => {
    expect(() => createProject(seed(), projectInput({ ownerId: 'nobody' }), 'x', testContext())).toThrow(DomainError)
  })
})

describe('updateProject', () => {
  it('edits fields, manages family and logs a single activity event', () => {
    const ctx = testContext()
    const { ds, projectId } = createProject(seed(), projectInput(), 'r', ctx)
    const child = ds.participants.find((p) => p.projectId === projectId && p.role === 'child')!
    const next = updateProject(
      ds,
      projectId,
      { targetDate: '2027-04-30', ownerId: 'stf_06', addFamily: [{ name: 'Lars Lindqvist', role: 'child', age: 3 }], removeParticipantIds: [child.id] },
      ctx,
    )
    const project = next.projects.find((p) => p.id === projectId)!
    expect(project.targetDate).toBe('2027-04-30')
    expect(project.ownerId).toBe('stf_06')
    const names = next.participants.filter((p) => p.projectId === projectId).map((p) => next.people.find((x) => x.id === p.personId)!.name)
    expect(names).toContain('Lars Lindqvist')
    expect(names).not.toContain('Mia Lindqvist')
    expect(next.activity.length).toBe(ds.activity.length + 1)
    expect(next.activity[0].message).toMatch(/responsable: Lucas Benítez/)
  })

  it('rejects an end date before the start and closing with open services', () => {
    const ctx = testContext()
    const { ds, projectId } = createProject(seed(), projectInput(), 'r', ctx)
    expect(fieldsOf(() => updateProject(ds, projectId, { targetDate: '2026-10-01' }, ctx)).targetDate).toMatch(/posterior/)
    expect(fieldsOf(() => updateProject(ds, projectId, { operationalStatus: 'completed' }, ctx)).operationalStatus).toMatch(/3 servicios abiertos/)
  })

  it('does not allow removing the beneficiary', () => {
    const ctx = testContext()
    const { ds, projectId } = createProject(seed(), projectInput(), 'r', ctx)
    const beneficiary = ds.participants.find((p) => p.projectId === projectId && p.role === 'beneficiary')!
    expect(() => updateProject(ds, projectId, { removeParticipantIds: [beneficiary.id] }, ctx)).toThrow(DomainError)
  })
})
