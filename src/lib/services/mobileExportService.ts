/**
 * Servicio de exportación móvil para Go Admin Mobile (Capacitor).
 *
 * En móvil: usa Filesystem para guardar archivos en el dispositivo + Share para compartir.
 * En web/desktop: fallback a descarga tradicional via <a> tag.
 */

import { isMobile, getMobilePlugin } from '@/lib/utils/mobile';

/**
 * Convierte un Blob a base64 (sin el prefijo data:).
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Quitar prefijo "data:application/pdf;base64," o similar
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Descarga un Blob en web usando <a> tag (comportamiento tradicional).
 */
function downloadBlobWeb(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Guarda un archivo en el dispositivo móvil y opcionalmente lo comparte.
 * En web/desktop: descarga tradicional via <a> tag.
 *
 * @param blob - El Blob del archivo (PDF, CSV, etc.)
 * @param filename - Nombre del archivo (ej: "reporte-ventas.pdf")
 * @param share - Si true, muestra el sheet de compartir después de guardar
 */
export async function saveFile(
  blob: Blob,
  filename: string,
  share = false,
): Promise<{ success: boolean; uri?: string; error?: string }> {
  if (!isMobile()) {
    downloadBlobWeb(blob, filename);
    return { success: true };
  }

  const filesystem = getMobilePlugin('Filesystem');
  const sharePlugin = getMobilePlugin('Share');

  if (!filesystem?.writeFile) {
    // Fallback a descarga web si no hay plugin
    downloadBlobWeb(blob, filename);
    return { success: true };
  }

  try {
    const base64Data = await blobToBase64(blob);
    const result = await filesystem.writeFile({
      path: `Downloads/${filename}`,
      data: base64Data,
      directory: 'DOCUMENTS',
      encoding: 'base64',
    });

    // Compartir si se solicita
    if (share && sharePlugin?.share) {
      try {
        await sharePlugin.share({
          title: filename,
          url: result.uri,
        });
      } catch (shareErr) {
        console.warn('[mobileExportService] Share cancelled or failed:', shareErr);
      }
    }

    return { success: true, uri: result.uri };
  } catch (error) {
    console.error('[mobileExportService] Error saving file:', error);
    return { success: false, error: 'save_error' };
  }
}

/**
 * Comparte un archivo directamente via sheet nativo (sin guardarlo primero).
 * En web/desktop: no-op (retorna { success: false }).
 *
 * @param filename - Nombre del archivo
 * @param base64Data - Datos en base64 (sin prefijo)
 * @param mimeType - Tipo MIME (ej: "application/pdf")
 */
export async function shareFile(
  filename: string,
  base64Data: string,
  _mimeType: string,
): Promise<{ success: boolean; error?: string }> {
  if (!isMobile()) {
    return { success: false, error: 'not_mobile' };
  }

  const sharePlugin = getMobilePlugin('Share');
  const filesystem = getMobilePlugin('Filesystem');

  if (!sharePlugin?.share || !filesystem?.writeFile) {
    return { success: false, error: 'plugin_not_available' };
  }

  try {
    // Primero guardar temporalmente, luego compartir
    const result = await filesystem.writeFile({
      path: `tmp/${filename}`,
      data: base64Data,
      directory: 'CACHE',
      encoding: 'base64',
    });

    await sharePlugin.share({
      title: filename,
      url: result.uri,
    });

    return { success: true };
  } catch (error) {
    console.error('[mobileExportService] Error sharing file:', error);
    return { success: false, error: 'share_error' };
  }
}
