import type { CountryCode, ProjectFinancialStatus, ProjectOperationalStatus, ProjectRecord, ServiceStatus, TaskStatus } from '@/types/domain'

/*
 * Compact shapes used to author the demo seed. `data/seed.ts` turns them into
 * the normalised domain records (people, participants, services, stages…).
 */

export interface FamilyMemberSeed {
  id: string
  name: string
  relation: 'spouse' | 'partner' | 'child' | 'dependent'
  age?: number
}

/** Employee of a corporate client plus the family that relocates with them. */
export interface Assignee {
  id: string
  clientId: string
  name: string
  jobTitle: string
  nationality: CountryCode
  email: string
  family: FamilyMemberSeed[]
}

export interface ServiceSeed {
  type: string
  status: ServiceStatus
  owner: string
  /** Number of completed workflow stages. */
  done: number
  due: string
  price: number
  cost: number
  supplier?: string
}

export interface ProjectSeed
  extends Pick<ProjectRecord, 'id' | 'code' | 'clientId' | 'origin' | 'destination' | 'ownerId' | 'currency' | 'startDate' | 'targetDate' | 'purchaseOrder'> {
  assigneeId: string
  kind: ProjectRecord['category']
  operationalStatus: ProjectOperationalStatus
  financialStatus: ProjectFinancialStatus
  services: ServiceSeed[]
}

export interface ProcedureSeed {
  id: string
  serviceId: string
  typeId: string
  /** Assignee id or family member id from assignees.ts. */
  personRef: string
  owner: string
  status: ServiceStatus
  done: number
  start: string
  due: string
  reference?: string
}

export interface TaskSeed {
  id: string
  serviceId: string
  procedureId?: string
  title: string
  description?: string
  owner: string
  status: TaskStatus
  waitingOn?: string
  due?: string
  completedAt?: string
}
