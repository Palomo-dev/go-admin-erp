/**
 * Scheduler de Automatización de Alertas
 * Ejecuta la evaluación automática de reglas de forma periódica
 * SCRUM-1220: Implementar creación automática según condiciones y umbrales
 */

import { runGlobalAlertAutomation, runAlertAutomation } from '../services/alertAutomationService';
import Logger from '../utils/logger';

interface SchedulerConfig {
  intervalMinutes: number;
  enabled: boolean;
  runOnStart: boolean;
}

class AlertScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private config: SchedulerConfig;
  
  constructor(config: SchedulerConfig = {
    intervalMinutes: 15, // Ejecutar cada 15 minutos por defecto
    enabled: true,
    runOnStart: false
  }) {
    this.config = config;
  }
  
  /**
   * Inicia el scheduler
   */
  start(): void {
    if (this.intervalId) {
      Logger.warn('ALERT_SCHEDULER', '⚠️ Scheduler ya está ejecutándose');
      return;
    }
    
    if (!this.config.enabled) {
      Logger.info('ALERT_SCHEDULER', '📴 Scheduler deshabilitado');
      return;
    }
    
    Logger.info('ALERT_SCHEDULER', `🚀 Iniciando scheduler de alertas (cada ${this.config.intervalMinutes} minutos)`);
    
    // Ejecutar inmediatamente si está configurado
    if (this.config.runOnStart) {
      this.executeAutomation().catch(error => {
        Logger.error('ALERT_SCHEDULER', '💥 Error en ejecución inicial:', error);
      });
    }
    
    // Configurar ejecución periódica
    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    this.intervalId = setInterval(() => {
      this.executeAutomation().catch(error => {
        Logger.error('ALERT_SCHEDULER', '💥 Error en ejecución programada:', error);
      });
    }, intervalMs);
    
    Logger.info('ALERT_SCHEDULER', '✅ Scheduler iniciado correctamente');
  }
  
  /**
   * Detiene el scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      Logger.info('ALERT_SCHEDULER', '🛑 Scheduler detenido');
    } else {
      Logger.warn('ALERT_SCHEDULER', '⚠️ Scheduler no estaba ejecutándose');
    }
  }
  
  /**
   * Ejecuta la automatización manualmente
   */
  async runNow(organizationId?: number): Promise<void> {
    Logger.info('ALERT_SCHEDULER', '🔧 Ejecutando automatización manual');
    
    if (organizationId) {
      await runAlertAutomation(organizationId);
    } else {
      await this.executeAutomation();
    }
  }
  
  /**
   * Ejecuta la automatización para todas las organizaciones
   */
  private async executeAutomation(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('ALERT_SCHEDULER', '⏳ Automatización ya en ejecución, saltando ciclo');
      return;
    }
    
    this.isRunning = true;
    const startTime = Date.now();
    
    try {
      Logger.info('ALERT_SCHEDULER', '🔄 Iniciando ciclo de automatización de alertas');
      
      const results = await runGlobalAlertAutomation();
      
      // Generar resumen de resultados
      let totalRules = 0;
      let totalAlerts = 0;
      let totalErrors = 0;
      
      Object.values(results).forEach(result => {
        totalRules += result.rules_evaluated;
        totalAlerts += result.alerts_generated;
        totalErrors += result.errors.length;
      });
      
      const executionTime = Date.now() - startTime;
      
      Logger.info('ALERT_SCHEDULER', '📈 Resumen del ciclo de automatización:');
      Logger.info('ALERT_SCHEDULER', `   🏢 Organizaciones procesadas: ${Object.keys(results).length}`);
      Logger.info('ALERT_SCHEDULER', `   📊 Reglas evaluadas: ${totalRules}`);
      Logger.info('ALERT_SCHEDULER', `   🚨 Alertas generadas: ${totalAlerts}`);
      Logger.info('ALERT_SCHEDULER', `   ❌ Errores totales: ${totalErrors}`);
      Logger.info('ALERT_SCHEDULER', `   ⏱️ Tiempo total: ${executionTime}ms`);
      
      // Log de errores si existen
      if (totalErrors > 0) {
        Object.entries(results).forEach(([orgId, result]) => {
          if (result.errors.length > 0) {
            Logger.error('ALERT_SCHEDULER', `Errores en organización ${orgId}:`);
            result.errors.forEach(error => {
              Logger.error('ALERT_SCHEDULER', `  - ${error}`);
            });
          }
        });
      }
      
    } catch (error) {
      Logger.error('ALERT_SCHEDULER', '💥 Error crítico en ciclo de automatización:', error);
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * Obtiene el estado actual del scheduler
   */
  getStatus(): {
    running: boolean;
    enabled: boolean;
    intervalMinutes: number;
    isExecuting: boolean;
  } {
    return {
      running: this.intervalId !== null,
      enabled: this.config.enabled,
      intervalMinutes: this.config.intervalMinutes,
      isExecuting: this.isRunning
    };
  }
  
  /**
   * Actualiza la configuración del scheduler
   */
  updateConfig(newConfig: Partial<SchedulerConfig>): void {
    const wasRunning = this.intervalId !== null;
    
    // Detener si está ejecutándose
    if (wasRunning) {
      this.stop();
    }
    
    // Actualizar configuración
    this.config = { ...this.config, ...newConfig };
    
    Logger.info('ALERT_SCHEDULER', '⚙️ Configuración actualizada:', this.config);
    
    // Reiniciar si estaba ejecutándose y sigue habilitado
    if (wasRunning && this.config.enabled) {
      this.start();
    }
  }
}

// Instancia singleton del scheduler
let schedulerInstance: AlertScheduler | null = null;

/**
 * Obtiene la instancia del scheduler (patrón singleton)
 */
export function getAlertScheduler(): AlertScheduler {
  if (!schedulerInstance) {
    // Configuración desde variables de entorno
    const config: SchedulerConfig = {
      intervalMinutes: parseInt(process.env.ALERT_SCHEDULER_INTERVAL || '15'),
      enabled: process.env.ALERT_SCHEDULER_ENABLED !== 'false',
      runOnStart: process.env.ALERT_SCHEDULER_RUN_ON_START === 'true'
    };
    
    schedulerInstance = new AlertScheduler(config);
  }
  
  return schedulerInstance;
}

/**
 * Inicializa el scheduler automáticamente si está habilitado
 */
export function initializeAlertScheduler(): void {
  const scheduler = getAlertScheduler();
  
  if (process.env.NODE_ENV === 'production' || process.env.ALERT_SCHEDULER_AUTO_START === 'true') {
    Logger.info('ALERT_SCHEDULER', '🔧 Inicializando scheduler automáticamente');
    scheduler.start();
  } else {
    Logger.info('ALERT_SCHEDULER', '💡 Scheduler disponible - usar getAlertScheduler().start() para iniciar');
  }
}

/**
 * Funciones de utilidad para control manual
 */
export const AlertSchedulerControl = {
  start: () => getAlertScheduler().start(),
  stop: () => getAlertScheduler().stop(),
  runNow: (orgId?: number) => getAlertScheduler().runNow(orgId),
  status: () => getAlertScheduler().getStatus(),
  configure: (config: Partial<SchedulerConfig>) => getAlertScheduler().updateConfig(config)
};
