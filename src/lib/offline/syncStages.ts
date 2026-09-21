/**
 * Etapas de sincronización del Desktop (fase 4F), en el orden acordado:
 *
 *   10 clientes → 20 caja (aperturas) → 30 ventas → 40 caja (movimientos y cierres)
 *
 * `registerDefaultSyncStages()` es idempotente: registrar el mismo nombre
 * sustituye la etapa. `salesSync` sigue teniendo su propio arranque
 * (`startSalesSync`, que además sincroniza clientes antes de cada venta);
 * las dos vías comparten las promesas en vuelo de cada módulo, así que no
 * se pisan. Si `salesSync` prefiere registrarse a sí mismo, la línea es:
 *
 *   registerSyncStage('sales', (o) => syncPendingSales({ force: o.force, now: o.now }), 30);
 */

import { syncCashMovementsAndClosings, syncCashOpenings } from './cashSync';
import { syncPendingCustomers } from './customersSync';
import { syncPendingSales } from './salesSync';
import { registerSyncStage, startSyncOrchestrator } from './syncOrchestrator';

export const SYNC_STAGE_ORDER = {
  customers: 10,
  cashOpenings: 20,
  sales: 30,
  cashMovementsAndClosings: 40,
} as const;

let registered = false;

export function registerDefaultSyncStages(): void {
  if (registered) return;
  registered = true;
  registerSyncStage('customers', (o) => syncPendingCustomers({ force: o.force, now: o.now }), SYNC_STAGE_ORDER.customers);
  registerSyncStage('cash:openings', (o) => syncCashOpenings({ force: o.force, now: o.now }), SYNC_STAGE_ORDER.cashOpenings);
  registerSyncStage('sales', (o) => syncPendingSales({ force: o.force, now: o.now }), SYNC_STAGE_ORDER.sales);
  registerSyncStage('cash:movements-closings', (o) => syncCashMovementsAndClosings({ force: o.force, now: o.now }), SYNC_STAGE_ORDER.cashMovementsAndClosings);
}

/**
 * Arranque único desde el POS: registra las etapas y engancha el orquestador
 * a la conectividad real del Desktop. Devuelve la baja del orquestador.
 * Fuera del Desktop no hace nada.
 */
export function startOfflineSync(): () => void {
  registerDefaultSyncStages();
  return startSyncOrchestrator();
}

/** Solo para tests. */
export function __resetSyncStagesForTests(): void {
  registered = false;
}
