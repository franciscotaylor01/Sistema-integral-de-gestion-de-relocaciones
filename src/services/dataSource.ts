import {
  mockActivity,
  mockAlerts,
  mockAssignees,
  mockClients,
  mockCurrencyIndicators,
  mockCurrentUser,
  mockDocuments,
  mockInvoices,
  mockNotifications,
  mockPayables,
  mockPayments,
  mockProjects,
  mockStaff,
  mockSuppliers,
} from '@/data/mock'
import type {
  ActivityEvent,
  Alert,
  Assignee,
  Client,
  CurrencyIndicator,
  Invoice,
  Notification,
  Payment,
  Project,
  ProjectDocument,
  StaffMember,
  Supplier,
  SupplierPayable,
  UserProfile,
} from '@/types/domain'

/**
 * The single seam between UI and data (same pattern as Vertix). Every feature
 * reads through this interface, so a Supabase implementation can replace
 * `mockDataSource` later without touching components. Methods are async on
 * purpose: screens already handle loading and empty states.
 */
export interface SigrDataSource {
  getCurrentUser(): Promise<UserProfile>
  listStaff(): Promise<StaffMember[]>
  listClients(): Promise<Client[]>
  listAssignees(): Promise<Assignee[]>
  listSuppliers(): Promise<Supplier[]>
  listProjects(): Promise<Project[]>
  listDocuments(): Promise<ProjectDocument[]>
  listActivity(): Promise<ActivityEvent[]>
  listInvoices(): Promise<Invoice[]>
  listPayables(): Promise<SupplierPayable[]>
  listPayments(): Promise<Payment[]>
  listCurrencyIndicators(): Promise<CurrencyIndicator[]>
  listAlerts(): Promise<Alert[]>
  listNotifications(): Promise<Notification[]>
}

/** Simulated network latency so loading states are visible in the demo. */
const LATENCY_MS = 420

function resolve<T>(value: T): Promise<T> {
  return new Promise((done) => setTimeout(() => done(value), LATENCY_MS))
}

export const mockDataSource: SigrDataSource = {
  getCurrentUser: () => resolve(mockCurrentUser),
  listStaff: () => resolve(mockStaff),
  listClients: () => resolve(mockClients),
  listAssignees: () => resolve(mockAssignees),
  listSuppliers: () => resolve(mockSuppliers),
  listProjects: () => resolve(mockProjects),
  listDocuments: () => resolve(mockDocuments),
  listActivity: () => resolve(mockActivity),
  listInvoices: () => resolve(mockInvoices),
  listPayables: () => resolve(mockPayables),
  listPayments: () => resolve(mockPayments),
  listCurrencyIndicators: () => resolve(mockCurrencyIndicators),
  listAlerts: () => resolve(mockAlerts),
  listNotifications: () => resolve(mockNotifications),
}

export const dataSource: SigrDataSource = mockDataSource
