import type { Procedure, ServiceRecord } from '@/types/domain'
import { stageProgress, type StageProgress } from './workflow'

/** Service progress = completed stages of the service and of its procedures. */
export function serviceProgress(service: Pick<ServiceRecord, 'stages'>, procedures: Pick<Procedure, 'stages'>[] = []): StageProgress {
  return stageProgress([...service.stages, ...procedures.flatMap((p) => p.stages)])
}

/** Project progress = completed stages across all services and procedures. */
export function projectProgress(services: Pick<ServiceRecord, 'stages'>[], procedures: Pick<Procedure, 'stages'>[] = []): StageProgress {
  return stageProgress([...services.flatMap((s) => s.stages), ...procedures.flatMap((p) => p.stages)])
}
