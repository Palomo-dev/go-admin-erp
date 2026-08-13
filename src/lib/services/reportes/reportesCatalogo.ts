// ============================================================
// Catálogo de reportes disponibles
// Importa las definiciones reales de cada módulo
// ============================================================

import type { ModuloReportes, ReportDefinition } from './types';
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
  gym: { nombre: 'Gimnasio', icono: 'Dumbbell' },
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
// Catálogo completo: mapea código de módulo → definiciones
// ============================================================

const CATALOGO: Record<string, ReportDefinition[]> = {
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
};

// ============================================================
// API del catálogo
// ============================================================

/**
 * Obtiene los reportes visibles para una organización, filtrando
 * por los módulos activos. Los módulos core siempre se incluyen.
 */
export function getReportesVisibles(activeModuleCodes: string[]): ModuloReportes[] {
  const visibles = new Set<string>([...activeModuleCodes, ...MODULOS_CORE]);

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
