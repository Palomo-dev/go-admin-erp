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
  maxHeightDots: number = MAX_LOGO_HEIGHT,
): raster is MonochromeRaster {
  if (!raster) return false;
  if (!Number.isInteger(raster.width) || raster.width <= 0) return false;
  if (!Number.isInteger(raster.height) || raster.height <= 0) return false;
  if (raster.width > maxWidthDots) return false;
  if (raster.height > maxHeightDots) return false;
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

/**
 * Alto maximo de una imagen de pagina completa (el rotulo de envio de 80 mm): ~50 cm de papel a
 * 203 ppp. Mas alto que esto es un error del ERP, no un rotulo.
 */
export const MAX_PAGE_RASTER_HEIGHT = 4000;

/** Filas por comando `GS v 0`: bandas cortas para no desbordar el bufer de impresoras modestas. */
const RASTER_BAND_ROWS = 128;

/**
 * Imprime una imagen alta (un rotulo completo) en bandas consecutivas de `GS v 0`. Cada banda
 * avanza el papel exactamente su alto, asi que no quedan costuras. Devuelve false (sin escribir
 * nada) si el raster no es valido o el dispositivo no acepta bytes crudos: quien llama imprime
 * entonces la version en texto.
 */
export function writeRasterPage(device: any, raster: MonochromeRaster | null | undefined, maxWidthDots: number): boolean {
  if (!isValidRaster(raster, maxWidthDots, MAX_PAGE_RASTER_HEIGHT)) return false;
  if (typeof device?.raw !== 'function') return false;
  const bytesPerRow = Math.ceil(raster.width / 8);
  const pixels = decodeBase64(raster.data);
  const commands: number[][] = [];
  for (let top = 0; top < raster.height; top += RASTER_BAND_ROWS) {
    const rows = Math.min(RASTER_BAND_ROWS, raster.height - top);
    const command = [GS, 0x76, 0x30, RASTER_MODE_NORMAL, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, rows & 0xff, (rows >> 8) & 0xff];
    const start = top * bytesPerRow;
    for (let i = 0; i < rows * bytesPerRow; i += 1) command.push(pixels[start + i] ?? 0x00);
    commands.push(command);
  }
  try {
    for (const command of commands) device.raw(typeof Buffer !== 'undefined' ? Buffer.from(command) : command);
    return true;
  } catch {
    return false;
  }
}

/** Codifica bytes en base64 sin `Buffer` ni `btoa` (mismo motivo que `decodeBase64`). */
function encodeBase64(bytes: number[]): string {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += ALPHABET[b0 >> 2] + ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? ALPHABET[b2 & 63] : '=';
  }
  return out;
}

/**
 * El raster como BMP monocromo (`data:image/bmp;base64,...`) para la impresora del sistema: la
 * pagina HTML muestra la MISMA imagen que la termica en lugar de otra plantilla. BMP de 1 bit
 * porque se arma a mano en pocas lineas (sin PNG ni zlib) y Chromium lo pinta sin problema.
 * Devuelve null si el raster no es valido.
 */
export function rasterToBmpDataUrl(raster: MonochromeRaster | null | undefined, maxWidthDots: number): string | null {
  if (!isValidRaster(raster, maxWidthDots, MAX_PAGE_RASTER_HEIGHT)) return null;
  const { width, height } = raster;
  const srcRow = Math.ceil(width / 8);
  const bmpRow = Math.ceil(srcRow / 4) * 4;
  const pixels = decodeBase64(raster.data);
  const header = 14 + 40 + 8;
  const size = header + bmpRow * height;
  const out: number[] = new Array(size).fill(0);
  const u16 = (o: number, v: number) => { out[o] = v & 0xff; out[o + 1] = (v >> 8) & 0xff; };
  const u32 = (o: number, v: number) => { u16(o, v & 0xffff); u16(o + 2, (v >>> 16) & 0xffff); };
  out[0] = 0x42; out[1] = 0x4d; // «BM»
  u32(2, size);
  u32(10, header);
  u32(14, 40);
  u32(18, width);
  u32(22, height); // positivo: filas de abajo hacia arriba
  u16(26, 1);
  u16(28, 1); // 1 bit por pixel
  u32(34, bmpRow * height);
  u32(38, 8000); // ~203 ppp en pixeles por metro
  u32(42, 8000);
  u32(46, 2);
  // Paleta: indice 0 = blanco, indice 1 = negro (asi el bit 1 del raster es tinta).
  out[54] = 0xff; out[55] = 0xff; out[56] = 0xff; out[57] = 0;
  out[58] = 0; out[59] = 0; out[60] = 0; out[61] = 0;
  for (let y = 0; y < height; y += 1) {
    const dst = header + (height - 1 - y) * bmpRow;
    for (let x = 0; x < srcRow; x += 1) out[dst + x] = pixels[y * srcRow + x] ?? 0;
  }
  return `data:image/bmp;base64,${encodeBase64(out)}`;
}
