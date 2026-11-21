/**
 * Filtros del listado de devoluciones del POS con lista blanca. Lo que llega de
 * la URL se valida aquí y termina como parámetros de `pos_devoluciones_listado`
 * y `pos_devoluciones_cifras`: nunca se interpola en un `.or()` de PostgREST.
 * Módulo hoja (sin React ni Supabase), probado en
 * `src/__tests__/pos/devoluciones/listadoDevoluciones.test.ts`.
 */

export const ESTADOS_DEVOLUCION = ['processed', 'pending', 'cancelled'] as const;
export type EstadoDevolucion = (typeof ESTADOS_DEVOLUCION)[number];

/**
 * Método de reintegro guardado en `returns.refund_method` (`procesar_devolucion`):
 * `cash` sale de la caja abierta; `store_credit` queda como saldo a favor.
 * `sin_definir`: devolución anterior a la RPC (columna NULL).
 */
export const METODOS_REINTEGRO = ['cash', 'store_credit', 'sin_definir'] as const;
export type MetodoReintegro = (typeof METODOS_REINTEGRO)[number];

export const CAMPOS_ORDEN_DEVOLUCIONES = ['fecha', 'total', 'numero'] as const;
export type CampoOrdenDevoluciones = (typeof CAMPOS_ORDEN_DEVOLUCIONES)[number];

export const TAMANOS_DEVOLUCIONES = [10, 25, 50, 100] as const;
export const TAMANO_DEVOLUCIONES_DEFECTO = 25;

export interface FiltrosDevoluciones {
  busqueda: string | null;
  estados: EstadoDevolucion[];
  metodos: MetodoReintegro[];
  motivos: number[];
  /** Días calendario de la organización (YYYY-MM-DD), `hasta` incluido. */
  desde: string | null;
  hasta: string | null;
  orden: { campo: CampoOrdenDevoluciones; direccion: 'asc' | 'desc' };
  pagina: number;
  tamano: number;
}

type Valor = string | string[] | null | undefined;
type Crudo = Record<string, Valor>;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function lista(valor: Valor): string[] {
  if (valor == null) return [];
  const partes = (Array.isArray(valor) ? valor : [valor]).flatMap((v) => String(v).split(','));
  return [...new Set(partes.map((v) => v.trim()).filter(Boolean))];
}

function uno(valor: Valor): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v == null || v === '' ? null : String(v);
}

function fecha(valor: Valor): string | null {
  const v = uno(valor);
  if (!v || !FECHA.test(v)) return null;
  const [a, m, d] = v.split('-').map(Number);
  const diasDelMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return m >= 1 && m <= 12 && d >= 1 && d <= diasDelMes ? v : null;
}

/** Búsqueda limpia: sin caracteres de control, espacios colapsados, máx. 80. */
export function limpiarBusqueda(valor: Valor): string | null {
  const v = uno(valor);
  if (!v) return null;
  // eslint-disable-next-line no-control-regex
  const limpio = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return limpio || null;
}

function deLista<T extends string>(valores: readonly T[], valor: Valor): T[] {
  return lista(valor).filter((v): v is T => (valores as readonly string[]).includes(v));
}

export function filtrosDevoluciones(crudo: Crudo): FiltrosDevoluciones {
  const campo = uno(crudo.orden);
  const pagina = Math.floor(Number(uno(crudo.pagina) ?? 1));
  const tamano = Number(uno(crudo.tamano) ?? TAMANO_DEVOLUCIONES_DEFECTO);
  let desde = fecha(crudo.desde);
  let hasta = fecha(crudo.hasta);
  if (desde && hasta && hasta < desde) [desde, hasta] = [hasta, desde];
  return {
    busqueda: limpiarBusqueda(crudo.q),
    estados: deLista(ESTADOS_DEVOLUCION, crudo.estado),
    metodos: deLista(METODOS_REINTEGRO, crudo.metodo),
    motivos: lista(crudo.motivo)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 20),
    desde,
    hasta,
    orden: {
      campo: (CAMPOS_ORDEN_DEVOLUCIONES as readonly string[]).includes(campo ?? '') ? (campo as CampoOrdenDevoluciones) : 'fecha',
      direccion: uno(crudo.dir) === 'asc' ? 'asc' : 'desc',
    },
    pagina: Number.isFinite(pagina) && pagina >= 1 ? Math.min(pagina, 100000) : 1,
    tamano: (TAMANOS_DEVOLUCIONES as readonly number[]).includes(tamano) ? tamano : TAMANO_DEVOLUCIONES_DEFECTO,
  };
}

/** Parámetros comunes de filtro de las dos RPC. */
export function parametrosFiltroDevoluciones(
  f: FiltrosDevoluciones,
  extra: { organizacionId: number; sucursalId: number | null; desde: string | null; hasta: string | null },
) {
  return {
    p_organization_id: extra.organizacionId,
    p_branch_id: extra.sucursalId,
    p_desde: extra.desde,
    p_hasta: extra.hasta,
    p_busqueda: f.busqueda,
    p_estados: f.estados.length ? f.estados : null,
    p_metodos: f.metodos.length ? f.metodos : null,
    p_motivos: f.motivos.length ? f.motivos : null,
  };
}

export function parametrosListadoDevoluciones(
  f: FiltrosDevoluciones,
  extra: { organizacionId: number; sucursalId: number | null; desde: string | null; hasta: string | null },
) {
  return {
    ...parametrosFiltroDevoluciones(f, extra),
    p_orden: f.orden.campo,
    p_direccion: f.orden.direccion,
    p_limite: f.tamano,
    p_desplazamiento: (f.pagina - 1) * f.tamano,
  };
}
