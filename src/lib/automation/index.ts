/**
 * Módulo de Automatización - Exports Centralizados
 * Sistema completo de schedulers y automatización de alertas
 */

// Inicializador del sistema
export { initializeAlertSystem } from './alertInit';

// Scheduler principal
export { 
  initializeAlertScheduler,
  getAlertScheduler,
  AlertSchedulerControl
} from './alertScheduler';
