/**
 * Contrato del módulo Membresías entre las rutas `/api/membresias/**` y la interfaz.
 * Fechas: los instantes viajan como ISO (timestamptz) y se pintan con la zona de la organización
 * (`zona` en cada respuesta); los días calendario, como YYYY-MM-DD.
 */
import type { EstadoMembresia, EstadoVisual, UnidadDuracion } from './vigencia';

export type { EstadoMembresia, EstadoVisual, UnidadDuracion } from './vigencia';

export const PERMISOS_MEMBRESIAS = {
  ver: 'memberships.view',
  planes: 'memberships.plans.manage',
  congelar: 'memberships.freeze',
  cancelar: 'memberships.cancel',
  checkin: 'memberships.checkin',
  clases: 'memberships.classes.manage',
  dispositivos: 'memberships.devices.manage',
} as const;

export type AccionMembresias = keyof typeof PERMISOS_MEMBRESIAS;
export type PermisosMembresias = Record<AccionMembresias, boolean>;

export type BillingMode = 'prepaid' | 'on_credit';

export interface ClienteResumen {
  id: string;
  nombre: string;
  documento: string | null;
  email: string | null;
  telefono: string | null;
  avatarUrl: string | null;
}

export interface PlanResumen {
  id: number;
  nombre: string;
  productId: number | null;
}

export interface MembresiaFila {
  id: number;
  estado: EstadoMembresia;
  estadoVisual: EstadoVisual;
  /** Días que faltan (activa) o de gracia que quedan (en gracia). */
  dias: number | null;
  desde: string | null;
  hasta: string;
  graceUntil: string | null;
  codigo: string | null;
  origen: 'pos' | 'invoice' | 'web' | 'manual_legacy' | null;
  cliente: ClienteResumen;
  plan: PlanResumen;
  saleId: string | null;
  invoiceId: string | null;
  branchId: number | null;
}

export interface ConteoEstados {
  total: number;
  activa: number;
  en_gracia: number;
  congelada: number;
  pendiente: number;
  vencida: number;
  cancelada: number;
  porVencer: number;
}

export interface ListadoMembresias {
  zona: string;
  filas: MembresiaFila[];
  total: number;
  pagina: number;
  porPagina: number;
  conteo: ConteoEstados;
  planes: PlanResumen[];
}

export type FiltroEstado = 'todas' | 'activa' | 'en_gracia' | 'congelada' | 'pendiente' | 'vencida' | 'cancelada' | 'por_vencer';

export interface EventoMembresia {
  id: string;
  tipo: string;
  descripcion: string | null;
  fecha: string;
  metadata: Record<string, unknown>;
}

export interface CongelamientoMembresia {
  id: string;
  desde: string;
  hasta: string | null;
  dias: number;
  estado: 'scheduled' | 'active' | 'ended' | 'cancelled';
  motivo: string | null;
}

export interface EntradaMembresia {
  id: number;
  fecha: string;
  metodo: string | null;
  permitido: boolean;
  motivo: string | null;
  sucursal: string | null;
}

export interface PagoMembresia {
  saleItemId: string;
  saleId: string;
  fecha: string | null;
  cantidad: number;
  total: number;
  estadoVenta: string | null;
  factura: { id: string; numero: string; estado: string; saldo: number } | null;
  tipo: 'venta' | 'renovacion';
}

export interface ReglasPlan {
  durationUnit: UnidadDuracion;
  durationValue: number;
  billingMode: BillingMode;
  graceDays: number;
  requiresActivation: boolean;
  activationWindowDays: number | null;
  freezeAllowed: boolean;
  freezeMaxTimes: number | null;
  freezeMaxDays: number | null;
  allowedBranchIds: number[] | null;
  accessSchedule: { dias?: number[]; desde?: string; hasta?: string } | null;
  dailyCheckinLimit: number | null;
}

export interface DetalleMembresia {
  zona: string;
  membresia: MembresiaFila & {
    notas: string | null;
    motivoCancelacion: string | null;
    canceladaEn: string | null;
    activadaEn: string | null;
    periodos: number;
    reglas: ReglasPlan;
  };
  eventos: EventoMembresia[];
  congelamientos: CongelamientoMembresia[];
  entradas: EntradaMembresia[];
  pagos: PagoMembresia[];
  /** Días de congelamiento ya usados y veces (para el diálogo «Congelar»). */
  congelamientoUsado: { dias: number; veces: number };
  precioRenovacion: number | null;
  permisos: PermisosMembresias;
}

export interface PlanFila {
  id: number;
  nombre: string;
  descripcion: string | null;
  productId: number | null;
  sku: string | null;
  estadoProducto: string | null;
  activo: boolean;
  precio: number | null;
  reglas: ReglasPlan;
  membresiasVivas: number;
  membresiasActivas: number;
}

export interface ListadoPlanes {
  zona: string;
  planes: PlanFila[];
  permisos: PermisosMembresias;
}

export interface DetallePlan {
  zona: string;
  plan: PlanFila & { categoria: string | null; creado: string | null };
  ingresosMes: number;
  ventasMes: number;
  ultimas: MembresiaFila[];
  permisos: PermisosMembresias;
}

export interface MiembroFila {
  cliente: ClienteResumen;
  membresias: number;
  vigente: MembresiaFila | null;
  ultimaEntrada: string | null;
}

export interface ListadoMiembros {
  zona: string;
  filas: MiembroFila[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface PagoFila {
  saleItemId: string;
  saleId: string;
  fecha: string | null;
  cliente: ClienteResumen | null;
  producto: string;
  cantidad: number;
  total: number;
  estadoVenta: string | null;
  factura: { id: string; numero: string; estado: string; saldo: number } | null;
  membresiaId: number | null;
}

export interface ListadoPagos {
  zona: string;
  filas: PagoFila[];
  total: number;
  pagina: number;
  porPagina: number;
  totalImporte: number;
}

export interface ResumenMembresias {
  zona: string;
  conteo: ConteoEstados;
  nuevasMes: number;
  ingresosMes: number;
  entradasHoy: number;
  porVencer: MembresiaFila[];
  enGracia: MembresiaFila[];
  porPlan: Array<{ plan: PlanResumen; activas: number }>;
  actividad: Array<EventoMembresia & { membresiaId: number; cliente: string | null }>;
  planesSinProducto: number;
  permisos: PermisosMembresias;
}

export interface ResultadoCheckin {
  permitido: boolean;
  motivo: string | null;
  aviso: string | null;
  diasGracia: number | null;
  checkinId: number;
  membresia: { id: number; estado: EstadoMembresia; plan: string | null; desde: string; hasta: string; graceUntil: string | null; codigo: string | null } | null;
}

/** Códigos de error de las RPC que la interfaz traduce (namespace membresias.errores). */
export const ERRORES_MEMBRESIAS = [
  'sin_permiso',
  'membresia_no_encontrada',
  'membresia_no_congelable',
  'congelamiento_no_permitido',
  'fechas_invalidas',
  'congelamiento_en_el_pasado',
  'congelamiento_despues_del_vencimiento',
  'congelamiento_en_curso',
  'congelamiento_tope_veces',
  'congelamiento_tope_dias',
  'sin_congelamiento',
  'motivo_requerido',
  'cliente_no_encontrado',
  'sucursal_invalida',
  'membresia_sin_cliente',
] as const;

export type ErrorMembresias = (typeof ERRORES_MEMBRESIAS)[number] | 'error_interno' | 'datos_invalidos';
