import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { CustomerSnapshotResult } from './healthScoreServer';
import type { HealthDashboard, HealthCustomerDetail } from './healthReadService';

/** Fachada de navegador: toda lectura y escritura se resuelve con la sesión del servidor. */
export type { HealthBand, HealthScoreResult, HealthSnapshot, CustomerSnapshotResult } from './healthScoreServer';
export interface RefreshHealthResult { queued: true; event_id: string }
class HealthScoreService {
  async getDashboard(): Promise<HealthDashboard> { return (await pedirCrm<HealthDashboard>('/api/crm/health')).data; }
  async getDetail(customerId: string, limit = 30): Promise<HealthCustomerDetail> {
    return (await pedirCrm<HealthCustomerDetail>(`/api/crm/health/${encodeURIComponent(customerId)}?limit=${limit}`)).data;
  }
  async getAllHealthScores(_organizationId?: number) { void _organizationId; return (await this.getDashboard()).scores; }
  async getCustomerHealthScore(customerId: string, _organizationId?: number) { void _organizationId; return (await this.getDetail(customerId)).health; }
  async getHealthHistory(customerId: string, limit = 30) { return (await this.getDetail(customerId, limit)).history; }
  async countInvoices(customerId: string, _organizationId?: number) { void _organizationId; return (await this.getDetail(customerId)).invoice_count; }
  async refreshAllHealthScores(): Promise<RefreshHealthResult> { return (await pedirCrm<RefreshHealthResult>('/api/crm/health/refresh', { method: 'POST', cuerpo: {} })).data; }
  async snapshotHealthScore(customerId: string): Promise<CustomerSnapshotResult> {
    return (await pedirCrm<CustomerSnapshotResult>(`/api/crm/health/${encodeURIComponent(customerId)}/snapshot`, { method: 'POST', cuerpo: {} })).data;
  }
}
export const healthScoreService = new HealthScoreService();
export default healthScoreService;
