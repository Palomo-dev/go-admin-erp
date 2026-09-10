import { registerJobHandler } from '../registry';
import { automationJobHandler } from './automation';
import { sequenceStepJobHandler } from './sequenceStep';
import { timeEventsJobHandler } from './timeEvents';
import { registerAutomationEngineListeners } from '@/lib/services/crm/automation/automationEngine';

/**
 * Registro (side-effect) de FASE-08: handlers `automation`, `sequence_step` y
 * `time_events` (barrido de respaldo, tester r2 N2) + listeners del outbox
 * (`crm_events`).
 *
 * Vive en su propio archivo porque `src/lib/jobs/handlers/index.ts` es un
 * archivo compartido entre fases (protocolo de la ola 2): el índice solo tiene
 * que añadir `import './f8Automations';`.
 *
 * Importar este módulo es idempotente: `registerJobHandler` sustituye la
 * entrada y `registerAutomationEngineListeners` lleva su propia guarda.
 */

let done = false;

export function registerF8JobHandlers(): void {
  if (done) return;
  done = true;
  registerJobHandler('automation', automationJobHandler);
  registerJobHandler('sequence_step', sequenceStepJobHandler);
  registerJobHandler('time_events', timeEventsJobHandler);
  registerAutomationEngineListeners();
}

registerF8JobHandlers();

export { automationJobHandler, sequenceStepJobHandler, timeEventsJobHandler };
