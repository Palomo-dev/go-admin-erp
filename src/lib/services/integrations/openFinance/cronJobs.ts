/**
 * Servicio de jobs programados para Open Finance (Fase 9).
 * Orquesta sincronizacion diaria, verificacion horaria de saldos,
 * ejecucion de pagos programados, deteccion de anomalías y
 * control de expiracion de consentimientos.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isProviderConfigured } from './openFinanceConfig';
import { transactionSyncService } from './transactionSyncService';
import { balanceService } from './balanceService';
import { paymentInitiationService } from './paymentInitiationService';
import { treasuryService } from './treasuryService';

// ============================================================
// Tipos de reportes
// ============================================================

/** Reporte de sincronizacion diaria */
export interface SyncReport {
  linksProcessed: number;
  totalSynced: number;
  totalImported: number;
  errors: number;
  duration: number;
}

/** Reporte de verificacion horaria de saldos */
export interface BalanceReport {
  accountsChecked: number;
  discrepancies: number;
  errors: number;
  duration: number;
}

/** Reporte de ejecucion de pagos programados */
export interface PaymentReport {
  paymentsProcessed: number;
  totalAmount: number;
  errors: number;
  duration: number;
}

/** Reporte de deteccion de anomalias */
export interface AnomalyReport {
  organizationsChecked: number;
  totalAnomalies: number;
  highSeverity: number;
  errors: number;
  duration: number;
}

/** Reporte de expiracion de consentimientos */
export interface ConsentReport {
  expiringSoon: number;
  expired: number;
  notificationsSent: number;
  errors: number;
  duration: number;
}

/** Estado de salud general de Open Finance */
export interface HealthStatus {
  provider: string;
  isConfigured: boolean;
  activeLinks: number;
  lastSync: string | null;
  pendingTransactions: number;
  errors: string[];
}

// ============================================================
// Tipos internos de filas de BD
// ============================================================

/** Fila minima de organizations con vinculacion Open Finance */
interface OrganizationRow {
  id: number;
}

/** Fila minima de open_finance_links */
interface OpenFinanceLinkRow {
  id: string;
  organization_id: number;
  last_sync_at: string | null;
  status: string;
}

/** Fila minima de payments programados pendientes */
interface ScheduledPaymentRow {
  id: string;
  organization_id: number;
  source_id: string | null;
  amount: number;
  payment_date: string | null;
  processor_response: Record<string, unknown> | null;
}

/** Fila minima de open_finance_consents */
interface ConsentRow {
  id: string;
  organization_id: number;
  link_id: string | null;
  consent_type: string;
  purpose: string | null;
  expires_at: string | null;
  status: string;
}

/** Alerta de tesoreria (anomalia) con severidad */
interface TreasuryAlertRow {
  id: string;
  severity: 'high' | 'medium' | 'low';
  type: string;
  message: string;
}

/** Dias de antelacion para alertar expiracion de consentimientos */
const CONSENT_EXPIRY_THRESHOLD_DAYS = 7;

/**
 * Obtiene los IDs de organizaciones que tienen al menos un link activo.
 */
async function getOrganizationsWithActiveLinks(): Promise<number[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('open_finance_links')
    .select('organization_id')
    .eq('status', 'active');

  if (error) {
    throw new Error(`Error al listar organizaciones con links: ${error.message}`);
  }

  const ids = new Set<number>();
  for (const row of (data || []) as OrganizationRow[]) {
    ids.add(row.id);
  }
  return Array.from(ids);
}

/**
 * Inserta una notificacion en la tabla notifications.
 */
async function createNotification(
  organizationId: number,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('notifications').insert({
      organization_id: organizationId,
      channel: 'push',
      payload,
      status: 'pending',
    });
  } catch (err) {
    console.error('[CronJobs] Error al crear notificacion:', err);
  }
}

export class CronJobsService {
  /**
   * Sincroniza todos los links activos y registra un reporte.
   * Usa transactionSyncService.syncAllLinks().
   * @returns Reporte de sincronizacion diaria
   */
  static async runDailySync(): Promise<SyncReport> {
    const start = Date.now();
    let errors = 0;
    try {
      const stats = await transactionSyncService.syncAllLinks();
      return {
        linksProcessed: stats.linksProcessed,
        totalSynced: stats.totalSynced,
        totalImported: stats.totalImported,
        errors,
        duration: Date.now() - start,
      };
    } catch (err) {
      errors += 1;
      console.error('[CronJobs] Error en sincronizacion diaria:', err);
      return {
        linksProcessed: 0,
        totalSynced: 0,
        totalImported: 0,
        errors,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Refresca los saldos de todas las organizaciones con links activos.
   * Detecta discrepancias entre saldo real y local.
   * @returns Reporte de verificacion de saldos
   */
  static async runHourlyBalanceCheck(): Promise<BalanceReport> {
    const start = Date.now();
    let accountsChecked = 0;
    let discrepancies = 0;
    let errors = 0;

    try {
      const organizationIds = await getOrganizationsWithActiveLinks();

      for (const orgId of organizationIds) {
        try {
          const result = await balanceService.refreshAllBalances(orgId);
          accountsChecked += result.refreshed;
          errors += result.errors;

          // Contar discrepancias comparando saldos reales vs locales
          const balances = await balanceService.getRealTimeBalances(orgId);
          for (const balance of balances) {
            if (Math.abs(balance.difference) > 1) {
              discrepancies += 1;
            }
          }
        } catch (err) {
          errors += 1;
          console.error(`[CronJobs] Error al refrescar saldos org ${orgId}:`, err);
        }
      }

      return {
        accountsChecked,
        discrepancies,
        errors,
        duration: Date.now() - start,
      };
    } catch (err) {
      errors += 1;
      console.error('[CronJobs] Error en verificacion horaria de saldos:', err);
      return {
        accountsChecked,
        discrepancies,
        errors,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Ejecuta los pagos programados pendientes cuya fecha de pago ya vencio.
   * Busca payments con method='open_finance_scheduled' y status='pending'
   * y payment_date <= hoy, y ejecuta la transferencia via paymentInitiationService.
   * @returns Reporte de ejecucion de pagos programados
   */
  static async runScheduledPayments(): Promise<PaymentReport> {
    const start = Date.now();
    let paymentsProcessed = 0;
    let totalAmount = 0;
    let errors = 0;

    try {
      const supabase = getSupabaseAdmin();
      const today = new Date().toISOString();

      // Pagos programados pendientes cuya fecha ya llego
      const { data: payments, error: payError } = await supabase
        .from('payments')
        .select('id, organization_id, source_id, amount, payment_date, processor_response')
        .eq('method', 'open_finance_scheduled')
        .eq('status', 'pending')
        .lte('payment_date', today);

      if (payError) {
        throw new Error(`Error al listar pagos programados: ${payError.message}`);
      }

      for (const payment of (payments || []) as ScheduledPaymentRow[]) {
        try {
          // El source_id es el ID de la cuenta por pagar
          const accountPayableId = Number(payment.source_id);
          if (!accountPayableId) {
            errors += 1;
            continue;
          }

          // El bank_account_id se guarda en processor_response al programar
          const processor = payment.processor_response as { bank_account_id?: number } | null;
          const bankAccountId = processor?.bank_account_id;
          if (!bankAccountId) {
            errors += 1;
            continue;
          }

          // Ejecutar el pago via Open Finance
          const result = await paymentInitiationService.paySupplier(
            accountPayableId,
            bankAccountId,
            'system-cron',
          );

          if (result.success) {
            paymentsProcessed += 1;
            totalAmount += result.amount;
          } else {
            errors += 1;
            console.error(`[CronJobs] Pago ${payment.id} fallido: ${result.error}`);
          }
        } catch (err) {
          errors += 1;
          console.error(`[CronJobs] Error al procesar pago ${payment.id}:`, err);
        }
      }

      return {
        paymentsProcessed,
        totalAmount,
        errors,
        duration: Date.now() - start,
      };
    } catch (err) {
      errors += 1;
      console.error('[CronJobs] Error en pagos programados:', err);
      return {
        paymentsProcessed,
        totalAmount,
        errors,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Ejecuta deteccion de anomalias para todas las organizaciones con links activos.
   * Usa treasuryService.getTreasuryAlerts() por organizacion y genera notificaciones
   * para alertas de alta severidad.
   * @returns Reporte de deteccion de anomalias
   */
  static async runAnomalyDetection(): Promise<AnomalyReport> {
    const start = Date.now();
    let organizationsChecked = 0;
    let totalAnomalies = 0;
    let highSeverity = 0;
    let errors = 0;

    try {
      const organizationIds = await getOrganizationsWithActiveLinks();

      for (const orgId of organizationIds) {
        try {
          const alerts = await treasuryService.getTreasuryAlerts(orgId);
          organizationsChecked += 1;
          totalAnomalies += alerts.length;

          for (const alert of alerts as TreasuryAlertRow[]) {
            if (alert.severity === 'high') {
              highSeverity += 1;
              // Notificar alertas de alta severidad
              await createNotification(orgId, {
                type: 'open_finance_anomaly',
                alert_type: alert.type,
                message: alert.message,
                severity: alert.severity,
              });
            }
          }
        } catch (err) {
          errors += 1;
          console.error(`[CronJobs] Error al detectar anomalias org ${orgId}:`, err);
        }
      }

      return {
        organizationsChecked,
        totalAnomalies,
        highSeverity,
        errors,
        duration: Date.now() - start,
      };
    } catch (err) {
      errors += 1;
      console.error('[CronJobs] Error en deteccion de anomalias:', err);
      return {
        organizationsChecked,
        totalAnomalies,
        highSeverity,
        errors,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Verifica consentimientos proximos a expirar (7 dias) y marca los expirados.
   * Genera notificaciones para los que expiran pronto.
   * @returns Reporte de expiracion de consentimientos
   */
  static async runConsentExpiryCheck(): Promise<ConsentReport> {
    const start = Date.now();
    let expiringSoon = 0;
    let expired = 0;
    let notificationsSent = 0;
    let errors = 0;

    try {
      const supabase = getSupabaseAdmin();
      const now = new Date();
      const threshold = new Date();
      threshold.setDate(threshold.getDate() + CONSENT_EXPIRY_THRESHOLD_DAYS);
      const nowIso = now.toISOString();
      const thresholdIso = threshold.toISOString();

      // Consentimientos activos proximos a expirar (<= 7 dias)
      const { data: expiringRows, error: expiringError } = await supabase
        .from('open_finance_consents')
        .select('id, organization_id, link_id, consent_type, purpose, expires_at, status')
        .eq('status', 'active')
        .lte('expires_at', thresholdIso)
        .gt('expires_at', nowIso);

      if (expiringError) {
        throw new Error(`Error al listar consentimientos por expirar: ${expiringError.message}`);
      }

      for (const consent of (expiringRows || []) as ConsentRow[]) {
        expiringSoon += 1;
        try {
          await createNotification(consent.organization_id, {
            type: 'open_finance_consent_expiring',
            consent_id: consent.id,
            consent_type: consent.consent_type,
            purpose: consent.purpose,
            expires_at: consent.expires_at,
          });
          notificationsSent += 1;
        } catch (err) {
          errors += 1;
          console.error(`[CronJobs] Error al notificar consentimiento ${consent.id}:`, err);
        }
      }

      // Consentimientos activos cuya expiracion ya paso: marcar como expired
      const { data: expiredRows, error: expiredError } = await supabase
        .from('open_finance_consents')
        .select('id, organization_id, link_id')
        .eq('status', 'active')
        .lte('expires_at', nowIso);

      if (expiredError) {
        errors += 1;
        console.error('[CronJobs] Error al listar consentimientos expirados:', expiredError.message);
      } else {
        const expiredList = (expiredRows || []) as ConsentRow[];
        for (const consent of expiredList) {
          try {
            const { error: updateError } = await supabase
              .from('open_finance_consents')
              .update({ status: 'expired' })
              .eq('id', consent.id);

            if (updateError) {
              errors += 1;
              console.error(`[CronJobs] Error al expirar consentimiento ${consent.id}:`, updateError.message);
            } else {
              expired += 1;
            }
          } catch (err) {
            errors += 1;
            console.error(`[CronJobs] Error al marcar expirado ${consent.id}:`, err);
          }
        }
      }

      return {
        expiringSoon,
        expired,
        notificationsSent,
        errors,
        duration: Date.now() - start,
      };
    } catch (err) {
      errors += 1;
      console.error('[CronJobs] Error en verificacion de consentimientos:', err);
      return {
        expiringSoon,
        expired,
        notificationsSent,
        errors,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Verifica el estado general de Open Finance.
   * Comprueba configuracion del proveedor, variables de entorno,
   * links activos, ultima sincronizacion y transacciones pendientes.
   * @returns Estado de salud general
   */
  static async getHealthStatus(): Promise<HealthStatus> {
    const errors: string[] = [];

    try {
      const supabase = getSupabaseAdmin();
      const provider = 'prometeo';
      const isConfigured = isProviderConfigured(provider);

      if (!isConfigured) {
        errors.push('PROMETEO_API_KEY no esta configurada');
      }

      // Contar links activos
      const { count: activeLinks, error: linksError } = await supabase
        .from('open_finance_links')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');

      if (linksError) {
        errors.push(`Error al contar links activos: ${linksError.message}`);
      }

      // Ultima sincronizacion (link activo mas reciente)
      const { data: lastLink, error: lastLinkError } = await supabase
        .from('open_finance_links')
        .select('last_sync_at')
        .eq('status', 'active')
        .order('last_sync_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastLinkError) {
        errors.push(`Error al obtener ultima sincronizacion: ${lastLinkError.message}`);
      }

      const lastSyncRow = lastLink as OpenFinanceLinkRow | null;

      // Transacciones pendientes de importar
      const { count: pendingTransactions, error: pendingError } = await supabase
        .from('open_finance_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('is_imported', false);

      if (pendingError) {
        errors.push(`Error al contar transacciones pendientes: ${pendingError.message}`);
      }

      return {
        provider,
        isConfigured,
        activeLinks: activeLinks ?? 0,
        lastSync: lastSyncRow?.last_sync_at ?? null,
        pendingTransactions: pendingTransactions ?? 0,
        errors,
      };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      return {
        provider: 'prometeo',
        isConfigured: false,
        activeLinks: 0,
        lastSync: null,
        pendingTransactions: 0,
        errors,
      };
    }
  }
}

/** Instancia singleton del servicio de cron jobs */
export const cronJobs = CronJobsService;
