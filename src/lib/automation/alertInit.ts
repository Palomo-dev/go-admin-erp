/**
 * Inicializador de Sistema de Alertas
 * Se ejecuta automáticamente al iniciar la aplicación Next.js
 */

import { initializeAlertScheduler } from './alertScheduler';
import Logger from '../utils/logger';

let initialized = false;

/**
 * Inicializa el sistema de alertas automático
 */
export function initializeAlertSystem() {
  if (initialized) {
    Logger.warn('ALERT_AUTOMATION', 'Sistema de alertas ya inicializado');
    return;
  }
  
  try {
    Logger.info('ALERT_AUTOMATION', '🚀 Inicializando sistema de alertas automático...');
    
    // Habilitar logging para alertas en desarrollo
    if (process.env.NODE_ENV === 'development') {
      Logger.enableDev();
      Logger.configure({
        enabled: true,
        level: 'INFO',
        contexts: ['ALERT_AUTOMATION', 'ALERT_SCHEDULER', 'ALERT_API'],
        showTimestamps: true
      });
    }
    
    // Inicializar el scheduler
    initializeAlertScheduler();
    
    initialized = true;
    Logger.info('ALERT_AUTOMATION', '✅ Sistema de alertas inicializado correctamente');
    
  } catch (error) {
    Logger.error('ALERT_AUTOMATION', '💥 Error inicializando sistema de alertas:', error);
  }
}

// Auto-inicialización en servidor (solo en producción o si está forzado)
if (typeof window === 'undefined') {
  // Verificar si debe auto-inicializar
  const shouldAutoInit = 
    process.env.NODE_ENV === 'production' || 
    process.env.ALERT_SYSTEM_AUTO_INIT === 'true';
  
  if (shouldAutoInit) {
    // Inicializar después de que Next.js esté completamente cargado
    setTimeout(() => {
      initializeAlertSystem();
    }, 2000);
  } else if (process.env.NODE_ENV === 'development') {
    Logger.info('ALERT_AUTOMATION', '💡 Sistema de alertas disponible - Usar initializeAlertSystem() para iniciar manualmente');
  }
}
