/**
 * Normalización de los valores de una fila del importador de leads.
 *
 * No hay reglas propias de teléfono ni de NIT: el teléfono pasa por `aE164`
 * (`src/lib/utils/telefono.ts`, libphonenumber con el país por defecto) y el
 * NIT por `calcularDv` (`src/lib/utils/nitDv.ts`, módulo 11 DIAN). Aquí solo se
 * adapta la celda (comillas de Excel, apóstrofo anti-fórmula, espacios).
 *
 * Módulo puro: sirve en navegador, servidor y tests.
 */

import { aE164 } from '@/lib/utils/telefono';
import { calcularDv } from '@/lib/utils/nitDv';
import { parseNumero } from '@/lib/inventario/importacion/texto';

/** Largo máximo de un valor de texto que se guarda (defensa ante celdas enormes). */
export const LARGO_MAXIMO_TEXTO = 500;

/**
 * Celda de texto limpia o `null`. Quita el apóstrofo inicial que ponen las
 * hojas y `celdaCsv` para neutralizar fórmulas (`'+57…` → `+57…`) y colapsa
 * espacios.
 */
export function textoLimpio(v: unknown, largo: number = LARGO_MAXIMO_TEXTO): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/^'/, '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, largo) : null;
}

/**
 * Teléfono a E.164 (`+573001234567`) o `null` si no es un número válido.
 * Acepta `+57 300 123 4567`, `3001234567` (móvil CO), `6041234567` (fijo CO
 * con el indicativo 60X), `573001234567`, `(604) 444 1234`…
 */
export function telefonoE164(v: unknown, pais: string = 'CO'): string | null {
  const s = textoLimpio(v, 40);
  if (!s) return null;
  return aE164(s, pais);
}

/** Dígitos del E.164 sin «+» (la forma que compara `normalizePhoneDigits`). */
export function digitosDe(e164: string): string {
  return e164.replace(/\D/g, '');
}

/**
 * Teléfonos escritos dentro de un texto libre (las notas del archivo suelen
 * decir «otros teléfonos: +57 310 555 0199»). Solo tramos que empiezan por
 * «+» y que `telefonoE164` acepta: un NIT, un precio o un año no llevan «+».
 * Orden de aparición, sin repetir.
 */
export function telefonosEnTexto(v: unknown, pais: string = 'CO'): string[] {
  const s = v === null || v === undefined ? '' : String(v);
  if (!s.includes('+')) return [];
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const m of s.matchAll(/\+\d{1,3}(?:[\s.\-]*\d){7,14}/g)) {
    const e164 = telefonoE164(m[0], pais);
    if (!e164 || vistos.has(e164)) continue;
    vistos.add(e164);
    salida.push(e164);
  }
  return salida;
}

/**
 * Une varios grupos de teléfonos, descarta el principal (aunque venga con
 * otro formato) y los repetidos. Un valor que no es un teléfono se conserva
 * tal cual: es lo que el archivo traía en una columna de teléfono.
 */
export function telefonosDistintos(principal: unknown, grupos: readonly (readonly string[])[], pais: string = 'CO'): string[] {
  const presentar = (raw: string) => telefonoE164(raw, pais) ?? raw.trim().replace(/\s+/g, ' ').slice(0, LARGO_MAXIMO_TEXTO);
  const vistos = new Set<string>();
  const principalLimpio = presentar(String(principal ?? ''));
  if (principalLimpio) vistos.add(principalLimpio);
  const salida: string[] = [];
  for (const grupo of grupos) {
    for (const raw of grupo) {
      const limpio = presentar(String(raw ?? ''));
      if (!limpio || vistos.has(limpio)) continue;
      vistos.add(limpio);
      salida.push(limpio);
    }
  }
  return salida;
}

const CORREO_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;

/** Correo en minúsculas o `null` si no tiene forma de correo. */
export function correoNormalizado(v: unknown): string | null {
  const s = textoLimpio(v, 254);
  if (!s) return null;
  const c = s.toLowerCase().replace(/^mailto:/, '');
  return CORREO_RE.test(c) ? c : null;
}

export interface NitNormalizado {
  /** Solo dígitos, sin DV. */
  numero: string;
  /** DV si vino y cuadra con el módulo 11; `null` si no vino o no cuadra. */
  dv: number | null;
  /** `false` si vino un DV que no corresponde al NIT. */
  dvValido: boolean | null;
}

/**
 * NIT colombiano. Con guion (`900123456-7`) el DV es lo que sigue al guion; si
 * no, el de la columna «DV» si se mapeó. Sin guion ni columna los dígitos son
 * el NIT completo: NO se adivina que el último sea el DV (un `9001234567` puede
 * ser cualquiera de las dos cosas) y el DV queda vacío.
 * `null` si no hay entre 5 y 15 dígitos.
 */
export function nitNormalizado(v: unknown, dvColumna?: unknown): NitNormalizado | null {
  const s = textoLimpio(v, 40);
  if (!s) return null;
  let numero: string;
  let dvTexto: string | null = null;
  if (s.includes('-')) {
    const [a, b] = s.split('-');
    numero = a.replace(/\D/g, '');
    dvTexto = (b ?? '').replace(/\D/g, '') || null;
  } else {
    numero = s.replace(/\D/g, '');
  }
  if (!dvTexto) dvTexto = textoLimpio(dvColumna, 4)?.replace(/\D/g, '') || null;
  if (numero.length < 5 || numero.length > 15) return null;
  if (!dvTexto || dvTexto.length !== 1) return { numero, dv: null, dvValido: dvTexto ? false : null };
  const dv = Number(dvTexto);
  const ok = calcularDv(numero) === dv;
  return { numero, dv: ok ? dv : null, dvValido: ok };
}

/**
 * Prioridad del archivo → banda ICP (`opportunities.icp_band`, que los gates de
 * etapa comparan contra `A|B|C`). Acepta A/B/C, 1/2/3 y alta/media/baja
 * (también en en/fr/pt). Cualquier otra cosa → `null` (queda como etiqueta).
 */
export function bandaDesdePrioridad(v: unknown): 'A' | 'B' | 'C' | null {
  const s = (textoLimpio(v, 20) ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!s) return null;
  if (['a', '1', 'alta', 'high', 'haute', 'alto'].includes(s)) return 'A';
  if (['b', '2', 'media', 'medium', 'moyenne', 'medio'].includes(s)) return 'B';
  if (['c', '3', 'baja', 'low', 'basse', 'baixa', 'bajo'].includes(s)) return 'C';
  return null;
}

/** Importe positivo o `null` («$ 1.200.000», «300», «3,000.50»). */
export function valorNumerico(v: unknown): number | null {
  const n = parseNumero(typeof v === 'string' ? v.replace(/^'/, '') : v);
  return n !== null && n >= 0 && Number.isFinite(n) ? n : null;
}

/** URL http(s) o `null`. Sin esquema se asume https (`negocio.com.co`). */
export function urlNormalizada(v: unknown): string | null {
  const s = textoLimpio(v, 300);
  if (!s) return null;
  const conEsquema = /^https?:\/\//i.test(s) ? s : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s) ? `https://${s}` : null;
  if (!conEsquema) return null;
  try {
    const u = new URL(conEsquema);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Fecha de una celda como texto. El lector de XLSX entrega las fechas como
 * serial de Excel (`45930` = 2025-09-30): ese número se pasa al día
 * calendario AAAA-MM-DD (aritmética de días, sin zona horaria: el serial ya
 * ES un día calendario). Cualquier otro texto se guarda tal cual.
 */
export function fechaDeCelda(v: unknown): string | null {
  const s = textoLimpio(v, 40);
  if (!s) return null;
  if (!/^\d{5}(\.\d+)?$/.test(s)) return s;
  const serial = Math.floor(Number(s));
  // 1955-01-01 … 2119-01-01: fuera de ahí es un número, no una fecha.
  if (serial < 20090 || serial > 80000) return s;
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
}

/** Lista de valores distintos (sin distinguir mayúsculas), limpios y sin vacíos. */
export function listaUnica(valores: readonly unknown[], largo: number = LARGO_MAXIMO_TEXTO): string[] {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const v of valores) {
    const t = textoLimpio(v, largo);
    if (!t || vistas.has(t.toLowerCase())) continue;
    vistas.add(t.toLowerCase());
    salida.push(t);
  }
  return salida;
}

/** Lista de etiquetas: separa por `;` `,` `|`, limpia y quita repetidas (sin distinguir mayúsculas). */
export function listaEtiquetas(valores: readonly unknown[]): string[] {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const v of valores) {
    for (const parte of String(v ?? '').split(/[;,|]/)) {
      const t = textoLimpio(parte, 60);
      if (!t) continue;
      const k = t.toLowerCase();
      if (vistas.has(k)) continue;
      vistas.add(k);
      salida.push(t);
    }
  }
  return salida;
}
