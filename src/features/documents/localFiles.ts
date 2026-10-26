import { randomId } from '@/domain/context'
import { loadFile, saveFile } from '@/services/local/attachmentStore'

/**
 * Local files for templates and received forms, reusing the Phase 4.7
 * IndexedDB attachment store. Files exist only in this browser: they are not
 * synced, shared or backed up.
 */

export interface StoredFile {
  attachmentId: string
  fileName: string
  mime: string
  size: number
}

/** Stores the blob first; the caller registers its metadata (and may roll back with deleteFile). */
export async function storeLocalFile(file: File): Promise<StoredFile> {
  const attachmentId = randomId('att')
  await saveFile(attachmentId, file)
  return { attachmentId, fileName: file.name, mime: file.type, size: file.size }
}

/** Downloads a stored file with its original name; false when it is not in this browser. */
export async function downloadLocalFile(attachmentId: string, fileName: string): Promise<boolean> {
  const blob = await loadFile(attachmentId).catch(() => undefined)
  if (!blob) return false
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

export const LOCAL_FILES_NOTE = 'Los archivos se guardan solo en este navegador: no se sincronizan ni se respaldan en la nube.'
