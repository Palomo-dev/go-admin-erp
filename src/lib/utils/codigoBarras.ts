/**
 * Códigos de barras: el único lugar del ERP que sabe calcular un dígito de
 * control, reconocer un formato o construir el código N de una numeración.
 *
 * Antes había dos copias del mismo generador (formulario nuevo y pestaña
 * Detalles) que inventaban 12 dígitos al azar: un EAN-13 formalmente válido
 * dentro del rango GS1 de otro fabricante y sin comprobar que no existiera.
 * Generar ahora es cosa del servidor (`codigos_barras_reservar` /
 * `codigos_barras_generar_faltantes`, correlativo con prefijo por
 * organización); aquí queda la parte pura, que es la misma que usa el
 * servidor (`fn_codigo_barras_construir`) para poder previsualizar.
 */

export type FormatoCodigo = 'ean13' | 'ean8' | 'code128';

/** Formatos con los que una organización numera sus códigos internos. */
export type FormatoNumeracion = 'ean13' | 'code128';

export interface ConfigNumeracion {
  formato: FormatoNumeracion;
  prefijo: string;
  siguiente: number;
  /** Longitud total del Code128 (prefijo incluido). */
  longitud: number;
}

/**
 * Prefijo por defecto: 20. GS1 reserva el rango 20–29 para numeración
 * interna (circulación restringida), así que un EAN-13 que empiece por 20 no
 * pisa el código de ningún fabricante.
 */
export const CONFIG_NUMERACION_POR_DEFECTO: ConfigNumeracion = {
  formato: 'ean13',
  prefijo: '20',
  siguiente: 1,
  longitud: 10,
};

/**
 * Dígito de control GS1 (EAN-8, EAN-13, UPC): pesos 3 y 1 alternos desde la
 * derecha. Recibe los dígitos SIN el de control.
 */
export function digitoControlGs1(cuerpo: string): number {
  if (!/^\d+$/.test(cuerpo)) throw new Error('Solo dígitos');
  let suma = 0;
  for (let i = 0; i < cuerpo.length; i++) {
    const d = cuerpo.charCodeAt(cuerpo.length - 1 - i) - 48;
    suma += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (suma % 10)) % 10;
}

export function esEan13Valido(codigo: string): boolean {
  return /^\d{13}$/.test(codigo) && digitoControlGs1(codigo.slice(0, 12)) === Number(codigo[12]);
}

export function esEan8Valido(codigo: string): boolean {
  return /^\d{8}$/.test(codigo) && digitoControlGs1(codigo.slice(0, 7)) === Number(codigo[7]);
}

/**
 * Code128 (juego B): ASCII imprimible 32–126, de 1 a 48 caracteres (tope
 * práctico de una etiqueta legible por lector).
 */
export function esCode128Valido(codigo: string): boolean {
  return codigo.length >= 1 && codigo.length <= 48 && /^[\x20-\x7E]+$/.test(codigo);
}

export type MotivoCodigoInvalido = 'vacio' | 'digitoControl' | 'caracteres' | 'largo';

export interface ResultadoValidacion {
  valido: boolean;
  /** Formato con el que se imprimirá (el más específico que cumple). */
  formato: FormatoCodigo | null;
  motivo?: MotivoCodigoInvalido;
  /** Si falla el dígito de control, el que correspondería. */
  digitoEsperado?: number;
}

/**
 * Valida un código escrito a mano. 13 u 8 dígitos se tratan como EAN (y su
 * dígito de control tiene que cuadrar: un error de tecleo ahí es el caso más
 * común). Cualquier otra cosa imprimible es Code128.
 */
export function validarCodigoBarras(entrada: string): ResultadoValidacion {
  const codigo = entrada.trim();
  if (!codigo) return { valido: false, formato: null, motivo: 'vacio' };
  if (/^\d{13}$/.test(codigo)) {
    const esperado = digitoControlGs1(codigo.slice(0, 12));
    return esperado === Number(codigo[12])
      ? { valido: true, formato: 'ean13' }
      : { valido: false, formato: 'ean13', motivo: 'digitoControl', digitoEsperado: esperado };
  }
  if (/^\d{8}$/.test(codigo)) {
    const esperado = digitoControlGs1(codigo.slice(0, 7));
    return esperado === Number(codigo[7])
      ? { valido: true, formato: 'ean8' }
      : { valido: false, formato: 'ean8', motivo: 'digitoControl', digitoEsperado: esperado };
  }
  if (codigo.length > 48) return { valido: false, formato: 'code128', motivo: 'largo' };
  if (!esCode128Valido(codigo)) return { valido: false, formato: 'code128', motivo: 'caracteres' };
  return { valido: true, formato: 'code128' };
}

/** Formato de impresión para un código ya guardado (sin validar de nuevo). */
export function formatoDeCodigo(codigo: string): FormatoCodigo {
  if (esEan13Valido(codigo)) return 'ean13';
  if (esEan8Valido(codigo)) return 'ean8';
  return 'code128';
}

/**
 * Código número `numero` de una numeración. Espejo exacto de
 * `fn_codigo_barras_construir` en la base de datos. `null` si no cabe.
 */
export function construirCodigo(cfg: ConfigNumeracion, numero: number): string | null {
  if (!Number.isInteger(numero) || numero < 0) return null;
  const prefijo = cfg.prefijo ?? '';
  const n = String(numero);
  if (cfg.formato === 'ean13') {
    if (!/^\d{0,10}$/.test(prefijo) || prefijo.length + n.length > 12) return null;
    const cuerpo = prefijo + n.padStart(12 - prefijo.length, '0');
    return cuerpo + digitoControlGs1(cuerpo);
  }
  if (prefijo.length + n.length > cfg.longitud) return null;
  return prefijo + n.padStart(cfg.longitud - prefijo.length, '0');
}

/** Los `cantidad` códigos siguientes (vista previa; no reserva nada). */
export function previsualizarCodigos(cfg: ConfigNumeracion, cantidad: number): string[] {
  const salida: string[] = [];
  for (let i = 0; i < cantidad; i++) {
    const c = construirCodigo(cfg, cfg.siguiente + i);
    if (!c) break;
    salida.push(c);
  }
  return salida;
}

export type ErrorPrefijo = 'ean13Digitos' | 'code128Caracteres' | 'noCabe';

/** Valida el prefijo de la numeración antes de guardarlo. */
export function validarPrefijo(cfg: ConfigNumeracion): ErrorPrefijo | null {
  const p = cfg.prefijo;
  if (cfg.formato === 'ean13' && !/^\d{1,10}$/.test(p)) return 'ean13Digitos';
  if (cfg.formato === 'code128' && !/^[A-Z0-9-]{0,10}$/.test(p)) return 'code128Caracteres';
  if (construirCodigo(cfg, cfg.siguiente) === null) return 'noCabe';
  return null;
}

/** «7 701234 567890»: el EAN-13 agrupado como se lee bajo las barras. */
export function agruparEan13(codigo: string): string {
  return /^\d{13}$/.test(codigo) ? `${codigo[0]} ${codigo.slice(1, 7)} ${codigo.slice(7)}` : codigo;
}

/** Opciones de JsBarcode para un código guardado. */
export function formatoJsBarcode(codigo: string): 'EAN13' | 'EAN8' | 'CODE128' {
  const f = formatoDeCodigo(codigo);
  return f === 'ean13' ? 'EAN13' : f === 'ean8' ? 'EAN8' : 'CODE128';
}
