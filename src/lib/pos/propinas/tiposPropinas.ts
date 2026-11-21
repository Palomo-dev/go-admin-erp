/**
 * Contrato de la API de Propinas (`/api/pos/propinas/**`): lo que devuelven
 * las funciones de la base (migración 20261120200000) y lo que manda la
 * pantalla. Módulo hoja, sin dependencias.
 */

export const TIPOS_PROPINA = ['cash', 'card', 'transfer', 'online', 'split', 'pooled'] as const;
export type TipoPropina = (typeof TIPOS_PROPINA)[number];

export const VISTAS_PROPINAS = ['por_liquidar', 'liquidadas', 'anuladas', 'todas'] as const;
export type VistaPropinas = (typeof VISTAS_PROPINAS)[number];

export type EstadoPropina = 'por_liquidar' | 'liquidada' | 'anulada';

export interface PersonaPropina {
  id: string;
  nombre: string | null;
  /** Cargo de RR. HH. o, si no tiene, el rol en la organización. */
  cargo: string | null;
}

export interface VentaPropina {
  id: string;
  numero: string | null;
  tipo_numero: 'factura' | 'pedido' | null;
  origen: 'pos' | 'mesa' | 'web';
  mesa: string | null;
  mesa_id: string | null;
  /** La venta todavía no está cobrada: su propina no se liquida. */
  abierta: boolean;
}

export interface FilaPropina {
  id: string;
  fecha: string;
  monto: number;
  tipo: TipoPropina;
  estado: EstadoPropina;
  sucursal_id: number;
  notas: string | null;
  anulada_en: string | null;
  motivo_anulacion: string | null;
  liquidada_en: string | null;
  liquidacion: { id: string; codigo: string } | null;
  persona: PersonaPropina;
  venta: VentaPropina | null;
}

export interface PaginaPropinas {
  total: number;
  filas: FilaPropina[];
}

export interface CifrasPropinas {
  por_liquidar: { monto: number; cantidad: number; personas: number };
  liquidado_mes: { monto: number; liquidaciones: number };
  promedio: { monto: number; cantidad: number };
  ventas: { total: number; con_propina: number };
  por_persona: Array<PersonaPropina & { monto: number; cantidad: number }>;
  conteos: { por_liquidar: number; liquidaciones: number; anuladas: number };
}

export const REPARTOS_LIQUIDACION = ['atendio', 'horas', 'porcentaje'] as const;
export type RepartoLiquidacion = (typeof REPARTOS_LIQUIDACION)[number];
/** Repartos que la base acepta hoy («por horas» espera los turnos de HRM). */
export const REPARTOS_DISPONIBLES: readonly RepartoLiquidacion[] = ['atendio', 'porcentaje'];

export const MEDIOS_LIQUIDACION = ['efectivo', 'transferencia', 'nomina', 'sin_pago'] as const;
export type MedioLiquidacion = (typeof MEDIOS_LIQUIDACION)[number];
/** Medios que la base acepta hoy («nómina» espera la integración con HRM). */
export const MEDIOS_DISPONIBLES: readonly MedioLiquidacion[] = ['efectivo', 'transferencia', 'sin_pago'];

/** «por_pagar»: liquidada (28150502) y sin pagar a todos (migración 20261121030426). */
export type EstadoLiquidacion = 'por_pagar' | 'pagada' | 'anulada';

/** Medio con que se pagó cada línea. */
export type MedioPagoLinea = 'efectivo' | 'transferencia' | 'nomina';

/** Pagar una liquidación «por pagar» (todas sus personas o las elegidas). */
export interface DatosPagoLiquidacion {
  solicitud: string;
  medio: 'efectivo' | 'transferencia';
  personas?: string[];
  referencias?: { persona: string; referencia: string }[];
}

export interface FilaLiquidacion {
  id: string;
  codigo: string;
  creada_en: string;
  desde: string | null;
  hasta: string | null;
  personas: number;
  reparto: RepartoLiquidacion;
  medio: MedioLiquidacion;
  total: number;
  estado: EstadoLiquidacion;
  anulada_en: string | null;
  sesion_caja: number | null;
  movimiento_caja: number | null;
  referencias: string | null;
}

export interface PaginaLiquidaciones {
  total: number;
  filas: FilaLiquidacion[];
}

export interface LineaLiquidacion extends PersonaPropina {
  base: number;
  pct: number;
  calculado: number;
  ajuste: number;
  monto: number;
  referencia: string | null;
  /** Null mientras esté por pagar. */
  pagado_en?: string | null;
  medio_pago?: MedioPagoLinea | null;
  /** Lo ya pagado de esta línea (la nómina puede pagar una parte). */
  pagado_monto?: number;
}

export interface MovimientoCajaRef {
  id: number;
  sesion: number;
  fecha: string;
}

export interface DetalleLiquidacion {
  id: string;
  codigo: string;
  estado: EstadoLiquidacion;
  sucursal: { id: number; nombre: string } | null;
  desde: string | null;
  hasta: string | null;
  reparto: RepartoLiquidacion;
  medio: MedioLiquidacion;
  total: number;
  efectivo: number;
  banco: number;
  cantidad: number;
  motivo_ajuste: string | null;
  notas: string | null;
  creada_en: string;
  creada_por: PersonaPropina;
  anulada_en: string | null;
  motivo_anulacion: string | null;
  anulada_por: PersonaPropina | null;
  sesion_caja: number | null;
  movimiento_caja: MovimientoCajaRef | null;
  reingreso_caja: MovimientoCajaRef | null;
  asientos: Array<{ id: number; fecha: string; prefijo: string | null; numero: number | null }>;
  lineas: LineaLiquidacion[];
  propinas: Array<{
    id: string;
    fecha: string;
    monto: number;
    tipo: TipoPropina;
    persona: PersonaPropina;
    venta: { id: string; numero: string | null; tipo_numero: 'factura' | 'pedido' | null } | null;
  }>;
}

/** Lo que el usuario de la sesión puede hacer en Propinas (lo resuelve el servidor). */
export interface PermisosPropinasServidor {
  ver: boolean;
  registrar: boolean;
  anular: boolean;
  liquidar: boolean;
  anularLiquidacion: boolean;
}

export const SIN_PERMISOS_PROPINAS: PermisosPropinasServidor = {
  ver: false,
  registrar: false,
  anular: false,
  liquidar: false,
  anularLiquidacion: false,
};

export interface CajaAbiertaPropinas {
  id: number;
  abierta_en: string;
  abierta_por: string | null;
  /** Efectivo esperado; `null` con cierre ciego y sin permiso. */
  esperado: number | null;
}

/** Cuerpo de `POST /api/pos/propinas/liquidaciones`. */
export interface DatosLiquidacion {
  /** Clave de idempotencia: un reintento devuelve la misma liquidación. */
  solicitud: string;
  sucursal_id: number;
  propinas: string[];
  reparto: RepartoLiquidacion;
  participaciones?: Array<{ persona: string; pct: number }>;
  ajustes?: Array<{ persona: string; monto: number }>;
  motivo_ajuste?: string | null;
  medio: MedioLiquidacion;
  referencias?: Array<{ persona: string; referencia: string }>;
  motivo?: string | null;
  desde?: string | null;
  hasta?: string | null;
}

export interface ResultadoLiquidacion {
  id: string;
  codigo: string;
  total: number;
  ya_registrada: boolean;
  movimiento_caja?: number | null;
  sesion_caja?: number | null;
}
