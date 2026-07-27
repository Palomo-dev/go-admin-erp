import type { MonochromeRaster } from '@printing';

/**
 * Convierte el logo del negocio a un bitmap monocromo apto para impresoras
 * termicas (comando `GS v 0`).
 *
 * Por que se rasteriza aqui y no en el agente:
 *   El agente de escritorio no incluye ninguna libreria capaz de decodificar
 *   PNG o JPEG, y anadir una (sharp, jimp, canvas) significa un modulo nativo
 *   mas que compilar en cada equipo del cliente. El navegador, en cambio, ya
 *   sabe decodificar y escalar imagenes. Asi que el ERP hace el trabajo pesado
 *   una sola vez y el agente recibe bits listos para escupir por el puerto.
 *
 * El resultado se cachea en memoria porque el logo no cambia entre tickets y
 * el proceso implica una descarga por red.
 */

/** Alto maximo del logo impreso, en puntos (~12mm a 203dpi). */
const MAX_LOGO_HEIGHT_DOTS = 96;

/**
 * Umbral de luminancia para decidir si un pixel se imprime.
 *
 * 0.6 y no 0.5 porque los logos suelen venir sobre fondo blanco con
 * antialiasing: con el umbral en el centro, los bordes suavizados se pierden y
 * el logo sale descarnado.
 */
const LUMINANCE_THRESHOLD = 0.6;

const cache = new Map<string, MonochromeRaster | null>();

/**
 * Empaqueta los pixeles en bits (8 por byte, MSB primero) y los codifica en
 * base64, que es el formato que viaja en el JSON del `print_job`.
 */
function packToBase64(
  isBlack: (x: number, y: number) => boolean,
  width: number,
  height: number,
): string {
  const bytesPerRow = Math.ceil(width / 8);
  const bytes = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isBlack(x, y)) continue;
      const byteIndex = y * bytesPerRow + (x >> 3);
      // El bit mas significativo corresponde al pixel mas a la izquierda.
      bytes[byteIndex] |= 0x80 >> (x & 7);
    }
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Descarga la imagen respetando CORS. Se usa `crossOrigin = 'anonymous'`
 * porque sin el el canvas queda "tainted" y `getImageData` lanza una excepcion
 * de seguridad, que es el fallo mas habitual al rasterizar logos de un CDN.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar el logo: ${url}`));
    img.src = url;
  });
}

/**
 * Rasteriza el logo al ancho de papel indicado.
 *
 * `maxWidthDots` son los puntos del cabezal: 576 en 80mm, 384 en 58mm.
 * Devuelve `null` si el logo no existe, no carga o el navegador bloquea la
 * lectura del canvas. Nunca lanza: un ticket sin logo es preferible a un
 * ticket que no se imprime.
 */
export async function rasterizeLogo(
  logoUrl: string | undefined | null,
  maxWidthDots: number,
): Promise<MonochromeRaster | null> {
  if (!logoUrl || typeof window === 'undefined') return null;

  const cacheKey = `${logoUrl}@${maxWidthDots}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  try {
    const img = await loadImage(logoUrl);

    // Se escala para caber a la vez en el ancho del cabezal y en el alto
    // maximo, conservando la proporcion.
    const scale = Math.min(
      maxWidthDots / img.naturalWidth,
      MAX_LOGO_HEIGHT_DOTS / img.naturalHeight,
      1,
    );
    const width = Math.max(1, Math.floor(img.naturalWidth * scale));
    const height = Math.max(1, Math.floor(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D no disponible');

    // Fondo blanco explicito: un PNG con transparencia daria pixeles alfa 0
    // que, sin este relleno, se leerian como negro y saldria un rectangulo.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const { data } = ctx.getImageData(0, 0, width, height);

    const isBlack = (x: number, y: number): boolean => {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3] / 255;
      // Coeficientes de luminancia percibida (Rec. 709): un amarillo puro es
      // mucho mas claro que un azul puro aunque ambos saturen un canal.
      const luminance =
        (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      // Se compone sobre blanco segun el alfa antes de comparar.
      return alpha * luminance + (1 - alpha) < LUMINANCE_THRESHOLD;
    };

    const raster: MonochromeRaster = {
      width,
      height,
      data: packToBase64(isBlack, width, height),
    };

    cache.set(cacheKey, raster);
    return raster;
  } catch (error) {
    console.warn('No se pudo rasterizar el logo para impresion termica:', error);
    cache.set(cacheKey, null);
    return null;
  }
}

/** Vacia la cache. Util si el usuario cambia el logo de la organizacion. */
export function clearLogoRasterCache(): void {
  cache.clear();
}
