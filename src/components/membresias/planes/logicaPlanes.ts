/**
 * Planes de membresía (Figma B1 981:611296, B2 981:612094, B3 981:612770), sin React:
 * filtro y búsqueda locales, estado del plan, cifras de la cabecera, texto de acceso y rutas.
 *
 * El plan es la configuración operativa de un producto membresía (1:1). Se edita SOLO en el
 * formulario del producto; el precio es el del producto (P9).
 */
import type { PlanFila, ReglasPlan } from '@/lib/services/membresias/tipos';

export type FiltroPlanes = 'todos' | 'activos' | 'inactivos';

export const FILTROS_PLANES: readonly FiltroPlanes[] = ['todos', 'activos', 'inactivos'];

export function leerFiltroPlanes(v: string | null | undefined): FiltroPlanes {
  return (FILTROS_PLANES as readonly string[]).includes(v ?? '') ? (v as FiltroPlanes) : 'todos';
}

/** Estado para el badge: sin producto no se puede vender (no debería existir tras la migración). */
export type EstadoPlan = 'activo' | 'inactivo' | 'sin_producto';

export function estadoPlan(p: Pick<PlanFila, 'productId' | 'activo'>): EstadoPlan {
  if (!p.productId) return 'sin_producto';
  return p.activo ? 'activo' : 'inactivo';
}

export const TONO_ESTADO_PLAN: Readonly<Record<EstadoPlan, 'exito' | 'neutro' | 'advertencia'>> = {
  activo: 'exito',
  inactivo: 'neutro',
  sin_producto: 'advertencia',
};

/** Minúsculas y sin tildes, para buscar «basico» y encontrar «Básico». */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function filtrarPlanes(planes: readonly PlanFila[], filtro: { q?: string; estado?: FiltroPlanes }): PlanFila[] {
  const q = normalizar(filtro.q);
  const estado = filtro.estado ?? 'todos';
  return planes.filter((p) => {
    if (estado === 'activos' && estadoPlan(p) !== 'activo') return false;
    if (estado === 'inactivos' && estadoPlan(p) === 'activo') return false;
    if (!q) return true;
    return normalizar(p.nombre).includes(q) || normalizar(p.sku).includes(q);
  });
}

export interface ResumenPlanes {
  total: number;
  activos: number;
  inactivos: number;
  sinProducto: number;
  /** Membresías activas (vigentes) de todos los planes. */
  activas: number;
  /** Membresías vivas: activas, congeladas, en gracia y pendientes. */
  vivas: number;
}

export function resumenPlanes(planes: readonly PlanFila[]): ResumenPlanes {
  const r: ResumenPlanes = { total: planes.length, activos: 0, inactivos: 0, sinProducto: 0, activas: 0, vivas: 0 };
  for (const p of planes) {
    const e = estadoPlan(p);
    if (e === 'activo') r.activos += 1;
    else r.inactivos += 1;
    if (e === 'sin_producto') r.sinProducto += 1;
    r.activas += p.membresiasActivas;
    r.vivas += p.membresiasVivas;
  }
  return r;
}

/** Orden: activos primero, luego por nombre (el servidor ya ordena por nombre). */
export function ordenarPlanes(planes: readonly PlanFila[]): PlanFila[] {
  const peso: Record<EstadoPlan, number> = { activo: 0, inactivo: 1, sin_producto: 2 };
  return [...planes].sort((a, b) => peso[estadoPlan(a)] - peso[estadoPlan(b)] || a.nombre.localeCompare(b.nombre));
}

/**
 * Días del horario en texto compacto: tramos de 3 o más días seguidos como «lun–vie», el resto
 * separados por comas. `null` si son los 7 días o no hay días (sin restricción por día).
 */
export function textoDias(dias: readonly number[] | undefined, nombre: (iso: number) => string): string | null {
  const lista = Array.from(new Set((dias ?? []).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))).sort((a, b) => a - b);
  if (lista.length === 0 || lista.length === 7) return null;
  const tramos: number[][] = [];
  for (const d of lista) {
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo[ultimo.length - 1] === d - 1) ultimo.push(d);
    else tramos.push([d]);
  }
  return tramos
    .flatMap((t) => (t.length >= 3 ? [`${nombre(t[0])}–${nombre(t[t.length - 1])}`] : t.map(nombre)))
    .join(', ');
}

/** «05:00–10:00» si el horario tiene franja; `null` si es todo el día. */
export function textoFranja(horario: ReglasPlan['accessSchedule']): string | null {
  const d = typeof horario?.desde === 'string' ? horario.desde.slice(0, 5) : '';
  const h = typeof horario?.hasta === 'string' ? horario.hasta.slice(0, 5) : '';
  return d && h ? `${d}–${h}` : null;
}

// ── Rutas ──────────────────────────────────────────────────────────────────

export const RUTA_PLANES = '/app/membresias/planes';

export function rutaPlan(id: number): string {
  return `${RUTA_PLANES}/${id}`;
}

/** Botón «Nuevo plan»: el formulario de producto preselecciona Servicio › Membresía. */
export const RUTA_NUEVO_PLAN = '/app/inventario/productos/nuevo?tipo=servicio&servicio=membresia';

/** Las rutas de producto van por uuid (src/app/app/inventario/productos/[id] es el uuid). */
export function rutaProducto(uuid: string): string {
  return `/app/inventario/productos/${encodeURIComponent(uuid)}`;
}

export function rutaEditarProducto(uuid: string): string {
  return `${rutaProducto(uuid)}/editar`;
}
