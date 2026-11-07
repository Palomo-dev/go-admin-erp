/**
 * Rutas de Tesorería (mapa `1009:86249`, ronda 3) y redirección de las viejas.
 *
 * «Tesorería» es el título del grupo del menú, no una página. Las rutas
 * nuevas viven bajo `/app/finanzas/tesoreria/`; las viejas responden con una
 * redirección del servidor y conservan su filtro, para que enlaces guardados,
 * favoritos y notificaciones sigan llegando.
 *
 * «Ingresos» y «Egresos» se quedan en sus rutas (decisión del dueño del
 * 2026-11-07): no se redirigen.
 */

export const RUTAS_TESORERIA = {
  movimientos: '/app/finanzas/tesoreria/movimientos',
  ingresos: '/app/finanzas/ingresos',
  egresos: '/app/finanzas/egresos',
  cuentas: '/app/finanzas/tesoreria/cuentas',
  conciliacion: '/app/finanzas/tesoreria/conciliacion',
  transferencias: '/app/finanzas/tesoreria/transferencias',
} as const;

export const rutaCuentaBancaria = (id: number | string) => `${RUTAS_TESORERIA.cuentas}/${id}`;
export const rutaConciliacion = (id: string) => `${RUTAS_TESORERIA.conciliacion}/${id}`;
export const rutaTransferencia = (id: string) => `${RUTAS_TESORERIA.transferencias}/${id}`;
export const RUTA_NUEVA_CONCILIACION = `${RUTAS_TESORERIA.conciliacion}/nueva`;

export const PESTANAS_CUENTAS = ['cuentas', 'posicion', 'alertas'] as const;
export type PestanaCuentas = (typeof PESTANAS_CUENTAS)[number];

export const PESTANAS_CUENTA_BANCARIA = ['movimientos', 'extractos', 'conciliaciones', 'datos'] as const;
export type PestanaCuentaBancaria = (typeof PESTANAS_CUENTA_BANCARIA)[number];

type Parametros = Record<string, string | string[] | undefined>;

function uno(v: string | string[] | undefined): string | null {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === 'string' && x !== '' ? x : null;
}

const ENTERO = /^\d{1,12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Parámetros de lista que se conservan tal cual si son razonables. */
const CONSERVAR = ['q', 'desde', 'hasta', 'sucursal', 'cuenta', 'estado'] as const;
const VALOR_SEGURO = /^[\w .:@-]{1,80}$/u;

function conservar(params: Parametros, extra?: Record<string, string>): string {
  const q = new URLSearchParams();
  for (const k of CONSERVAR) {
    const v = uno(params[k]);
    if (v && VALOR_SEGURO.test(v)) q.set(k, v);
  }
  for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** `/app/finanzas/bancos?tab=…` → Cuentas de dinero (o Conciliación). */
export function destinoBancos(params: Parametros = {}): string {
  const tab = uno(params.tab);
  if (tab === 'conciliacion') return RUTAS_TESORERIA.conciliacion + conservar(params);
  if (tab === 'alertas' || tab === 'posicion') return RUTAS_TESORERIA.cuentas + conservar(params, { tab });
  return RUTAS_TESORERIA.cuentas + conservar(params);
}

/** `/bancos/tesoreria` (tesorería consolidada) → pestaña «Posición». */
export const destinoTesoreriaConsolidada = (params: Parametros = {}) => RUTAS_TESORERIA.cuentas + conservar(params, { tab: 'posicion' });

/** `/bancos/anomalias` → pestaña «Alertas». */
export const destinoAnomalias = (params: Parametros = {}) => RUTAS_TESORERIA.cuentas + conservar(params, { tab: 'alertas' });

/** `/bancos/cuentas/nuevo` → panel «Nueva cuenta bancaria» sobre Cuentas de dinero. */
export const destinoNuevaCuenta = () => `${RUTAS_TESORERIA.cuentas}?nueva=1`;

/**
 * `/bancos/cuentas/[id]` (y `?edit=true`) y `/bancos/cuentas/[id]/movimientos`
 * → detalle nuevo con su pestaña. Un id que no es número va a la lista.
 */
export function destinoCuentaBancaria(id: string, params: Parametros = {}, movimientos = false): string {
  if (!ENTERO.test(id)) return RUTAS_TESORERIA.cuentas;
  const tab = movimientos ? 'movimientos' : uno(params.edit) === 'true' ? 'datos' : null;
  return rutaCuentaBancaria(id) + conservar(params, tab ? { tab } : undefined);
}

/** `/conciliacion-bancaria`, `/nuevo` y `/[id]`. */
export function destinoConciliacion(id?: string | null, params: Parametros = {}): string {
  if (id === 'nuevo') return RUTA_NUEVA_CONCILIACION + conservar(params);
  if (id && UUID.test(id)) return rutaConciliacion(id);
  return RUTAS_TESORERIA.conciliacion + conservar(params);
}

/** `/transferencias` y `/transferencias/[id]`. */
export function destinoTransferencia(id?: string | null, params: Parametros = {}): string {
  if (id && UUID.test(id)) return rutaTransferencia(id);
  return RUTAS_TESORERIA.transferencias + conservar(params);
}
