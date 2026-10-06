/**
 * Utilidades puras de la lectura de catálogos: números de API, HTML → texto,
 * URLs y JSON tolerante.
 */

import type { Lector, OpcionesPeticion, RespuestaHttp } from './tipos';

/**
 * Número que viene de una API (formato de máquina: «12.50», 12.5, «12000»).
 * NO usa `parseNumero` del archivo: allí «12.000» son doce mil (Colombia) y
 * aquí, doce. `undefined` si no es un número positivo.
 */
export function numeroApi(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Entero en unidades menores (WooCommerce: «129900» con 2 decimales → 1299). */
export function desdeUnidadesMenores(v: unknown, decimales: unknown): number | undefined {
  const n = numeroApi(v);
  if (n === undefined) return undefined;
  const d = typeof decimales === 'number' && decimales >= 0 && decimales <= 4 ? decimales : 0;
  return Math.round((n / Math.pow(10, d)) * 100) / 100;
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodificarEntidades(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (todo, e: string) => {
    if (e[0] === '#') {
      const codigo = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(codigo) && codigo > 0 && codigo < 0x110000 ? String.fromCodePoint(codigo) : todo;
    }
    return ENTIDADES[e.toLowerCase()] ?? todo;
  });
}

/** Descripción HTML → texto legible (viñetas y saltos), recortada. */
export function htmlAPlano(html: unknown, max = 3000): string | undefined {
  if (typeof html !== 'string' || !html.trim()) return undefined;
  const texto = decodificarEntidades(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  if (!texto) return undefined;
  return texto.length > max ? `${texto.slice(0, max).trim()}…` : texto;
}

/** Origen (`https://tienda.com`) de una URL, o `null`. */
export function origenDe(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Mismo sitio: mismo host sin «www.». Evita que un sitemap nos mande a leer otro dominio. */
export function mismoSitio(a: string, b: string): boolean {
  try {
    const h = (u: string) => new URL(u).hostname.toLowerCase().replace(/^www\./, '');
    return h(a) === h(b);
  } catch {
    return false;
  }
}

/** URL absoluta a partir de una relativa. */
export function absoluta(valor: unknown, base: string): string | undefined {
  if (typeof valor !== 'string' || !valor.trim()) return undefined;
  const v = valor.trim().startsWith('//') ? `https:${valor.trim()}` : valor.trim();
  try {
    const u = new URL(v, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Añade parámetros a una URL que puede traer ya `?` (WooCommerce con `?rest_route=`). */
export function conParametros(url: string, params: Record<string, string | number>): string {
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  if (!q) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${q}`;
}

export function parsearJson(texto: string): unknown {
  try {
    return JSON.parse(texto.replace(/^﻿/, ''));
  } catch {
    return undefined;
  }
}

export function esJson(r: RespuestaHttp): boolean {
  const tipo = r.headers['content-type'] ?? '';
  return tipo.includes('json') || /^\s*[[{]/.test(r.texto);
}

/** GET (o POST) que devuelve JSON con estado 2xx, o `undefined`. */
export async function leerJson(lector: Lector, url: string, opciones?: OpcionesPeticion): Promise<{ datos: unknown; respuesta: RespuestaHttp } | undefined> {
  const r = await lector(url, { ...opciones, headers: { Accept: 'application/json', ...(opciones?.headers ?? {}) } });
  if (!r || r.status < 200 || r.status >= 300 || !esJson(r)) return undefined;
  const datos = parsearJson(r.texto);
  return datos === undefined ? undefined : { datos, respuesta: r };
}

/** Texto plano de un campo (string o número), o `undefined`. */
export function texto(v: unknown, max = 200): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return undefined;
  const s = decodificarEntidades(v).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : undefined;
}

export function sinRepetir<T>(lista: T[]): T[] {
  return Array.from(new Set(lista));
}

/** Mínimo de una lista de números opcionales. */
export function minimo(valores: Array<number | undefined>): number | undefined {
  const n = valores.filter((v): v is number => typeof v === 'number' && v > 0);
  return n.length ? Math.min(...n) : undefined;
}

export const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
