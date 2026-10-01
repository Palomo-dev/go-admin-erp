/**
 * Registro de Números Excluidos (RNE, CRC Colombia): lógica pura.
 *
 * El RNE es la lista de la CRC donde una persona inscribe su número para no
 * recibir comunicaciones comerciales (SMS, mensajería, correo y, desde la Ley
 * 2300 de 2023, llamadas comerciales o publicitarias). Quien hace prospección
 * está obligado a consultarlo antes de contactar.
 *
 * Flujo en el producto:
 *  1. El dueño descarga del RNE la lista de números excluidos (CSV o TXT).
 *  2. En la campaña pulsa «Verificar contra RNE» y la carga.
 *  3. El servidor normaliza los números, los guarda como excluidos de la
 *     organización, marca como omitidas las llamadas pendientes de esos
 *     números y deja constancia de la verificación con su vigencia.
 *  4. La cola se niega a marcar un lote de una campaña sin verificación vigente.
 *
 * Vigencia: `VIGENCIA_RNE_DIAS` = 30 días. Es una decisión de producto, no una
 * cifra de la norma: el RNE cambia a diario y la obligación es consultarlo antes
 * de contactar, así que una verificación vieja deja pasar a quien se inscribió
 * después. 30 días es el máximo que se acepta; conviene verificar cada semana.
 */

/** Días que vale una verificación contra el RNE (ver cabecera). */
export const VIGENCIA_RNE_DIAS = 30;

/** Tamaño máximo del archivo cargado (texto). */
export const MAX_BYTES_ARCHIVO_RNE = 8 * 1024 * 1024;

/** Máximo de números aceptados de un archivo (defensa ante un archivo equivocado). */
export const MAX_NUMEROS_RNE = 500_000;

const E164_RE = /^\+[1-9]\d{9,14}$/;

/**
 * Normaliza un número tal como viene del RNE o de la ficha del cliente a E.164.
 * Acepta: `3001234567`, `573001234567`, `+57 300 123 4567`, `6041234567` (fijo
 * con indicativo 60X), `+14155552671`. Devuelve `null` si no es un número
 * marcable (así una cabecera o una celda vacía no se cuela como número).
 */
export function normalizarNumeroRne(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const texto = String(raw).trim();
  if (!texto) return null;
  const conMas = texto.startsWith('+');
  const digitos = texto.replace(/\D/g, '');
  if (!digitos) return null;

  let e164: string;
  if (conMas) e164 = `+${digitos}`;
  else if (digitos.length === 12 && digitos.startsWith('57')) e164 = `+${digitos}`;
  else if (digitos.length === 10 && /^(3|60)/.test(digitos)) e164 = `+57${digitos}`;
  else if (digitos.length === 11 && digitos.startsWith('0') && /^0(3|60)/.test(digitos)) e164 = `+57${digitos.slice(1)}`;
  else return null;

  return E164_RE.test(e164) ? e164 : null;
}

export interface ResultadoLecturaRne {
  /** Números válidos y sin repetir, en E.164. */
  numeros: string[];
  /** Filas/celdas que parecían un número pero no se pudieron normalizar. */
  descartados: number;
}

/**
 * Lee el contenido de un CSV/TXT del RNE. No depende del orden de columnas: se
 * toma cada celda de cada línea (separadores `,` `;` tabulador o espacios) y se
 * queda con las que son un número marcable.
 */
export function leerArchivoRne(contenido: string): ResultadoLecturaRne {
  const vistos = new Set<string>();
  let descartados = 0;
  const lineas = contenido.replace(/^﻿/, '').split(/\r?\n/);
  for (const linea of lineas) {
    if (!linea.trim()) continue;
    for (const celda of linea.split(/[,;\t|]/)) {
      const limpia = celda.replace(/^["']|["']$/g, '').trim();
      if (!limpia) continue;
      // Solo cuenta como «descartado» algo que tenga pinta de número (una
      // fecha de la columna de inscripción no lo es).
      const esFecha = /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})(\D|$)/.test(limpia);
      const pareceNumero = !esFecha && /\d{7,}/.test(limpia.replace(/[\s\-()+.]/g, ''));
      const n = normalizarNumeroRne(limpia);
      if (n) vistos.add(n);
      else if (pareceNumero) descartados++;
      if (vistos.size > MAX_NUMEROS_RNE) {
        throw new Error(`El archivo trae más de ${MAX_NUMEROS_RNE} números: revisa que sea la lista del RNE.`);
      }
    }
  }
  return { numeros: Array.from(vistos), descartados };
}

export interface ObjetivoConTelefono {
  customer_id: string;
  phone: string | null;
}

/**
 * Separa los objetivos de la campaña que están en la lista de excluidos.
 * Un cliente sin teléfono normalizable no se marca como excluido aquí: el
 * despachador ya lo descarta por «teléfono no marcable».
 */
export function filtrarContraRne(
  objetivos: ObjetivoConTelefono[],
  excluidos: Iterable<string>
): { permitidos: ObjetivoConTelefono[]; excluidos: ObjetivoConTelefono[] } {
  const lista = new Set<string>(excluidos);
  const permitidos: ObjetivoConTelefono[] = [];
  const fuera: ObjetivoConTelefono[] = [];
  for (const o of objetivos) {
    const n = normalizarNumeroRne(o.phone);
    if (n && lista.has(n)) fuera.push(o);
    else permitidos.push(o);
  }
  return { permitidos, excluidos: fuera };
}

/** Fin de vigencia de una verificación hecha en `verificadaEn`. */
export function vigenciaRneHasta(verificadaEn: Date, dias: number = VIGENCIA_RNE_DIAS): Date {
  return new Date(verificadaEn.getTime() + dias * 24 * 60 * 60 * 1000);
}

/** ¿La verificación sigue vigente en `ahora`? Sin verificación → no. */
export function verificacionRneVigente(validaHasta: string | Date | null | undefined, ahora: Date = new Date()): boolean {
  if (!validaHasta) return false;
  const t = validaHasta instanceof Date ? validaHasta.getTime() : Date.parse(validaHasta);
  return Number.isFinite(t) && t > ahora.getTime();
}

/** La fecha sola no acredita una importación: el registro debe contener números. */
export function verificacionRneRegistradaVigente(
  registro: { valid_until: string; numbers_in_file: number; evidence_available?: boolean; audience_unchanged?: boolean } | null | undefined,
  ahora: Date = new Date(),
): boolean {
  return Boolean(registro && Number.isInteger(registro.numbers_in_file) &&
    registro.numbers_in_file > 0 && registro.evidence_available !== false && registro.audience_unchanged !== false &&
    verificacionRneVigente(registro.valid_until, ahora));
}
