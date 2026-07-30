import { app, crashReporter } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

let logBuffer: string[] = [];
const MAX_LOG_LINES = 500;

function getLogPath(): string {
  return path.join(app.getPath('userData'), 'agent.log');
}

export function initCrashReporter(): void {
  // Crash reporter nativo de Electron
  crashReporter.start({
    productName: 'Go Admin Desktop',
    companyName: 'GO Admin',
    submitURL: 'https://app.goadmin.io/api/crash-report',
    uploadToServer: false, // No enviar automáticamente, solo registrar localmente
    compress: true,
  });

  // Capturar excepciones no manejadas
  process.on('uncaughtException', (err) => {
    const msg = `[CRASH ${new Date().toISOString()}] Uncaught: ${err.stack || err.message}\n`;
    logBuffer.push(msg);
    flushLog();
    console.error(msg);
  });

  process.on('unhandledRejection', (reason) => {
    const msg = `[CRASH ${new Date().toISOString()}] Unhandled rejection: ${String(reason)}\n`;
    logBuffer.push(msg);
    flushLog();
    console.error(msg);
  });

  console.log('[crashReporter] Inicializado');
}

export function appendLog(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`;
  logBuffer.push(line);
  if (logBuffer.length > MAX_LOG_LINES) {
    logBuffer = logBuffer.slice(-MAX_LOG_LINES);
  }
}

export function flushLog(): void {
  if (logBuffer.length === 0) return;
  try {
    const logPath = getLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, logBuffer.join('') + '\n');
    logBuffer = [];
  } catch (err) {
    console.warn('[crashReporter] No se pudo escribir log:', err);
  }
}

export function readLog(): string {
  try {
    const logPath = getLogPath();
    if (fs.existsSync(logPath)) {
      return fs.readFileSync(logPath, 'utf-8');
    }
  } catch {}
  return '';
}

export function clearLog(): void {
  try {
    const logPath = getLogPath();
    if (fs.existsSync(logPath)) fs.rmSync(logPath, { force: true });
  } catch {}
}
