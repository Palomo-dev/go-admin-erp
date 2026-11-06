/**
 * Formas que devuelven las funciones de estados financieros. Las cifras se
 * calculan en la base (`supabase/migrations/20261107141000_*`); aquí solo se
 * presentan.
 */

export type SeccionFlujo = 'operacion' | 'inversion' | 'financiacion';

export interface RenglonFlujo {
  seccion: SeccionFlujo;
  tipo: 'ajuste' | 'variacion' | 'movimiento';
  grupo: string;
  sentido: 'entrada' | 'salida' | null;
  nombre: string | null;
  valor: number;
}

export interface CuentaConValor {
  cuenta: string;
  nombre: string | null;
  valor: number;
}

export interface CuentaEfectivo {
  cuenta: string;
  nombre: string | null;
  inicial: number;
  final: number;
  restringida: boolean;
  propuesta: boolean;
}

export type ClavePolitica =
  | 'intereses_pagados'
  | 'intereses_recibidos'
  | 'dividendos_recibidos'
  | 'dividendos_pagados'
  | 'impuestos';

export type PoliticasFlujo = Record<ClavePolitica, string>;

export interface EstadoFlujos {
  desde: string;
  hasta: string;
  utilidad: number;
  filas: RenglonFlujo[];
  operacion: number;
  inversion: number;
  financiacion: number;
  pendiente: number;
  efecto_cambiario: number;
  variacion: number;
  efectivo_inicial: number;
  efectivo_final: number;
  diferencia: number;
  restringido: { inicial: number; final: number };
  cuentas_efectivo: CuentaEfectivo[];
  pendientes_cuentas: CuentaConValor[];
  revisar_cuentas: CuentaConValor[];
  sin_efectivo: Array<{ asiento: number; fecha: string; memo: string | null; monto: number }>;
  avisos: { borradores: number; fallos: number; fallos_monto: number };
  politicas: PoliticasFlujo;
  politicas_confirmadas: boolean;
}

export interface FilaPatrimonioBase {
  clave: string;
  valores: Record<string, number> | null;
  total: number;
}

export interface EstadoPatrimonio {
  desde: string;
  hasta: string;
  filas: FilaPatrimonioBase[];
  utilidad: number;
  saldo_final: number;
  patrimonio_balance: number;
  diferencia: number;
}

export interface CuentaResultado {
  cuenta: string;
  codigo: string;
  nombre: string | null;
  /** Crédito menos débito: el gasto es negativo. */
  neto: number;
}

export interface EstadoResultado {
  desde: string;
  hasta: string;
  utilidad: number;
  cuentas: CuentaResultado[];
  ori: number;
}

export interface BaseIndicadores {
  desde: string;
  hasta: string;
  dias: number;
  activo_corriente: number;
  pasivo_corriente: number;
  sin_clasificar: number;
  activo: number;
  pasivo: number;
  patrimonio: number;
  activo_inicial: number;
  patrimonio_inicial: number;
  cartera: number;
  cartera_inicial: number;
  inventario: number;
  inventario_inicial: number;
  proveedores: number;
  proveedores_inicial: number;
  ingresos: number;
  costo: number;
  resultado_operacional: number;
  resultado: number;
}

export interface FilaPresupuesto {
  cuenta: string;
  nombre: string;
  tipo: string;
  presupuesto: number;
  real: number;
  diferencia: number;
  variacion: number | null;
  presupuestada: boolean;
  solapada: boolean;
}

export interface EstadoPresupuesto {
  tiene_presupuesto: boolean;
  borradores: number;
  varios_por_anio: boolean;
  detalle: FilaPresupuesto[];
}

export interface FilaMayor {
  codigo: string;
  nombre: string | null;
  inicial: number;
  debitos: number;
  creditos: number;
  final: number;
}

export interface LibroMayor {
  filas: FilaMayor[];
  debitos: number;
  creditos: number;
}

export interface LibroInventarios {
  corte: string;
  filas: Array<{ codigo: string; nombre: string | null; saldo: number }>;
  activo: number;
  pasivo: number;
  patrimonio: number;
  resultado_abierto: number;
  activos_fijos: number;
}

export interface FilaResumenLibro {
  clave: string;
  nombre: string | null;
  inicial: number;
  debitos: number;
  creditos: number;
  final: number;
}

export interface LineaLibro {
  id: number;
  asiento: number;
  fecha: string;
  memo: string | null;
  cuenta: string;
  nombre: string | null;
  debito: number;
  credito: number;
  tercero: string | null;
}

export const NOTAS_CLAVES = ['entidad', 'politicas', 'efectivo', 'deudores', 'inventarios', 'ppe'] as const;
export type ClaveNota = (typeof NOTAS_CLAVES)[number];

export interface NotaGuardada {
  texto: string;
  revisada: boolean;
}

export interface Certificacion {
  representante_nombre?: string;
  representante_cedula?: string;
  contador_nombre?: string;
  contador_cedula?: string;
  contador_tarjeta?: string;
  texto?: string;
  texto_validado?: boolean;
}

export interface MarcaCuenta {
  account_code: string;
  clase_efectivo: string | null;
  categoria_flujo: string | null;
  plazo_meses: number | null;
  es_ori: boolean;
}

export interface ConfiguracionEstados {
  version: number;
  notas: Partial<Record<ClaveNota, NotaGuardada>>;
  certificacion: Certificacion;
  politicas: PoliticasFlujo;
  politicasConfirmadas: boolean;
  marcas: MarcaCuenta[];
  empresa: { nombre: string; nit: string };
}
