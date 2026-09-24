/**
 * Liberar una mesa del POS: qué opciones hay según el saldo de su venta.
 *
 * Decisión del dueño (2026-09-23): «al liberar una mesa con saldo pendiente se
 * pida confirmación e información». Una sola definición para la pantalla (qué
 * ofrece el diálogo y por qué algo no está) y para la ruta
 * `/api/pos/mesas/[id]/liberar` (qué acepta). El saldo NO se calcula aquí: lo
 * da `fn_pos_mesa_saldo` en la base, la misma función que usa
 * `pos_mesa_liberar` dentro de su transacción. Esta capa solo decide.
 *
 * Módulo hoja, sin dependencias: lo importan el navegador, la ruta y los tests.
 */

export type AccionLiberacion = 'liberar' | 'cartera' | 'anular';

/** Por qué una opción no está disponible (también es el `codigo` de error de la ruta). */
export type MotivoNoDisponible =
  | 'sin_saldo'
  | 'saldo_pendiente'
  | 'sin_cliente'
  | 'venta_con_pagos'
  | 'venta_con_factura'
  | 'sin_permiso'
  | 'varias_ventas_con_saldo';

export interface VentaMesaSaldo {
  sale_id: string;
  estado: string;
  customer_id: string | null;
  branch_id: number | null;
  total: number;
  pagado: number;
  saldo: number;
  division: boolean;
  facturas: number;
  factura_saldo: number;
  factura_con_cliente: boolean;
}

export interface ItemCocinaPendiente {
  ticket_id: number;
  producto: string;
  cantidad: number;
  estado: 'pending' | 'in_progress' | 'ready' | string;
}

export interface ResumenLiberacion {
  mesa: { id: string; nombre: string; zona: string | null; estado: string };
  sesion: {
    id: string;
    estado: string;
    abierta_en: string | null;
    minutos_abierta: number;
    comensales: number | null;
    mesero: string | null;
  } | null;
  venta: VentaMesaSaldo | null;
  cliente: { id: string; nombre: string | null } | null;
  cocina: ItemCocinaPendiente[];
  otras_sesiones_con_saldo: number;
}

export interface OpcionLiberacion {
  disponible: boolean;
  motivo?: MotivoNoDisponible;
}

export interface DecisionLiberacion {
  /** Hay saldo: liberar sin más no está permitido. */
  requiereResolucion: boolean;
  saldo: number;
  /** Algo impide resolverlo desde el diálogo (hoy: dos ventas abiertas con saldo en la misma mesa). */
  bloqueo: MotivoNoDisponible | null;
  opciones: {
    liberar: OpcionLiberacion;
    cobrar: OpcionLiberacion;
    /** `existente`: la venta ya tiene factura con el saldo y el cliente, la cartera ya existe. */
    cartera: OpcionLiberacion & { modo?: 'crear' | 'existente' };
    anular: OpcionLiberacion;
  };
}

export interface PermisosLiberacion {
  /** `pos.void` (o administración), resuelto en el servidor. */
  puedeAnular: boolean;
}

export const MOTIVO_MIN = 3;
export const MOTIVO_MAX = 500;

/** Diferencia tolerada entre el saldo de la venta y el de su factura (redondeos). */
const TOLERANCIA = 0.5;

const no = (motivo: MotivoNoDisponible): OpcionLiberacion => ({ disponible: false, motivo });
const si: OpcionLiberacion = { disponible: true };

function numero(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function decidirLiberacion(resumen: ResumenLiberacion, permisos: PermisosLiberacion): DecisionLiberacion {
  const venta = resumen.venta;
  const saldo = Math.max(0, numero(venta?.saldo));
  const tieneSaldo = saldo > 0;
  const pagado = numero(venta?.pagado);
  const facturas = numero(venta?.facturas);

  // Otra sesión abierta de la misma mesa con su propio saldo (defecto M5):
  // no se sabe cuál resolver, así que se resuelve a mano en cada sesión.
  if (numero(resumen.otras_sesiones_con_saldo) > 0) {
    const bloqueada = no('varias_ventas_con_saldo');
    return {
      requiereResolucion: true,
      saldo,
      bloqueo: 'varias_ventas_con_saldo',
      opciones: { liberar: bloqueada, cobrar: tieneSaldo ? si : bloqueada, cartera: bloqueada, anular: bloqueada },
    };
  }

  if (!tieneSaldo) {
    return {
      requiereResolucion: false,
      saldo: 0,
      bloqueo: null,
      opciones: { liberar: si, cobrar: no('sin_saldo'), cartera: no('sin_saldo'), anular: no('sin_saldo') },
    };
  }

  let cartera: DecisionLiberacion['opciones']['cartera'];
  if (!venta?.customer_id) {
    cartera = no('sin_cliente');
  } else if (facturas > 0) {
    cartera =
      venta.factura_con_cliente && Math.abs(numero(venta.factura_saldo) - saldo) <= TOLERANCIA
        ? { disponible: true, modo: 'existente' }
        : no('venta_con_factura');
  } else if (pagado > 0) {
    cartera = no('venta_con_pagos');
  } else {
    cartera = { disponible: true, modo: 'crear' };
  }

  let anular: OpcionLiberacion;
  if (!permisos.puedeAnular) anular = no('sin_permiso');
  else if (pagado > 0 || facturas > 0) anular = no('venta_con_pagos');
  else anular = si;

  return {
    requiereResolucion: true,
    saldo,
    bloqueo: null,
    opciones: { liberar: no('saldo_pendiente'), cobrar: si, cartera, anular },
  };
}

export type ValidacionAccion =
  | { ok: true; motivo: string | null }
  | { ok: false; status: 400 | 403 | 409; codigo: MotivoNoDisponible | 'motivo_requerido' | 'motivo_invalido' };

/** ¿Acepta el servidor esta acción con esta decisión? (La base lo vuelve a comprobar en la transacción.) */
export function validarAccion(
  decision: DecisionLiberacion,
  accion: AccionLiberacion,
  motivoCrudo: string | null | undefined,
): ValidacionAccion {
  const motivo = (motivoCrudo ?? '').trim() || null;
  if (motivo && motivo.length > MOTIVO_MAX) return { ok: false, status: 400, codigo: 'motivo_invalido' };
  if (decision.bloqueo) return { ok: false, status: 409, codigo: decision.bloqueo };

  const opcion = decision.opciones[accion];
  if (!opcion.disponible) {
    const codigo = opcion.motivo ?? 'saldo_pendiente';
    return { ok: false, status: codigo === 'sin_permiso' ? 403 : 409, codigo };
  }
  if (accion === 'anular' && (!motivo || motivo.length < MOTIVO_MIN)) {
    return { ok: false, status: 400, codigo: 'motivo_requerido' };
  }
  return { ok: true, motivo };
}

/** Errores que lanza `pos_mesa_liberar` / `pos_mesa_resumen_liberacion` (mensaje = código). */
const CODIGOS_RPC = new Set([
  'accion_invalida',
  'motivo_invalido',
  'motivo_requerido',
  'sin_membresia',
  'mesa_no_encontrada',
  'venta_de_otra_organizacion',
  'varias_ventas_con_saldo',
  'sin_saldo',
  'saldo_pendiente',
  'sin_cliente',
  'venta_con_factura',
  'venta_con_pagos',
  'cartera_fallida',
  'sin_permiso',
]);

/** Traduce el error de la RPC a HTTP: el SQLSTATE manda el estado, el mensaje es el código estable. */
export function errorDeRpc(error: { message?: string | null; code?: string | null }): { status: number; codigo: string } {
  const mensaje = (error.message ?? '').trim();
  const codigo = CODIGOS_RPC.has(mensaje) ? mensaje : 'error_interno';
  switch (error.code) {
    case 'P0002':
      return { status: 404, codigo };
    case '42501':
      return { status: 403, codigo };
    case '22023':
      return { status: 400, codigo };
    case 'P0001':
      return { status: codigo === 'error_interno' ? 500 : 409, codigo };
    default:
      return { status: 500, codigo: 'error_interno' };
  }
}
