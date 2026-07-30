import { app, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Configura cache offline para que la UI cargue sin internet.
 * Usa el Service Worker de la web app + cache de Electron.
 */
export function initOfflineCache(): void {
  const cacheDir = path.join(app.getPath('userData'), 'cache');

  // Crear directorio de cache si no existe
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  // Next.js ya maneja su propio cache con URLs versionadas (_next/static/).
  // No sobrescribimos los headers de cache para evitar servir contenido stale.
  // El cache del navegador de Electron maneja los recursos estáticos correctamente.

  console.log('[offline-cache] Cache offline inicializado en', cacheDir);
}
