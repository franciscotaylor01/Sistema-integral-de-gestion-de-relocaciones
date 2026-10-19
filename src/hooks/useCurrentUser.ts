import { dataSource } from '@/services/dataSource'
import { useQuery } from './useQuery'

export function useCurrentUser() {
  return useQuery('current-user', dataSource.getCurrentUser).data
}
