// ============================================================
// Catálogo de reportes disponibles
// Importa las definiciones reales de cada módulo y les añade lo que la
// interfaz v2 necesita: grupo (tarjeta), filtros admitidos y etiquetas.
// ============================================================

import type {
  DefinicionModulo,
  FiltroReporte,
  GrupoReporte,
  ModuloReportes,
  ReportDefinition,
} from './types';
import { MODULOS_CORE } from './types';

import { ventasReports } from './modulos/ventasReports';
import { finanzasReports } from './modulos/finanzasReports';
import { contabilidadReports } from './modulos/contabilidadReports';
import { inventarioReports } from './modulos/inventarioReports';
import { crmReports } from './modulos/crmReports';
import { hrmReports } from './modulos/hrmReports';
import { pmsReports } from './modulos/pmsReports';
import { parkingReports } from './modulos/parkingReports';
import { gymReports } from './modulos/gymReports';
import { moduleCodeVariants } from '@/lib/config/moduleAliases';
import { transporteReports } from './modulos/transporteReports';
import { chatReports } from './modulos/chatReports';
import { integracionesReports } from './modulos/integracionesReports';
import { notificacionesReports } from './modulos/notificacionesReports';
import { organizacionReports } from './modulos/organizacionReports';
import { clientesReports } from './modulos/clientesReports';
import { rolesReports } from './modulos/rolesReports';
import { pmReports } from './modulos/pmReports';
import { operacionesReports } from './modulos/operacionesReports';
import { serialTrackingReports } from './modulos/serialTrackingReports';

// ============================================================
// Metadatos de módulos (nombre visible + icono lucide)
// ============================================================

const MODULO_META: Record<string, { nombre: string; icono: string }> = {
  pos: { nombre: 'Ventas (POS)', icono: 'ShoppingCart' },
  finance: { nombre: 'Finanzas', icono: 'DollarSign' },
  inventory: { nombre: 'Inventario', icono: 'Package' },
  crm: { nombre: 'CRM', icono: 'Users' },
  hrm: { nombre: 'Recursos Humanos', icono: 'UserCog' },
  pms_hotel: { nombre: 'Hotelería (PMS)', icono: 'BedDouble' },
  parking: { nombre: 'Parking', icono: 'ParkingCircle' },
  gym: { nombre: 'Membresías', icono: 'Dumbbell' },
  transport: { nombre: 'Transporte', icono: 'Truck' },
  chat: { nombre: 'Chat Omnicanal', icono: 'MessageCircle' },
  integrations: { nombre: 'Integraciones', icono: 'Link2' },
  notifications: { nombre: 'Notificaciones', icono: 'Bell' },
  calendar: { nombre: 'Calendario', icono: 'CalendarDays' },
  operations: { nombre: 'Operaciones (Timeline)', icono: 'History' },
  pm: { nombre: 'Gestión de Proyectos', icono: 'FolderKanban' },
  organizations: { nombre: 'Organización', icono: 'Building2' },
  clientes: { nombre: 'Clientes', icono: 'Users' },
  roles: { nombre: 'Roles y Permisos', icono: 'Shield' },
  reports: { nombre: 'Reportes y Analítica', icono: 'FileBarChart' },
};

// ============================================================
// Grupos de la interfaz (tarjetas del inicio y listas por módulo)
// ============================================================

export interface GrupoMeta {
  id: GrupoReporte;
  /** Nombre en español; la interfaz usa `reportes.grupos.<id>`. */
  nombre: string;
  icono: string;
  /** Hotelería, parqueadero, membresías y transporte: se contratan aparte. */
  vertical: boolean;
}

export const GRUPOS: readonly GrupoMeta[] = [
  { id: 'contabilidad', nombre: 'Contabilidad', icono: 'BookOpen', vertical: false },
  { id: 'finanzas', nombre: 'Finanzas y tesorería', icono: 'Landmark', vertical: false },
  { id: 'ventas', nombre: 'Ventas y POS', icono: 'ShoppingCart', vertical: false },
  { id: 'inventario', nombre: 'Inventario', icono: 'Package', vertical: false },
  { id: 'compras', nombre: 'Compras', icono: 'ShoppingBag', vertical: false },
  { id: 'personas', nombre: 'Personas (nómina)', icono: 'UserCog', vertical: false },
  { id: 'clientes', nombre: 'Clientes y CRM', icono: 'Users', vertical: false },
  { id: 'atencion', nombre: 'Atención y mensajería', icono: 'MessageCircle', vertical: false },
  { id: 'operacion', nombre: 'Operación y organización', icono: 'Building2', vertical: false },
  { id: 'hoteleria', nombre: 'Hotelería', icono: 'BedDouble', vertical: true },
  { id: 'parqueadero', nombre: 'Parqueadero', icono: 'ParkingCircle', vertical: true },
  { id: 'membresias', nombre: 'Membresías', icono: 'Dumbbell', vertical: true },
  { id: 'transporte', nombre: 'Transporte', icono: 'Truck', vertical: true },
];

export function esGrupoReporte(valor: unknown): valor is GrupoReporte {
  return typeof valor === 'string' && GRUPOS.some((g) => g.id === valor);
}

// ============================================================
// Grupo y filtros de cada reporte
// ============================================================
// Filtros, en clave corta: c = comparativo, s = sucursal, f = franja,
// k = centro de costo. `catalogoV2.test.ts` exige que cuadren con la
// consulta: `s` si y solo si el alcance es de sucursal, `f` solo si el
// reporte consulta por instantes (`rangoDelPeriodo`) y `c` solo si el
// resultado depende del periodo.

type Clave = 'c' | 's' | 'f' | 'k';
const FILTRO_DE_CLAVE: Record<Clave, FiltroReporte> = { c: 'comparativo', s: 'sucursal', f: 'franja', k: 'centroCosto' };

interface MetaReporte {
  grupo: GrupoReporte;
  filtros: string;
  nuevo?: boolean;
  alias?: { destino: string; vista: string };
}

const META: Record<string, MetaReporte> = {
  // Contabilidad
  'estado-resultados': { grupo: 'contabilidad', filtros: 'c k' },
  'balance-general': { grupo: 'contabilidad', filtros: 'c' },
  'presupuesto-vs-real': { grupo: 'contabilidad', filtros: 'c f' },
  // Finanzas y tesorería
  'cxc-vencidas': { grupo: 'finanzas', filtros: 's' },
  'cxc-aging': { grupo: 'finanzas', filtros: 'c s' },
  'cxp-aging': { grupo: 'finanzas', filtros: 'c s' },
  'flujo-efectivo': { grupo: 'finanzas', filtros: 'c s f' },
  impuestos: { grupo: 'finanzas', filtros: 'c s f' },
  liquidez: { grupo: 'finanzas', filtros: 's' },
  'gastos-operativos': { grupo: 'finanzas', filtros: 'c s f' },
  'facturacion-electronica': { grupo: 'finanzas', filtros: 'c s f' },
  'rentabilidad-producto': { grupo: 'finanzas', filtros: 'c s f' },
  'rentabilidad-sucursal': { grupo: 'finanzas', filtros: 'c s f' },
  // Ventas y POS
  'cierre-caja': { grupo: 'ventas', filtros: 'c s f' },
  'ventas-periodo': { grupo: 'ventas', filtros: 'c s f' },
  'ventas-hora': { grupo: 'ventas', filtros: 'c s f' },
  'ventas-vendedor': { grupo: 'ventas', filtros: 'c s f' },
  'devoluciones-descuentos': { grupo: 'ventas', filtros: 'c s f' },
  'pedidos-online': { grupo: 'ventas', filtros: 'c s f' },
  // Inventario
  'stock-critico': { grupo: 'inventario', filtros: 's' },
  'movimientos-inventario': { grupo: 'inventario', filtros: 'c s f' },
  'rotacion-inventario': { grupo: 'inventario', filtros: 'c s f' },
  'rentabilidad-producto-inv': { grupo: 'inventario', filtros: 'c s f' },
  'trazabilidad-producto': { grupo: 'inventario', filtros: 'c s f' },
  'ventas-serial': { grupo: 'inventario', filtros: 'c s f' },
  'garantias-reporte': { grupo: 'inventario', filtros: 'c f' },
  'seriales-proveedor': { grupo: 'inventario', filtros: 'c s f' },
  // Compras
  'retenciones-practicadas': { grupo: 'compras', filtros: 'c s' },
  'retenciones-por-proveedor': {
    grupo: 'compras',
    filtros: 'c s',
    alias: { destino: 'retenciones-practicadas', vista: 'por-proveedor' },
  },
  // Personas
  'hrm-nomina': { grupo: 'personas', filtros: 'c' },
  'hrm-productividad': { grupo: 'personas', filtros: 'c s' },
  'hrm-comisiones': { grupo: 'personas', filtros: 'c s f' },
  // Clientes y CRM
  'clientes-crecimiento': { grupo: 'clientes', filtros: 'c s f' },
  'clientes-tipo': { grupo: 'clientes', filtros: 's' },
  'clientes-top': { grupo: 'clientes', filtros: 'c s f' },
  'crm-funnel': { grupo: 'clientes', filtros: 'c f' },
  'crm-forecast': { grupo: 'clientes', filtros: 'c f' },
  'crm-ranking-vendedores': { grupo: 'clientes', filtros: 'c f' },
  'crm-actividades': { grupo: 'clientes', filtros: 'c s f' },
  'crm-campanas': { grupo: 'clientes', filtros: 'c f' },
  'crm-clientes': { grupo: 'clientes', filtros: 'c f' },
  // Atención y mensajería
  'chat-volumen': { grupo: 'atencion', filtros: 'c s f' },
  'chat-sla': { grupo: 'atencion', filtros: 'c f' },
  'chat-agentes': { grupo: 'atencion', filtros: 'c s f' },
  'chat-tags': { grupo: 'atencion', filtros: 'c f' },
  'notificaciones-enviadas': { grupo: 'atencion', filtros: 'c f' },
  'notificaciones-lectura': { grupo: 'atencion', filtros: 'c f' },
  'notificaciones-modulo': { grupo: 'atencion', filtros: 'c f' },
  // Operación y organización
  'operaciones-actividad': { grupo: 'operacion', filtros: 'c f' },
  'operaciones-auditoria': { grupo: 'operacion', filtros: 'c f' },
  'org-miembros': { grupo: 'operacion', filtros: '' },
  'org-sucursales': { grupo: 'operacion', filtros: 'c f' },
  'org-uso-sistema': { grupo: 'operacion', filtros: 'c f' },
  'roles-usuarios': { grupo: 'operacion', filtros: '' },
  'roles-auditoria': { grupo: 'operacion', filtros: 'c f' },
  'integraciones-estado': { grupo: 'operacion', filtros: '' },
  'integraciones-eventos': { grupo: 'operacion', filtros: 'c f' },
  'pm-tareas': { grupo: 'operacion', filtros: 'c f' },
  'pm-performance': { grupo: 'operacion', filtros: '' },
  // Verticales
  'pms-ocupacion': { grupo: 'hoteleria', filtros: 'c s' },
  'pms-ingresos': { grupo: 'hoteleria', filtros: 'c s f' },
  'pms-housekeeping': { grupo: 'hoteleria', filtros: 'c s' },
  'parking-ocupacion': { grupo: 'parqueadero', filtros: 'c s f' },
  'parking-ingresos': { grupo: 'parqueadero', filtros: 'c s f' },
  'parking-rotacion': { grupo: 'parqueadero', filtros: 'c s f' },
  'gym-membresias': { grupo: 'membresias', filtros: 'c s' },
  'gym-asistencia': { grupo: 'membresias', filtros: 'c f' },
  'gym-retencion': { grupo: 'membresias', filtros: 'c' },
  'transporte-envios': { grupo: 'transporte', filtros: 'c s f' },
  'transporte-performance': { grupo: 'transporte', filtros: 'c s f' },
  'transporte-rutas': { grupo: 'transporte', filtros: 'c s f' },
};

function enriquecer(def: DefinicionModulo): ReportDefinition {
  const meta = META[def.id];
  if (!meta) throw new Error(`Reporte sin grupo en el catálogo: ${def.id}`);
  const filtros = meta.filtros
    .split(' ')
    .filter(Boolean)
    .map((c) => FILTRO_DE_CLAVE[c as Clave]);
  return {
    ...def,
    grupo: meta.grupo,
    filtros,
    ...(meta.nuevo ? { nuevo: true } : {}),
    ...(meta.alias ? { alias: meta.alias } : {}),
  };
}

// ============================================================
// Catálogo completo: mapea código de módulo → definiciones
// ============================================================

const CATALOGO: Record<string, ReportDefinition[]> = Object.fromEntries(
  Object.entries({
    pos: ventasReports,
    finance: [...finanzasReports, ...contabilidadReports],
    inventory: [...inventarioReports, ...serialTrackingReports],
    crm: crmReports,
    hrm: hrmReports,
    pms_hotel: pmsReports,
    parking: parkingReports,
    gym: gymReports,
    transport: transporteReports,
    chat: chatReports,
    integrations: integracionesReports,
    notifications: notificacionesReports,
    organizations: organizacionReports,
    clientes: clientesReports,
    roles: rolesReports,
    pm: pmReports,
    operations: operacionesReports,
  } satisfies Record<string, DefinicionModulo[]>).map(([code, defs]) => [code, defs.map(enriquecer)]),
);

// ============================================================
// API del catálogo
// ============================================================

/** Códigos de módulo que el plan deja ver (con alias y módulos core). */
function modulosVisibles(activeModuleCodes: string[]): Set<string> {
  // «memberships» (antes gym) sigue mostrando los reportes del catálogo «gym» (alias).
  return new Set<string>([...activeModuleCodes.flatMap(moduleCodeVariants), ...MODULOS_CORE]);
}

/**
 * Obtiene los reportes visibles para una organización, filtrando
 * por los módulos activos. Los módulos core siempre se incluyen.
 */
export function getReportesVisibles(activeModuleCodes: string[]): ModuloReportes[] {
  const visibles = modulosVisibles(activeModuleCodes);
  const resultado: ModuloReportes[] = [];

  for (const [code, reportes] of Object.entries(CATALOGO)) {
    if (!visibles.has(code)) continue;

    const meta = MODULO_META[code] ?? { nombre: code, icono: 'FileBarChart' };
    resultado.push({
      code,
      nombre: meta.nombre,
      icono: meta.icono,
      reportes,
    });
  }

  return resultado;
}

export interface GrupoConReportes {
  grupo: GrupoMeta;
  /** Reportes del plan, sin los alias (que se abren como vista de otro). */
  reportes: ReportDefinition[];
  /** Reportes del grupo cuyo módulo no está en el plan. */
  bloqueados: ReportDefinition[];
}

/** Grupos de la interfaz, en su orden, con lo que el plan incluye y lo que no. */
export function getGrupos(activeModuleCodes: string[]): GrupoConReportes[] {
  const visibles = modulosVisibles(activeModuleCodes);
  const listados = getAllReportes().filter((r) => !r.alias);
  return GRUPOS.map((grupo) => {
    const delGrupo = listados.filter((r) => r.grupo === grupo.id);
    return {
      grupo,
      reportes: delGrupo.filter((r) => visibles.has(r.modulo)),
      bloqueados: delGrupo.filter((r) => !visibles.has(r.modulo)),
    };
  });
}

export function getGrupoMeta(id: GrupoReporte): GrupoMeta {
  return GRUPOS.find((g) => g.id === id)!;
}

/**
 * Obtiene un reporte del catálogo por su ID.
 */
export function getReporteById(reportId: string): ReportDefinition | undefined {
  for (const reportes of Object.values(CATALOGO)) {
    const found = reportes.find((r) => r.id === reportId);
    if (found) return found;
  }
  return undefined;
}

/**
 * Obtiene todos los reportes del catálogo (sin filtrar).
 */
export function getAllReportes(): ReportDefinition[] {
  return Object.values(CATALOGO).flat();
}

/**
 * Lista de todos los IDs de reporte (para whitelist del agente IA).
 */
export function getAllReportIds(): string[] {
  return getAllReportes().map((r) => r.id);
}
