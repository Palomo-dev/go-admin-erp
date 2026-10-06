/**
 * Valores que la base acepta en el módulo de parqueadero, y cómo se pintan.
 *
 * Fuente: el esquema real (consultado por MCP el 2026-10-06). Cada lista es el
 * contrato con un enum o un CHECK de Postgres: si la pantalla manda un valor que
 * no está aquí, la base responde 22P02 (enum) o 23514 (check). Así fallaron
 * «Crear espacio de moto» (`parking_space_type` sin 'motorcycle') y «Poner en
 * mantenimiento» (`parking_space_state` sin 'maintenance').
 *
 * `src/lib/services/__tests__/parkingValores.test.ts` fija que las opciones de
 * cada pantalla sean un subconjunto de estas listas.
 */

/** Enum `parking_space_type`. 'motor' es el valor antiguo de moto (sin uso). */
export const TIPOS_ESPACIO_BD = ['car', 'motor', 'disabled', 'motorcycle', 'truck', 'bicycle'] as const;
export type TipoEspacioBD = (typeof TIPOS_ESPACIO_BD)[number];

/**
 * Enum `parking_space_state`. 'maintenance' y 'disabled' llegan con la migración
 * 20261006163713_parking_space_state_mantenimiento.
 */
export const ESTADOS_ESPACIO_BD = ['free', 'occupied', 'reserved', 'maintenance', 'disabled'] as const;
export type EstadoEspacioBD = (typeof ESTADOS_ESPACIO_BD)[number];

/** Enum `parking_rate_unit`. No existe la unidad «fracción». */
export const UNIDADES_TARIFA_BD = ['minute', 'hour', 'day'] as const;
export type UnidadTarifaBD = (typeof UNIDADES_TARIFA_BD)[number];

/** Enum `parking_session_status`. */
export const ESTADOS_SESION_BD = ['open', 'closed', 'cancelled'] as const;

/** Enum `parking_pass_status`. */
export const ESTADOS_PASE_BD = ['active', 'expired', 'cancelled', 'suspended'] as const;

/** CHECK `parking_vehicles_vehicle_type_check` (vehículos de abonados). Sin bicicleta. */
export const TIPOS_VEHICULO_ABONADO_BD = ['car', 'motorcycle', 'truck', 'other'] as const;

/**
 * `payments.source` de un cobro de parqueadero. Los disparadores contables
 * (`trg_auto_journal_parking_payment`) y la pantalla de Pagos solo reconocen estos dos:
 * un pago con source 'parking' no aparece en ningún listado.
 */
export const ORIGENES_PAGO_PARQUEADERO = ['parking_session', 'parking_pass'] as const;

/** `invoice_sales.status` (CHECK `invoice_sales_status_check`). No existe 'pending'. */
export const ESTADOS_FACTURA_VENTA_BD = ['draft', 'issued', 'paid', 'partial', 'void'] as const;

const ETIQUETA_TIPO_ESPACIO: Record<TipoEspacioBD, string> = {
  car: 'Automóvil',
  motorcycle: 'Motocicleta',
  motor: 'Motocicleta',
  truck: 'Camión',
  bicycle: 'Bicicleta',
  disabled: 'Discapacidad',
};

const ETIQUETA_ESTADO_ESPACIO: Record<EstadoEspacioBD, string> = {
  free: 'Libre',
  occupied: 'Ocupado',
  reserved: 'Reservado',
  maintenance: 'Mantenimiento',
  disabled: 'Deshabilitado',
};

/** Etiqueta de un tipo de espacio; si llega un valor desconocido, lo muestra tal cual. */
export function etiquetaTipoEspacio(tipo: string | null | undefined): string {
  if (!tipo) return '—';
  return ETIQUETA_TIPO_ESPACIO[tipo as TipoEspacioBD] ?? tipo;
}

/** Etiqueta de un estado de espacio; si llega un valor desconocido, lo muestra tal cual. */
export function etiquetaEstadoEspacio(estado: string | null | undefined): string {
  if (!estado) return '—';
  return ETIQUETA_ESTADO_ESPACIO[estado as EstadoEspacioBD] ?? estado;
}

/** 'motor' (valor antiguo) se trata como moto en iconos y filtros. */
export function normalizarTipoEspacio(tipo: string | null | undefined): string {
  return tipo === 'motor' ? 'motorcycle' : tipo ?? 'car';
}
