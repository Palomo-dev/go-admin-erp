/**
 * Servicio de sincronizacion de transacciones Open Finance -> bank_transactions.
 * Orquesta la obtencion de movimientos desde el proveedor, su persistencia en
 * open_finance_transactions y la importacion hacia bank_transactions del ERP.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { openFinanceService } from './openFinanceService';
import { resolveTimezone } from '@/lib/services/timezoneResolver';
import { plainDayOfInstant } from '@/lib/services/businessInstant';
import { addPlainDays, todayInTz } from '@/lib/utils/timezone';
import type { OpenFinanceAccount, OpenFinanceLink, OpenFinanceTransaction } from './openFinanceTypes';

// ============================================================
// Fase B, tanda 9. Las ventanas de sincronizacion ("ultimos 30 dias", "desde
// la ultima sincronizacion hasta hoy") se calculaban en UTC. Dos consecuencias
// distintas, las dos silenciosas:
//
//   1. "Hasta hoy" en UTC deja fuera los movimientos del dia en curso en
//      cualquier zona por delante de UTC (Asia/Kathmandu va +05:45), y en
//      America adelanta el corte a las 19:00 del dia anterior.
//   2. Derivar el dia de `link.last_sync_at` —un **timestamptz**, verificado
//      en `information_schema.columns`— recortando su ISO se queda con el dia
//      UTC: una sincronizacion hecha a las 20:00 en Bogota se
//      reanudaba desde el dia SIGUIENTE y se perdian esas horas para siempre,
//      porque `last_sync_at` ya habia avanzado.
//
// `open_finance_links` lleva `organization_id` y no lleva `branch_id`, asi que
// la zona es la de la organizacion (ADR-003: identidad, no parametro). El link
// ya se consulta aqui, de modo que no hace falta cambiar ninguna firma.
// ============================================================

/** Estadisticas de sincronizacion de un link */
interface SyncStats {
  synced: number;
  imported: number;
  duplicates: number;
}

/** Estadisticas consolidadas de sincronizacion de multiples links */
interface SyncAllStats {
  linksProcessed: number;
  totalSynced: number;
  totalImported: number;
}

/** Estado de sincronizacion de un link */
interface SyncStatus {
  lastSyncAt: string | null;
  pendingTransactions: number;
  importedTransactions: number;
}

/** Resultado de importacion de una transaccion */
interface ImportResult {
  bankTransactionId: number;
}

export class TransactionSyncService {
  /**
   * Sincroniza transacciones de un link Open Finance.
   * 1. Obtiene movimientos desde el proveedor (getMovements).
   * 2. Los guarda en open_finance_transactions (saveTransactions).
   * 3. Importa las transacciones no importadas a bank_transactions.
   * @param linkId ID del link Open Finance
   * @param accountId ID opcional de cuenta especifica (si se omite, sincroniza todas las cuentas activas)
   * @param dateFrom Fecha inicial (YYYY-MM-DD). Default: hace 30 dias.
   * @param dateTo Fecha final (YYYY-MM-DD). Default: hoy.
   * @returns Estadisticas de sincronizacion
   */
  static async syncTransactions(
    linkId: string,
    accountId?: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<SyncStats> {
    try {
      const supabase = getSupabaseAdmin();

      // El link se consulta ANTES que nada porque de el sale la organizacion, y
      // de la organizacion la zona con la que se calculan las fechas por defecto.
      const { data: link, error: linkError } = await supabase
        .from('open_finance_links')
        .select('*')
        .eq('id', linkId)
        .single();

      if (linkError || !link) {
        throw new Error(`Link no encontrado: ${linkError?.message ?? 'no existe'}`);
      }

      if ((link as OpenFinanceLink).status !== 'active') {
        throw new Error('El link no esta activo');
      }

      // Fechas por defecto: ultimos 30 dias calendario de la organizacion.
      const timezone = await resolveTimezone(Number((link as OpenFinanceLink).organization_id));
      const defaultDateTo = todayInTz(timezone);
      const defaultDateFrom = addPlainDays(defaultDateTo, -30);

      const finalDateFrom = dateFrom ?? defaultDateFrom;
      const finalDateTo = dateTo ?? defaultDateTo;

      // Determinar las cuentas a sincronizar
      let accounts: OpenFinanceAccount[] = [];
      if (accountId) {
        const { data: acc, error: accError } = await supabase
          .from('open_finance_accounts')
          .select('*')
          .eq('id', accountId)
          .eq('is_active', true)
          .single();
        if (accError || !acc) {
          throw new Error(`Cuenta no encontrada: ${accError?.message ?? 'no existe'}`);
        }
        accounts = [acc as OpenFinanceAccount];
      } else {
        const { data: accs, error: accsError } = await supabase
          .from('open_finance_accounts')
          .select('*')
          .eq('link_id', linkId)
          .eq('is_active', true);
        if (accsError) throw new Error(`Error al obtener cuentas: ${accsError.message}`);
        accounts = (accs || []) as OpenFinanceAccount[];
      }

      if (accounts.length === 0) {
        return { synced: 0, imported: 0, duplicates: 0 };
      }

      let totalSynced = 0;
      let totalImported = 0;
      let totalDuplicates = 0;

      // Sincronizar cada cuenta
      for (const account of accounts) {
        // El proveedor requiere el external_account_id
        const externalAccountId = account.external_account_id;
        if (!externalAccountId) continue;

        // 1. Obtener movimientos desde el proveedor
        const movements = await openFinanceService.getMovements(
          linkId,
          externalAccountId,
          finalDateFrom,
          finalDateTo,
        );

        // 2. Guardar en open_finance_transactions
        const saveResult = await openFinanceService.saveTransactions(
          linkId,
          account.id,
          movements,
        );
        totalSynced += saveResult.imported;

        // 3. Importar transacciones no importadas a bank_transactions
        const { data: pendingTx, error: pendingError } = await supabase
          .from('open_finance_transactions')
          .select('id')
          .eq('link_id', linkId)
          .eq('account_id', account.id)
          .eq('is_imported', false);

        if (pendingError) {
          console.error('Error al obtener transacciones pendientes:', pendingError.message);
          continue;
        }

        for (const tx of pendingTx ?? []) {
          // Verificar duplicados antes de importar
          const { data: txData } = await supabase
            .from('open_finance_transactions')
            .select('external_transaction_id')
            .eq('id', tx.id)
            .single();

          const externalTxId = txData?.external_transaction_id ?? null;

          if (externalTxId) {
            const isDup = await this.detectDuplicates(linkId, account.id, externalTxId);
            if (isDup) {
              totalDuplicates++;
              // Marcar como importada para no reintentar
              await supabase
                .from('open_finance_transactions')
                .update({ is_imported: true, imported_at: new Date().toISOString() })
                .eq('id', tx.id);
              continue;
            }
          }

          const result = await this.importToBankTransactions(tx.id);
          if (result) {
            totalImported++;
          }
        }
      }

      // Actualizar last_sync_at del link
      await supabase
        .from('open_finance_links')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', linkId);

      return {
        synced: totalSynced,
        imported: totalImported,
        duplicates: totalDuplicates,
      };
    } catch (err) {
      throw new Error(
        `Error al sincronizar transacciones: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Importa una transaccion de open_finance_transactions a bank_transactions.
   * - Busca el bank_account_id vinculado en open_finance_accounts.
   * - Si no hay vinculo, busca por account_number en bank_accounts.
   * - Inserta en bank_transactions con import_source = 'open_finance'.
   * - Marca la transaccion OF como importada.
   * @param openFinanceTransactionId ID de la transaccion en open_finance_transactions
   * @returns ID de bank_transactions creado, o null si no se pudo importar
   */
  static async importToBankTransactions(
    openFinanceTransactionId: string,
  ): Promise<ImportResult | null> {
    try {
      const supabase = getSupabaseAdmin();

      // 1. Leer la transaccion desde open_finance_transactions
      const { data: tx, error: txError } = await supabase
        .from('open_finance_transactions')
        .select('*')
        .eq('id', openFinanceTransactionId)
        .single();

      if (txError || !tx) {
        console.error('Transaccion OF no encontrada:', txError?.message);
        return null;
      }

      const ofTx = tx as OpenFinanceTransaction;

      // Si ya fue importada, no reimportar
      // Nota: bank_transaction_id en BD es integer, el tipo lo define como string
      if (ofTx.is_imported && ofTx.bank_transaction_id) {
        return { bankTransactionId: Number(ofTx.bank_transaction_id) };
      }

      // 2. Buscar el bank_account_id vinculado en open_finance_accounts
      const { data: ofAccount, error: accError } = await supabase
        .from('open_finance_accounts')
        .select('*')
        .eq('id', ofTx.account_id)
        .single();

      if (accError || !ofAccount) {
        console.error('Cuenta OF no encontrada:', accError?.message);
        return null;
      }

      const ofAcc = ofAccount as OpenFinanceAccount;
      // Nota: bank_account_id en BD es integer, el tipo lo define como string
      let bankAccountId: number | null = ofAcc.bank_account_id ? Number(ofAcc.bank_account_id) : null;

      // 3. Si no hay bank_account_id, buscar por account_number en bank_accounts
      if (!bankAccountId && ofAcc.account_number) {
        const { data: bankAcc } = await supabase
          .from('bank_accounts')
          .select('id')
          .eq('organization_id', ofTx.organization_id)
          .eq('account_number', ofAcc.account_number)
          .eq('is_active', true)
          .maybeSingle();

        if (bankAcc) {
          bankAccountId = bankAcc.id as number;
          // Guardar el mapeo para futuras importaciones
          await supabase
            .from('open_finance_accounts')
            .update({ bank_account_id: bankAccountId })
            .eq('id', ofAcc.id);
        }
      }

      if (!bankAccountId) {
        console.error('No se encontro bank_account_id para la cuenta OF');
        return null;
      }

      // 4. Determinar tipo de transaccion segun el monto
      const transactionType = ofTx.amount >= 0 ? 'credit' : 'debit';

      // 5. Insertar en bank_transactions
      const { data: inserted, error: insertError } = await supabase
        .from('bank_transactions')
        .insert({
          organization_id: ofTx.organization_id,
          bank_account_id: bankAccountId,
          trans_date: ofTx.transaction_date,
          description: ofTx.description,
          amount: ofTx.amount,
          reference: ofTx.reference,
          transaction_type: transactionType,
          status: 'unmatched',
          import_source: 'open_finance',
          import_id: ofTx.external_transaction_id,
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Error al insertar en bank_transactions:', insertError.message);
        return null;
      }

      const bankTxId = inserted.id as number;

      // 6. Actualizar open_finance_transactions: is_imported, imported_at, bank_transaction_id
      await supabase
        .from('open_finance_transactions')
        .update({
          is_imported: true,
          imported_at: new Date().toISOString(),
          bank_transaction_id: bankTxId,
        })
        .eq('id', openFinanceTransactionId);

      return { bankTransactionId: bankTxId };
    } catch (err) {
      console.error(
        'Error al importar transaccion a bank_transactions:',
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }

  /**
   * Verifica si una transaccion ya existe (duplicado).
   * - Verifica en open_finance_transactions por external_transaction_id.
   * - Verifica en bank_transactions por import_id.
   * @param linkId ID del link
   * @param accountId ID de la cuenta OF
   * @param externalTransactionId ID externo de la transaccion
   * @returns true si ya existe (duplicado)
   */
  static async detectDuplicates(
    linkId: string,
    accountId: string,
    externalTransactionId: string,
  ): Promise<boolean> {
    try {
      const supabase = getSupabaseAdmin();

      // Verificar en open_finance_transactions
      const { data: ofExisting } = await supabase
        .from('open_finance_transactions')
        .select('id, is_imported')
        .eq('link_id', linkId)
        .eq('account_id', accountId)
        .eq('external_transaction_id', externalTransactionId)
        .eq('is_imported', true)
        .maybeSingle();

      if (ofExisting) return true;

      // Verificar en bank_transactions por import_id
      const { data: bankExisting } = await supabase
        .from('bank_transactions')
        .select('id')
        .eq('import_source', 'open_finance')
        .eq('import_id', externalTransactionId)
        .maybeSingle();

      if (bankExisting) return true;

      return false;
    } catch (err) {
      console.error(
        'Error al detectar duplicados:',
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  }

  /**
   * Sincroniza todos los links activos.
   * @param organizationId ID opcional de organizacion para filtrar
   * @returns Estadisticas consolidadas
   */
  static async syncAllLinks(organizationId?: number): Promise<SyncAllStats> {
    try {
      const supabase = getSupabaseAdmin();

      // Listar links activos
      let query = supabase
        .from('open_finance_links')
        .select('*')
        .eq('status', 'active');

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data: links, error: linksError } = await query;

      if (linksError) throw new Error(`Error al listar links: ${linksError.message}`);

      let linksProcessed = 0;
      let totalSynced = 0;
      let totalImported = 0;

      for (const linkRow of links ?? []) {
        const link = linkRow as OpenFinanceLink;
        try {
          // Fecha de ultima sincronizacion a hoy, en la zona de la
          // organizacion DUENA DEL LINK (no la de quien dispara el cron).
          const timezone = await resolveTimezone(Number(link.organization_id));
          const today = todayInTz(timezone);
          const lastSync = link.last_sync_at
            ? plainDayOfInstant(link.last_sync_at, timezone)
            : addPlainDays(today, -30);

          const stats = await this.syncTransactions(link.id, undefined, lastSync, today);
          linksProcessed++;
          totalSynced += stats.synced;
          totalImported += stats.imported;
        } catch (err) {
          console.error(`Error al sincronizar link ${link.id}:`, err);
        }
      }

      return {
        linksProcessed,
        totalSynced,
        totalImported,
      };
    } catch (err) {
      throw new Error(
        `Error al sincronizar todos los links: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Retorna el estado de sincronizacion de un link.
   * @param linkId ID del link
   * @returns Ultima sincronizacion, transacciones pendientes e importadas
   */
  static async getSyncStatus(linkId: string): Promise<SyncStatus> {
    try {
      const supabase = getSupabaseAdmin();

      // Obtener last_sync_at del link
      const { data: link, error: linkError } = await supabase
        .from('open_finance_links')
        .select('last_sync_at')
        .eq('id', linkId)
        .single();

      if (linkError) throw new Error(`Link no encontrado: ${linkError.message}`);

      // Contar transacciones pendientes de importar
      const { count: pendingCount, error: pendingError } = await supabase
        .from('open_finance_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('link_id', linkId)
        .eq('is_imported', false);

      if (pendingError) throw new Error(`Error al contar pendientes: ${pendingError.message}`);

      // Contar transacciones importadas
      const { count: importedCount, error: importedError } = await supabase
        .from('open_finance_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('link_id', linkId)
        .eq('is_imported', true);

      if (importedError) throw new Error(`Error al contar importadas: ${importedError.message}`);

      return {
        lastSyncAt: (link as OpenFinanceLink).last_sync_at,
        pendingTransactions: pendingCount ?? 0,
        importedTransactions: importedCount ?? 0,
      };
    } catch (err) {
      throw new Error(
        `Error al obtener estado de sincronizacion: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/** Instancia singleton del servicio */
export const transactionSyncService = TransactionSyncService;
