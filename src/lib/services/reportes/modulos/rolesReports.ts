// ============================================================
// Reportes de Roles (core)
// Llama a la RPC: fn_reporte_roles_auditoria + consultas directas
// ============================================================

import { supabase as browserSupabase } from '@/lib/supabase/config';
import type { ReportesClient } from '../types';
// F0-SEC r3 (tester r2, fallo 3): `fetch` acepta el cliente de Supabase por
// parámetro. En el navegador (app/reportes) cae al cliente browser con la sesión
// del usuario; en el servidor (asistente de reportes) el route handler pasa el
// cliente de sesión de `getServerOrgContext()`, así que las RPC `fn_reporte_*`
// corren como `authenticated` miembro y nunca como `anon`.
import type { DefinicionModulo, ReportData, PeriodoCierre } from '../types';
import { rangoDelPeriodo } from '../rangoPeriodo';

function buildReportData(
  id: string, titulo: string, modulo: string, periodo: PeriodoCierre,
  kpis: ReportData['kpis'], columnas: ReportData['columnas'],
  filas: Record<string, unknown>[], totales?: Record<string, unknown>,
): ReportData {
  return { id, titulo, modulo, kpis, columnas, filas, totales, generadoEn: new Date().toISOString(), periodo };
}

export const rolesReports: DefinicionModulo[] = [
  {
    id: 'roles-usuarios',
    modulo: 'roles',
    titulo: 'Usuarios por rol',
    descripcion: 'Distribución de usuarios por rol y cargo',
    categoria: 'sistema',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { data, error } = await db
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
        'roles-usuarios', 'Usuarios por rol', 'roles', periodo,
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
    titulo: 'Auditoría de permisos',
    descripcion: 'Cambios de roles y permisos en el periodo',
    categoria: 'sistema',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_roles_auditoria', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'roles-auditoria', 'Auditoría de permisos', 'roles', periodo,
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
