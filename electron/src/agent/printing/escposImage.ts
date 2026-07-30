/* AUTO-GENERADO por sync-agent.js — NO EDITAR */
/**
 * Conversion de un bitmap monocromo a comandos ESC/POS.
 *
 * Este archivo solo genera BYTES. No descarga, no decodifica y no escala
 * imagenes: eso ocurre antes, en el ERP, donde hay un canvas disponible. Aqui
 * llega un `MonochromeRaster` ya resuelto y se traduce al comando que entiende
 * la impresora.
 *
 * Se mantiene la restriccion de la carpeta: TypeScript puro, sin Node ni DOM.
 */

import type { MonochromeRaster } from './types';

/**
 * `GS v 0` - imprimir raster bit image.
 *
 *   GS  v   0   m   xL  xH  yL  yH  [datos]
 *   1D  76  30  m   ..  ..  ..  ..
 *
 * `m = 0` es densidad normal (sin duplicar puntos). `xL/xH` es el ancho en
 * BYTES (no en pixeles) y `yL/yH` el alto en pixeles, ambos little-endian.
 *
 * Se eligio `GS v 0` y no `ESC *` porque el primero envia la imagen completa en
 * un solo comando, mientras que `ESC *` obliga a trocearla en bandas de 8 o 24
 * puntos y a intercalar avances de linea, lo que en la practica deja costuras
 * visibles entre bandas.
 */
const GS = 0x1d;
const RASTER_MODE_NORMAL = 0x00;

/** Limite de seguridad: mas alto que esto y el logo se come el ticket. */
const MAX_LOGO_HEIGHT = 256;

/**
 * Decodifica base64 a bytes sin depender de `Buffer` ni de `atob`.
 *
 * Se implementa a mano precisamente porque este archivo se compila tanto para
 * Node como para el navegador y cada entorno ofrece una API distinta.
 */
function decodeBase64(input: string): number[] {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i += 4) {
    const c0 = ALPHABET.indexOf(clean[i]);
    const c1 = ALPHABET.indexOf(clean[i + 1]);
    const c2 = ALPHABET.indexOf(clean[i + 2]);
    const c3 = ALPHABET.indexOf(clean[i + 3]);

    if (c0 < 0 || c1 < 0) break;

    bytes.push(((c0 << 2) | (c1 >> 4)) & 0xff);
    if (c2 >= 0) bytes.push(((c1 << 4) | (c2 >> 2)) & 0xff);
    if (c3 >= 0) bytes.push(((c2 << 6) | c3) & 0xff);
  }

  return bytes;
}

/**
 * Comprueba que el raster es coherente antes de mandarlo a la impresora.
 *
 * Importa porque un `GS v 0` con dimensiones que no cuadran con la longitud de
 * los datos deja a la impresora esperando bytes que nunca llegan: se queda
 * colgada y hay que apagarla para recuperarla.
 */
export function isValidRaster(
  raster: MonochromeRaster | null | undefined,
  maxWidthDots: number,
): raster is MonochromeRaster {
  if (!raster) return false;
  if (!Number.isInteger(raster.width) || raster.width <= 0) return false;
  if (!Number.isInteger(raster.height) || raster.height <= 0) return false;
  if (raster.width > maxWidthDots) return false;
  if (raster.height > MAX_LOGO_HEIGHT) return false;
  if (typeof raster.data !== 'string' || raster.data.length === 0) return false;

  const expectedBytes = Math.ceil(raster.width / 8) * raster.height;
  return decodeBase64(raster.data).length >= expectedBytes;
}

/**
 * Traduce el raster al comando `GS v 0` completo, listo para escribir en el
 * puerto de la impresora.
 *
 * Devuelve `[]` si el raster no es valido, de modo que el llamador pueda
 * concatenar sin comprobar nada y, en el peor caso, el ticket salga sin logo en
 * lugar de salir corrupto.
 */
export function buildRasterImageCommand(
  raster: MonochromeRaster | null | undefined,
  maxWidthDots: number,
): number[] {
  if (!isValidRaster(raster, maxWidthDots)) return [];

  const bytesPerRow = Math.ceil(raster.width / 8);
  const pixels = decodeBase64(raster.data);

  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = raster.height & 0xff;
  const yH = (raster.height >> 8) & 0xff;

  const command = [GS, 0x76, 0x30, RASTER_MODE_NORMAL, xL, xH, yL, yH];

  // Se recorta a la longitud exacta que declara la cabecera: si sobran bytes,
  // la impresora los interpretaria como texto y escupiria basura.
  const needed = bytesPerRow * raster.height;
  for (let i = 0; i < needed; i += 1) {
    command.push(pixels[i] ?? 0x00);
  }

  return command;
}

/**
 * Centra la siguiente imagen y la imprime en el dispositivo escpos.
 *
 * `device` es un `escpos.Printer`. Se accede a `.raw()` de forma defensiva
 * porque el metodo no existe en todas las versiones del paquete y un logo no
 * justifica romper la impresion del ticket entero.
 */
export function writeRasterImage(
  device: any,
  raster: MonochromeRaster | null | undefined,
  maxWidthDots: number,
): boolean {
  const command = buildRasterImageCommand(raster, maxWidthDots);
  if (command.length === 0) return false;

  try {
    if (typeof device.raw !== 'function') return false;
    // `Buffer` solo existe en Node, que es donde corre el agente. En el
    // navegador esta rama nunca se alcanza porque el ERP no habla ESC/POS.
    const payload = typeof Buffer !== 'undefined' ? Buffer.from(command) : command;
    device.raw(payload);
    return true;
  } catch {
    return false;
  }
}
