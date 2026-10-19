import type { StaffMember, UserProfile } from '@/types/domain'

/* Fictional Relocare team — demo data only. */

export const mockStaff: StaffMember[] = [
  { id: 'stf_01', name: 'Valentina Ríos', role: 'Dirección de Operaciones', email: 'v.rios@relocare.example' },
  { id: 'stf_02', name: 'Martín Aguirre', role: 'Consultor de Movilidad', email: 'm.aguirre@relocare.example' },
  { id: 'stf_03', name: 'Camila Duarte', role: 'Especialista en Migraciones', email: 'c.duarte@relocare.example' },
  { id: 'stf_04', name: 'Tomás Herrera', role: 'Vivienda y Escolaridad', email: 't.herrera@relocare.example' },
  { id: 'stf_05', name: 'Julieta Paz', role: 'Analista Financiera', email: 'j.paz@relocare.example' },
  { id: 'stf_06', name: 'Lucas Benítez', role: 'Consultor de Movilidad', email: 'l.benitez@relocare.example' },
]

export const mockCurrentUser: UserProfile = { ...mockStaff[0], firstName: 'Valentina' }
