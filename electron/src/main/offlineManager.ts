import { app, session, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

const SHELL_DIR = 'cache';
const SHELL_FILE = 'app-shell.html';
const ASSETS_DIR = 'assets';

let shellDirPath = '';
let assetsDirPath = '';

/**
 * Inicializa el manager offline.
 * - Crea directorios de cache
 * - Registra protocolo goadmin-cache:// para servir contenido offline
 * - Intercepta respuestas para cachear assets
 */
export function initOfflineManager(): void {
  shellDirPath = path.join(app.getPath('userData'), SHELL_DIR);
  assetsDirPath = path.join(shellDirPath, ASSETS_DIR);

  if (!fs.existsSync(shellDirPath)) {
    fs.mkdirSync(shellDirPath, { recursive: true });
  }
  if (!fs.existsSync(assetsDirPath)) {
    fs.mkdirSync(assetsDirPath, { recursive: true });
  }

  // Registrar protocolo personalizado para servir contenido cacheado offline
  protocol.handle('goadmin-cache', (request) => {
    const url = new URL(request.url);
    const filePath = path.join(shellDirPath, url.pathname);

    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath);
        const ext = path.extname(filePath);
        const mimeType = getMimeType(ext);
        return new Response(content, {
          headers: { 'Content-Type': mimeType },
        });
      }
    } catch (err) {
      console.error('[offline-manager] Error sirviendo cache:', err);
    }

    return new Response('Not found in cache', { status: 404 });
  });

  // Cachear respuestas de assets estáticos de Next.js
  session.defaultSession.webRequest.onCompleted(async (details) => {
    if (!net.online) return;
    if (details.statusCode !== 200) return;

    const url = details.url;
    // Solo cachear assets de Next.js (_next/static/) y el HTML principal
    if (shouldCache(url)) {
      try {
        await cacheResponse(url);
      } catch (err) {
        // Silenciar errores de cache individual
      }
    }
  });

  console.log('[offline-manager] Inicializado en', shellDirPath);
}

/**
 * Determina si una URL debe ser cacheada.
 */
function shouldCache(url: string): boolean {
  return (
    url.includes('/_next/static/') ||
    url.endsWith('.js') ||
    url.endsWith('.css') ||
    url.endsWith('.woff') ||
    url.endsWith('.woff2') ||
    url.endsWith('.ttf') ||
    url.endsWith('.ico') ||
    url.endsWith('.png') ||
    url.endsWith('.svg')
  );
}

/**
 * Descarga y cachea una respuesta a disco.
 */
async function cacheResponse(url: string): Promise<void> {
  try {
    const response = await net.fetch(url);
    if (!response.ok) return;

    const buffer = Buffer.from(await response.arrayBuffer());
    const fileName = hashUrl(url);
    const ext = getExtensionFromUrl(url);
    const filePath = path.join(assetsDirPath, `${fileName}${ext}`);

    fs.writeFileSync(filePath, buffer);
  } catch {
    // Silenciar errores individuales
  }
}

/**
 * Guarda el HTML del app shell a disco.
 */
export async function saveAppShell(html: string): Promise<void> {
  try {
    // Inyectar <base> tag para resolver URLs relativas cuando se carga offline
    const baseUrl = 'https://app.goadmin.io';
    const htmlWithBase = html.includes('<base ')
      ? html
      : html.replace('<head>', `<head><base href="${baseUrl}/">`);

    // Inyectar script de detección offline
    const offlineScript = `
<script>
(function() {
  if (!navigator.onLine) {
    var banner = document.createElement('div');
    banner.id = 'goadmin-offline-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#f59e0b;color:#1a1a2e;padding:8px 16px;font-family:system-ui;font-size:14px;font-weight:600;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.2)';
    banner.innerHTML = '⚠️ Sin conexión a internet — Modo offline (datos cacheados)';
    document.body.prepend(banner);
  }
  window.addEventListener('online', function() {
    var b = document.getElementById('goadmin-offline-banner');
    if (b) b.remove();
  });
  window.addEventListener('offline', function() {
    if (!document.getElementById('goadmin-offline-banner')) {
      var banner = document.createElement('div');
      banner.id = 'goadmin-offline-banner';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#f59e0b;color:#1a1a2e;padding:8px 16px;font-family:system-ui;font-size:14px;font-weight:600;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.2)';
      banner.innerHTML = '⚠️ Sin conexión a internet — Modo offline (datos cacheados)';
      document.body.prepend(banner);
    }
  });
})();
</script>`;

    const finalHtml = htmlWithBase.replace('</head>', `${offlineScript}</head>`);

    fs.writeFileSync(path.join(shellDirPath, SHELL_FILE), finalHtml, 'utf-8');
    console.log('[offline-manager] App shell guardado');
  } catch (err) {
    console.error('[offline-manager] Error guardando app shell:', err);
  }
}

/**
 * Obtiene el HTML cacheado del app shell.
 */
export function getCachedAppShell(): string | null {
  try {
    const filePath = path.join(shellDirPath, SHELL_FILE);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch (err) {
    console.error('[offline-manager] Error leyendo app shell:', err);
  }
  return null;
}

/**
 * Verifica si hay un app shell cacheado.
 */
export function hasCachedAppShell(): boolean {
  return fs.existsSync(path.join(shellDirPath, SHELL_FILE));
}

/**
 * Obtiene el path del archivo cacheado para una URL dada.
 */
export function getCachedAssetPath(url: string): string | null {
  const fileName = hashUrl(url);
  const ext = getExtensionFromUrl(url);
  const filePath = path.join(assetsDirPath, `${fileName}${ext}`);
  return fs.existsSync(filePath) ? filePath : null;
}

/**
 * Genera un hash simple para una URL.
 */
function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Obtiene la extensión de archivo desde una URL.
 */
function getExtensionFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const ext = path.extname(pathname);
    return ext || '.bin';
  } catch {
    return '.bin';
  }
}

/**
 * Obtiene el MIME type desde la extensión.
 */
function getMimeType(ext: string): string {
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.bin': 'application/octet-stream',
  };
  return types[ext] || 'application/octet-stream';
}

/**
 * Limpia el cache offline.
 */
export function clearOfflineCache(): void {
  try {
    if (fs.existsSync(shellDirPath)) {
      fs.rmSync(shellDirPath, { recursive: true, force: true });
      fs.mkdirSync(shellDirPath, { recursive: true });
      fs.mkdirSync(assetsDirPath, { recursive: true });
      console.log('[offline-manager] Cache limpiado');
    }
  } catch (err) {
    console.error('[offline-manager] Error limpiando cache:', err);
  }
}
