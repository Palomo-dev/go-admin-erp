// ============================================================
// Reportes de Roles (core)
// Llama a la RPC: fn_reporte_roles_auditoria + consultas directas
// ============================================================

import { supabase } from '@/lib/supabase/config';
import type { ReportDefinition, ReportData, PeriodoCierre } from '../types';

function buildReportData(
  id: string, titulo: string, modulo: string, periodo: PeriodoCierre,
  kpis: ReportData['kpis'], columnas: ReportData['columnas'],
  filas: Record<string, unknown>[], totales?: Record<string, unknown>,
): ReportData {
  return { id, titulo, modulo, kpis, columnas, filas, totales, generadoEn: new Date().toISOString(), periodo };
}

export const rolesReports: ReportDefinition[] = [
  {
    id: 'roles-usuarios',
    modulo: 'roles',
    titulo: 'Usuarios por Rol',
    descripcion: 'Distribución de usuarios por rol y permisos',
    categoria: 'sistema',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('organization_members')
        .select('id, role_id, is_active, roles!inner(name)')
        .eq('organization_id', orgId);

      if (error) throw error;

      const miembros = data ?? [];
      const porRol: Record<string, number> = {};
      miembros.forEach((m: Record<string, unknown>) => {
        const roles = m.roles as Record<string, unknown> | null;
        const name = String(roles?.name ?? 'unknown');
        porRol[name] = (porRol[name] ?? 0) + 1;
      });

      const filas = Object.entries(porRol).map(([rol, cantidad]) => ({ rol, cantidad }));

      return buildReportData(
        'roles-usuarios', 'Usuarios por Rol', 'roles', periodo,
        [
          { titulo: 'Total Usuarios', valor: miembros.length, formato: 'numero' },
          { titulo: 'Roles', valor: filas.length, formato: 'numero' },
        ],
        [
          { key: 'rol', titulo: 'Rol', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Usuarios', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: miembros.length },
      );
    },
  },
  {
    id: 'roles-auditoria',
    modulo: 'roles',
    titulo: 'Auditoría de Permisos',
    descripcion: 'Cambios de permisos y roles en el período',
    categoria: 'sistema',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_roles_auditoria', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'roles-auditoria', 'Auditoría de Permisos', 'roles', periodo,
        [
          { titulo: 'Total Eventos', valor: d.total ?? 0, formato: 'numero' },
        ],
        [
          { key: 'accion', titulo: 'Acción', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
        ],
        d.por_accion ?? [],
      );
    },
  },
];
