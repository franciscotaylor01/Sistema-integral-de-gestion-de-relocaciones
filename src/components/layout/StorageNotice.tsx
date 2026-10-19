import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useToast } from '@/components/feedback/useToast'
import { workspaceStore } from '@/services/workspaceStore'

const issueText = {
  corrupted: 'Los datos guardados estaban dañados.',
  outdated: 'Los datos guardados eran de una versión anterior de SIGR.',
  invalid: 'Los datos guardados tenían inconsistencias.',
  migrated: '',
} as const

/** Surfaces persistence problems once: discarded stored data or unavailable storage. */
export function StorageNotice() {
  const { notify } = useToast()
  const state = useSyncExternalStore(workspaceStore.subscribe, workspaceStore.getState)
  const warnedMemory = useRef(false)

  useEffect(() => workspaceStore.ensureLoaded(), [])

  useEffect(() => {
    if (!state.issue) return
    if (state.issue === 'migrated') {
      notify({ title: 'Datos de demo actualizados', description: 'Se incorporó la gestión comercial conservando tus proyectos, servicios y tareas.' })
    } else {
      notify({ title: 'Se restauraron los datos de demo', description: `${issueText[state.issue]} Se cargaron los datos ficticios iniciales.` })
    }
    workspaceStore.clearIssue()
  }, [state.issue, notify])

  useEffect(() => {
    if (state.status !== 'ready' || state.persistent || warnedMemory.current) return
    warnedMemory.current = true
    notify({ title: 'Sin almacenamiento local', description: 'El navegador no permite guardar datos: los cambios se perderán al recargar.' })
  }, [state.status, state.persistent, notify])

  return null
}
