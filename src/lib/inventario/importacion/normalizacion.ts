/**
 * Traducción de los textos del archivo a los valores que admite la base.
 * Verificado contra el esquema (2026-09-24):
 *   - `products.unit_code` → FK a `units.code`: UN, KG, GR, ML, LT, PAQ, CAJ, PR, SV, CM, MT, M2, M3;
 *   - `products.station` CHECK: hot_kitchen · cold_kitchen · bar · cashier · all (o NULL).
 *     La plantilla anterior sugería «kitchen», que la base rechaza: se traduce a hot_kitchen;
 *   - `products.status` CHECK: active · inactive · discontinued · deleted;
 *   - `products.product_type` CHECK: product · service.
 */

import { normalizarNombre } from './texto';

export const UNIDADES = ['UN', 'KG', 'GR', 'ML', 'LT', 'PAQ', 'CAJ', 'PR', 'SV', 'CM', 'MT', 'M2', 'M3'] as const;
export type CodigoUnidad = (typeof UNIDADES)[number];

const ALIAS_UNIDAD: Record<string, CodigoUnidad> = {
  unidad: 'UN', unidades: 'UN', und: 'UN', un: 'UN', u: 'UN', unit: 'UN', pieza: 'UN', pza: 'UN', ea: 'UN',
  kilogramo: 'KG', kilogramos: 'KG', kg: 'KG', kilo: 'KG', kilos: 'KG',
  gramo: 'GR', gramos: 'GR', gr: 'GR', g: 'GR',
  litro: 'LT', litros: 'LT', lt: 'LT', l: 'LT',
  mililitro: 'ML', mililitros: 'ML', ml: 'ML',
  servicio: 'SV', sv: 'SV', service: 'SV',
  caja: 'CAJ', caj: 'CAJ', box: 'CAJ',
  paquete: 'PAQ', paq: 'PAQ', pack: 'PAQ',
  par: 'PR', pr: 'PR', pair: 'PR',
  metro: 'MT', metros: 'MT', mt: 'MT', m: 'MT',
  centimetro: 'CM', centimetros: 'CM', cm: 'CM',
  'metro cuadrado': 'M2', m2: 'M2',
  'metro cubico': 'M3', m3: 'M3',
};

export function unidadDesdeTexto(texto?: string): { codigo: CodigoUnidad; reconocida: boolean } {
  if (!texto?.trim()) return { codigo: 'UN', reconocida: true };
  const n = normalizarNombre(texto);
  const directo = UNIDADES.find((u) => u.toLowerCase() === n.replace(/\s/g, ''));
  if (directo) return { codigo: directo, reconocida: true };
  const alias = ALIAS_UNIDAD[n];
  return alias ? { codigo: alias, reconocida: true } : { codigo: 'UN', reconocida: false };
}

export type Estacion = 'hot_kitchen' | 'cold_kitchen' | 'bar' | 'cashier' | 'all';

export function estacionDesdeTexto(texto?: string): { estacion: Estacion | null; desconocida: boolean } {
  const n = normalizarNombre(texto);
  if (!n || n === 'none' || n === 'ninguna' || n === 'no') return { estacion: null, desconocida: false };
  if (['hot kitchen', 'kitchen', 'cocina', 'cocina caliente'].includes(n)) return { estacion: 'hot_kitchen', desconocida: false };
  if (['cold kitchen', 'cocina fria', 'fria'].includes(n)) return { estacion: 'cold_kitchen', desconocida: false };
  if (['bar', 'barra', 'bebidas'].includes(n)) return { estacion: 'bar', desconocida: false };
  if (['cashier', 'caja', 'cajero'].includes(n)) return { estacion: 'cashier', desconocida: false };
  if (['all', 'todas', 'todo'].includes(n)) return { estacion: 'all', desconocida: false };
  return { estacion: null, desconocida: true };
}

export type EstadoProducto = 'active' | 'inactive' | 'discontinued';

export function estadoDesdeTexto(texto?: string): { estado: EstadoProducto; desconocido: boolean } {
  const n = normalizarNombre(texto);
  if (!n || ['active', 'activo', 'activa', 'si', 'yes', 'actif', 'ativo'].includes(n)) return { estado: 'active', desconocido: false };
  if (['inactive', 'inactivo', 'inactiva', 'no', 'inactif', 'inativo'].includes(n)) return { estado: 'inactive', desconocido: false };
  if (['discontinued', 'descontinuado', 'discontinuado'].includes(n)) return { estado: 'discontinued', desconocido: false };
  return { estado: 'active', desconocido: true };
}

export function tipoDesdeTexto(texto?: string): 'product' | 'service' {
  return /serv/i.test(texto ?? '') ? 'service' : 'product';
}

/**
 * «Datos de variante»: JSON de un objeto plano (`{"color":"azul"}`) o pares
 * «color:azul,talla:M». `null` si trae algo pero no se entiende; `{}` si viene vacío.
 */
export function parsearVariante(texto?: string): Record<string, string> | null {
  const t = texto?.trim();
  if (!t) return {};
  if (t.startsWith('{')) {
    try {
      const obj = JSON.parse(t) as unknown;
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const limpio: Record<string, string> = {};
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          if (k.trim() && v !== null && v !== undefined && String(v).trim()) limpio[k.trim()] = String(v).trim();
        }
        return limpio;
      }
    } catch {
      return null;
    }
    return null;
  }
  const pares: Record<string, string> = {};
  for (const par of t.split(/[,;]/)) {
    const i = par.indexOf(':');
    if (i <= 0) continue;
    const k = par.slice(0, i).trim();
    const v = par.slice(i + 1).trim();
    if (k && v) pares[k] = v;
  }
  return Object.keys(pares).length ? pares : null;
}

export interface OpcionModificador {
  nombre: string;
  precio: number;
}

export interface GrupoModificador {
  nombre: string;
  modo: 'single' | 'multiple';
  min: number;
  max: number | null;
  requerido: boolean;
  opciones: OpcionModificador[];
}

/**
 * «Tamaños|single|1|1|true|Pequeño=0,Mediano=5,Grande=10; Leche|multiple|0|2|false|Entera=0»
 * (mismo formato que la plantilla y la exportación). Los grupos mal formados se descartan.
 */
export function parsearModificadores(texto?: string): GrupoModificador[] {
  if (!texto?.trim()) return [];
  const grupos: GrupoModificador[] = [];
  for (const bruto of texto.split(';')) {
    const partes = bruto.split('|');
    if (partes.length < 6) continue;
    const nombre = partes[0].trim();
    const modo = partes[1].trim().toLowerCase() === 'multiple' ? 'multiple' : 'single';
    const min = Math.max(0, parseInt(partes[2].trim() || '0', 10) || 0);
    const maxTxt = partes[3].trim();
    const max = maxTxt ? parseInt(maxTxt, 10) : null;
    const req = ['true', 'si', 'sí', '1', 'yes'].includes(partes[4].trim().toLowerCase());
    const opciones: OpcionModificador[] = [];
    for (const op of partes.slice(5).join('|').split(',')) {
      const t = op.trim();
      if (!t) continue;
      const i = t.indexOf('=');
      const n = (i === -1 ? t : t.slice(0, i)).trim();
      const precio = i === -1 ? 0 : Number(t.slice(i + 1).trim().replace(',', '.')) || 0;
      if (n) opciones.push({ nombre: n, precio });
    }
    if (nombre && opciones.length) grupos.push({ nombre, modo, min, max: max !== null && Number.isFinite(max) ? max : null, requerido: req, opciones });
  }
  return grupos;
}

/** Lista separada por «;» (etiquetas, proveedores), sin vacíos ni repetidos. */
export function separarLista(texto?: string): string[] {
  if (!texto) return [];
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const parte of texto.split(';')) {
    const t = parte.trim();
    const k = normalizarNombre(t);
    if (t && k && !vistos.has(k)) {
      vistos.add(k);
      out.push(t);
    }
  }
  return out;
}

/** URLs de imágenes separadas por «;», coma, espacio o salto de línea. Solo http(s). */
export function separarUrls(texto?: string): { validas: string[]; invalidas: string[] } {
  const validas: string[] = [];
  const invalidas: string[] = [];
  if (!texto) return { validas, invalidas };
  for (const parte of texto.split(/[;\s]+|,(?=\s*https?:)/)) {
    const t = parte.trim();
    if (!t) continue;
    try {
      const u = new URL(t);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        if (!validas.includes(u.toString())) validas.push(u.toString());
      } else invalidas.push(t);
    } catch {
      invalidas.push(t);
    }
  }
  return { validas, invalidas };
}
