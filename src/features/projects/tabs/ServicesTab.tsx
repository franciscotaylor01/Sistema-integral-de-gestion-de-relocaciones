import { Layers, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { TaskModal, type TaskPreset } from '@/features/tasks/TaskModal'
import { ServiceCard } from '../components/ServiceCard'
import { AddProcedureModal, EditProcedureModal } from '../modals/ProcedureModals'
import { AddServiceModal, EditServiceModal } from '../modals/ServiceModals'
import type { ProjectContext } from '../projectContext'

/** Multiple services per project, each managed independently. */
export function ServicesTab({ ctx }: { ctx: ProjectContext }) {
  const { project, workspace } = ctx
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string>()
  const [procedureFor, setProcedureFor] = useState<string>()
  const [editingProcedure, setEditingProcedure] = useState<string>()
  const [taskId, setTaskId] = useState<string>()
  const [newTask, setNewTask] = useState<TaskPreset>()
  const closed = project.operationalStatus === 'completed' || project.operationalStatus === 'cancelled'

  return (
    <div className="flex flex-col gap-[20px]">
      <Card className="px-[20px] py-[16px]">
        <SectionTitle
          title="Servicios contratados"
          description={`${project.services.length} ${project.services.length === 1 ? 'servicio' : 'servicios'} en esta relocación · cada uno con su workflow, responsable y estado.`}
          action={
            !closed && (
              <Button onClick={() => setAdding(true)}>
                <Plus aria-hidden className="size-[17px]" strokeWidth={2} />
                Agregar servicio
              </Button>
            )
          }
        />
      </Card>

      {project.services.length === 0 ? (
        <Card>
          <EmptyState icon={Layers} className="py-12" title="Sin servicios" description="Agregá el primer servicio contratado para este proyecto." />
        </Card>
      ) : (
        project.services.map((s) => (
          <ServiceCard
            key={s.id}
            service={s}
            project={project}
            workspace={workspace}
            documents={ctx.documents}
            onEdit={() => setEditing(s.id)}
            onAddProcedure={() => setProcedureFor(s.id)}
            onEditProcedure={setEditingProcedure}
            onNewTask={() => setNewTask({ projectId: project.id, serviceId: s.id })}
            onOpenTask={setTaskId}
          />
        ))
      )}

      <AddServiceModal open={adding} onClose={() => setAdding(false)} project={project} workspace={workspace} />
      <EditServiceModal service={editing ? workspace.serviceById.get(editing) : undefined} onClose={() => setEditing(undefined)} project={project} workspace={workspace} />
      <AddProcedureModal service={procedureFor ? workspace.serviceById.get(procedureFor) : undefined} onClose={() => setProcedureFor(undefined)} workspace={workspace} />
      <EditProcedureModal
        procedure={editingProcedure ? workspace.procedureById.get(editingProcedure) : undefined}
        onClose={() => setEditingProcedure(undefined)}
        workspace={workspace}
      />
      <TaskModal open={Boolean(taskId)} onClose={() => setTaskId(undefined)} workspace={workspace} taskId={taskId} />
      <TaskModal open={Boolean(newTask)} onClose={() => setNewTask(undefined)} workspace={workspace} preset={newTask} />
    </div>
  )
}
