/**
 * Recientes del buscador global: lo último que la persona abrió desde la
 * paleta, por usuario Y organización (cambiar de organización no enseña los
 * clientes de la otra). Vive en `localStorage`; toda lectura y escritura va
 * en try/catch porque el navegador puede bloquearlo (modo privado, datos de
 * sitio bloqueados) y la paleta debe funcionar igual sin recientes.
 *
 * Al pintarlos se filtran por las páginas que la persona ve HOY: si el
 * módulo se apagó o el cargo cambió, el reciente desaparece.
 */
import { rutaDentroDe } from './logica';
import { TIPOS_ENTIDAD, type TipoEntidad } from './definiciones';

export const MAX_RECIENTES = 5;
const PREFIJO = 'go-admin:buscador:recientes';

export type TipoReciente = 'page' | TipoEntidad;

export interface Reciente {
  tipo: TipoReciente;
  /** Id estable (id de la entidad o href de la página). */
  id: string;
  titulo: string;
  subtitulo?: string;
  url: string;
}

type Almacen = Pick<Storage, 'getItem' | 'setItem'>;

export function claveRecientes(usuarioId: string | null | undefined, organizacionId: number | string | null | undefined): string | null {
  if (!usuarioId || !organizacionId) return null;
  return `${PREFIJO}:${usuarioId}:${organizacionId}`;
}

const TIPOS_VALIDOS = new Set<string>(['page', ...TIPOS_ENTIDAD]);

function esReciente(v: unknown): v is Reciente {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.tipo === 'string' &&
    TIPOS_VALIDOS.has(r.tipo) &&
    typeof r.id === 'string' &&
    typeof r.titulo === 'string' &&
    typeof r.url === 'string' &&
    // Solo rutas internas de la app: un valor manipulado no puede llevar fuera.
    r.url.startsWith('/app/') &&
    (r.subtitulo === undefined || typeof r.subtitulo === 'string')
  );
}

export function leerRecientes(almacen: Almacen | null | undefined, clave: string | null): Reciente[] {
  if (!almacen || !clave) return [];
  try {
    const crudo = almacen.getItem(clave);
    if (!crudo) return [];
    const datos: unknown = JSON.parse(crudo);
    return Array.isArray(datos) ? datos.filter(esReciente).slice(0, MAX_RECIENTES) : [];
  } catch {
    return [];
  }
}

/** Pone `nuevo` primero, sin duplicar la misma URL, y recorta. */
export function agregarReciente(lista: readonly Reciente[], nuevo: Reciente, max = MAX_RECIENTES): Reciente[] {
  return [nuevo, ...lista.filter((r) => r.url !== nuevo.url)].slice(0, max);
}

export function guardarRecientes(almacen: Almacen | null | undefined, clave: string | null, lista: readonly Reciente[]): boolean {
  if (!almacen || !clave) return false;
  try {
    almacen.setItem(clave, JSON.stringify(lista.slice(0, MAX_RECIENTES)));
    return true;
  } catch {
    return false;
  }
}

/** Solo los que caen dentro de una página que la persona ve hoy. */
export function filtrarRecientes(lista: readonly Reciente[], hrefsVisibles: readonly string[]): Reciente[] {
  return lista.filter((r) => hrefsVisibles.some((h) => rutaDentroDe(r.url, h)));
}

/** `localStorage` o `null` si el navegador no deja tocarlo. */
export function almacenLocal(): Almacen | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}
