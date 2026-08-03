// ============================================================
// Reportes de Organización (core)
// Consultas directas a Supabase para miembros, sucursales y uso
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

export const organizacionReports: ReportDefinition[] = [
  {
    id: 'org-miembros',
    modulo: 'organizations',
    titulo: 'Miembros de la Organización',
    descripcion: 'Usuarios, roles y estado de membresía',
    categoria: 'sistema',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('organization_members')
        .select('id, user_id, role_id, status, created_at')
        .eq('organization_id', orgId);

      if (error) throw error;

      const miembros = data ?? [];
      const porEstado: Record<string, number> = {};
      miembros.forEach((m: Record<string, unknown>) => {
        const st = String(m.status ?? 'unknown');
        porEstado[st] = (porEstado[st] ?? 0) + 1;
      });

      const filas = Object.entries(porEstado).map(([estado, cantidad]) => ({ estado, cantidad }));

      return buildReportData(
        'org-miembros', 'Miembros de la Organización', 'organizations', periodo,
        [
          { titulo: 'Total Miembros', valor: miembros.length, formato: 'numero' },
        ],
        [
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: miembros.length },
      );
    },
  },
  {
    id: 'org-sucursales',
    modulo: 'organizations',
    titulo: 'Comparativa de Sucursales',
    descripcion: 'Métricas comparativas por sucursal',
    categoria: 'sistema',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data: branches } = await supabase
        .from('branches')
        .select('id, name, is_active')
        .eq('organization_id', orgId);

      const { data: sales } = await supabase
        .from('sales')
        .select('branch_id, total')
        .eq('organization_id', orgId)
        .gte('sale_date', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('sale_date', `${periodo.fechaFin}T23:59:59Z`)
        .not('status', 'in', '("cancelled","void")');

      const sucursales = branches ?? [];
      const ventasPorSuc: Record<number, { total: number; num: number }> = {};
      (sales ?? []).forEach((s: Record<string, unknown>) => {
        const bid = Number(s.branch_id ?? 0);
        if (!ventasPorSuc[bid]) ventasPorSuc[bid] = { total: 0, num: 0 };
        ventasPorSuc[bid].total += Number(s.total ?? 0);
        ventasPorSuc[bid].num++;
      });

      const filas = sucursales.map((b: Record<string, unknown>) => ({
        nombre: b.name,
        activa: b.is_active ? 'Sí' : 'No',
        total_ventas: ventasPorSuc[Number(b.id)]?.total ?? 0,
        num_ventas: ventasPorSuc[Number(b.id)]?.num ?? 0,
      }));

      return buildReportData(
        'org-sucursales', 'Comparativa de Sucursales', 'organizations', periodo,
        [
          { titulo: 'Sucursales', valor: sucursales.length, formato: 'numero' },
          { titulo: 'Total Ventas', valor: filas.reduce((s: number, f: Record<string, unknown>) => s + Number(f.total_ventas ?? 0), 0), formato: 'moneda' },
        ],
        [
          { key: 'nombre', titulo: 'Sucursal', tipo: 'texto' },
          { key: 'activa', titulo: 'Activa', tipo: 'texto' },
          { key: 'total_ventas', titulo: 'Total Ventas', tipo: 'moneda', alinear: 'right' },
          { key: 'num_ventas', titulo: 'N° Ventas', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { total_ventas: filas.reduce((s: number, f: Record<string, unknown>) => s + Number(f.total_ventas ?? 0), 0) },
      );
    },
  },
  {
    id: 'org-uso-sistema',
    modulo: 'organizations',
    titulo: 'Uso del Sistema',
    descripcion: 'Métricas de uso: sesiones, módulos activos, storage',
    categoria: 'sistema',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data: modules } = await supabase
        .from('organization_modules')
        .select('module_code, is_active')
        .eq('organization_id', orgId);

      const { data: sessions } = await supabase
        .from('user_sessions')
        .select('id, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`);

      const modulosActivos = (modules ?? []).filter((m: Record<string, unknown>) => m.is_active).length;
      const totalSesiones = sessions?.length ?? 0;

      return buildReportData(
        'org-uso-sistema', 'Uso del Sistema', 'organizations', periodo,
        [
          { titulo: 'Módulos Activos', valor: modulosActivos, formato: 'numero' },
          { titulo: 'Sesiones', valor: totalSesiones, formato: 'numero' },
        ],
        [
          { key: 'metrica', titulo: 'Métrica', tipo: 'texto' },
          { key: 'valor', titulo: 'Valor', tipo: 'numero', alinear: 'right' },
        ],
        [
          { metrica: 'Módulos Activos', valor: modulosActivos },
          { metrica: 'Sesiones del Período', valor: totalSesiones },
        ],
      );
    },
  },
];
