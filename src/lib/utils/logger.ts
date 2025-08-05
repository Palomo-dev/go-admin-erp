/**
 * Sistema de logging controlado para GO Admin ERP
 * Permite controlar qué logs se muestran según el nivel y contexto
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
export type LogContext = 
  | 'NOTIFICATIONS' 
  | 'TASKS' 
  | 'ACTIVITIES' 
  | 'AUTH' 
  | 'PIPELINE' 
  | 'REALTIME'
  | 'UI'
  | 'GENERAL'
  | 'ALERT_AUTOMATION'
  | 'ALERT_SCHEDULER'
  | 'ALERT_API';

interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
  contexts: LogContext[];
  showTimestamps: boolean;
}

// Configuración por defecto
const DEFAULT_CONFIG: LoggerConfig = {
  enabled: process.env.NODE_ENV !== 'production',
  level: 'WARN', // Solo warnings y errores en desarrollo
  contexts: [], // Array vacío = todos los contextos deshabilitados
  showTimestamps: false
};

// Configuración actual (puede ser sobrescrita)
let currentConfig: LoggerConfig = { ...DEFAULT_CONFIG };

// Jerarquía de niveles
const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
};

// Colores para la consola
const LOG_COLORS: Record<LogLevel, string> = {
  DEBUG: '#6B7280', // Gray
  INFO: '#3B82F6',  // Blue
  WARN: '#F59E0B',  // Yellow
  ERROR: '#EF4444', // Red
  CRITICAL: '#DC2626' // Dark Red
};

// Iconos para cada nivel
const LOG_ICONS: Record<LogLevel, string> = {
  DEBUG: '🔍',
  INFO: 'ℹ️',
  WARN: '⚠️',
  ERROR: '❌',
  CRITICAL: '🚨'
};

class Logger {
  /**
   * Configurar el logger globalmente
   */
  static configure(config: Partial<LoggerConfig>) {
    currentConfig = { ...currentConfig, ...config };
  }

  /**
   * Verificar si se debe mostrar el log
   */
  private static shouldLog(level: LogLevel, context: LogContext): boolean {
    // Si logging está deshabilitado
    if (!currentConfig.enabled) return false;
    
    // Si el nivel es menor al configurado
    if (LOG_LEVELS[level] < LOG_LEVELS[currentConfig.level]) return false;
    
    // Si hay contextos específicos configurados y este no está incluido
    if (currentConfig.contexts.length > 0 && !currentConfig.contexts.includes(context)) {
      return false;
    }
    
    return true;
  }

  /**
   * Formatear el mensaje
   */
  private static formatMessage(level: LogLevel, context: LogContext, message: string): string {
    const timestamp = currentConfig.showTimestamps ? 
      `[${new Date().toLocaleTimeString()}] ` : '';
    
    return `${timestamp}${LOG_ICONS[level]} [${context}] ${message}`;
  }

  /**
   * Log debug
   */
  static debug(context: LogContext, message: string, ...args: any[]) {
    if (!this.shouldLog('DEBUG', context)) return;
    console.log(`%c${this.formatMessage('DEBUG', context, message)}`, 
      `color: ${LOG_COLORS.DEBUG}`, ...args);
  }

  /**
   * Log info
   */
  static info(context: LogContext, message: string, ...args: any[]) {
    if (!this.shouldLog('INFO', context)) return;
    console.log(`%c${this.formatMessage('INFO', context, message)}`, 
      `color: ${LOG_COLORS.INFO}`, ...args);
  }

  /**
   * Log warning
   */
  static warn(context: LogContext, message: string, ...args: any[]) {
    if (!this.shouldLog('WARN', context)) return;
    console.warn(`%c${this.formatMessage('WARN', context, message)}`, 
      `color: ${LOG_COLORS.WARN}`, ...args);
  }

  /**
   * Log error
   */
  static error(context: LogContext, message: string, ...args: any[]) {
    if (!this.shouldLog('ERROR', context)) return;
    console.error(`%c${this.formatMessage('ERROR', context, message)}`, 
      `color: ${LOG_COLORS.ERROR}`, ...args);
  }

  /**
   * Log critical
   */
  static critical(context: LogContext, message: string, ...args: any[]) {
    if (!this.shouldLog('CRITICAL', context)) return;
    console.error(`%c${this.formatMessage('CRITICAL', context, message)}`, 
      `color: ${LOG_COLORS.CRITICAL}`, ...args);
  }

  /**
   * Habilitar logging para desarrollo
   */
  static enableDev() {
    this.configure({
      enabled: true,
      level: 'INFO',
      contexts: ['NOTIFICATIONS', 'ACTIVITIES', 'TASKS'],
      showTimestamps: true
    });
  }

  /**
   * Habilitar solo errores y warnings
   */
  static enableProduction() {
    this.configure({
      enabled: true,
      level: 'WARN',
      contexts: [],
      showTimestamps: false
    });
  }

  /**
   * Deshabilitar completamente
   */
  static disable() {
    this.configure({
      enabled: false
    });
  }

  /**
   * Configuración para debugging específico
   */
  static enableDebug(contexts?: LogContext[]) {
    this.configure({
      enabled: true,
      level: 'DEBUG',
      contexts: contexts || ['NOTIFICATIONS', 'ACTIVITIES', 'TASKS', 'REALTIME'],
      showTimestamps: true
    });
  }
}

export default Logger;

// Funciones de conveniencia para retrocompatibilidad
export const log = {
  debug: (context: LogContext, message: string, ...args: any[]) => 
    Logger.debug(context, message, ...args),
  info: (context: LogContext, message: string, ...args: any[]) => 
    Logger.info(context, message, ...args),
  warn: (context: LogContext, message: string, ...args: any[]) => 
    Logger.warn(context, message, ...args),
  error: (context: LogContext, message: string, ...args: any[]) => 
    Logger.error(context, message, ...args),
  critical: (context: LogContext, message: string, ...args: any[]) => 
    Logger.critical(context, message, ...args)
};
