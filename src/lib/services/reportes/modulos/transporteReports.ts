// ============================================================
// Reportes de Transporte
// Consultas directas a Supabase para envíos, performance y rutas
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

export const transporteReports: ReportDefinition[] = [
  {
    id: 'transporte-envios',
    modulo: 'transport',
    titulo: 'Envíos por Estado',
    descripcion: 'Volumen de envíos por estado y transportadora',
    categoria: 'operativo',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('shipments')
        .select('id, status, carrier_id, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`);

      if (error) throw error;

      const envios = data ?? [];
      const porEstado: Record<string, number> = {};
      envios.forEach((e: Record<string, unknown>) => {
        const st = String(e.status ?? 'unknown');
        porEstado[st] = (porEstado[st] ?? 0) + 1;
      });

      const filas = Object.entries(porEstado).map(([estado, cantidad]) => ({ estado, cantidad }));

      return buildReportData(
        'transporte-envios', 'Envíos por Estado', 'transport', periodo,
        [
          { titulo: 'Total Envíos', valor: envios.length, formato: 'numero' },
        ],
        [
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: envios.length },
      );
    },
  },
  {
    id: 'transporte-performance',
    modulo: 'transport',
    titulo: 'Performance de Conductores',
    descripcion: 'Entregas a tiempo, incidentes y eficiencia',
    categoria: 'operativo',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('shipments')
        .select('id, created_by, status, delivered_at, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`)
        .not('created_by', 'is', null);

      if (error) throw error;

      const envios = data ?? [];
      const porConductor: Record<string, { total: number; entregados: number }> = {};
      envios.forEach((e: Record<string, unknown>) => {
        const id = String(e.created_by ?? '');
        if (!porConductor[id]) porConductor[id] = { total: 0, entregados: 0 };
        porConductor[id].total++;
        if (e.status === 'delivered') porConductor[id].entregados++;
      });

      const filas = Object.entries(porConductor).map(([conductor_id, v]) => ({
        conductor_id,
        total: v.total,
        entregados: v.entregados,
        tasa_entrega: v.total > 0 ? Math.round((v.entregados / v.total) * 100) : 0,
      }));

      return buildReportData(
        'transporte-performance', 'Performance de Conductores', 'transport', periodo,
        [
          { titulo: 'Conductores', valor: filas.length, formato: 'numero' },
          { titulo: 'Total Envíos', valor: envios.length, formato: 'numero' },
        ],
        [
          { key: 'conductor_id', titulo: 'Conductor', tipo: 'texto' },
          { key: 'total', titulo: 'Envíos', tipo: 'numero', alinear: 'right' },
          { key: 'entregados', titulo: 'Entregados', tipo: 'numero', alinear: 'right' },
          { key: 'tasa_entrega', titulo: 'Tasa %', tipo: 'porcentaje', alinear: 'right' },
        ],
        filas,
      );
    },
  },
  {
    id: 'transporte-rutas',
    modulo: 'transport',
    titulo: 'Volumen por Ruta',
    descripcion: 'Envíos y costos por ruta',
    categoria: 'operativo',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('shipments')
        .select('id, delivery_city, total_cost, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`)
        .not('delivery_city', 'is', null);

      if (error) throw error;

      const envios = data ?? [];
      const porRuta: Record<string, { envios: number; costo: number }> = {};
      envios.forEach((e: Record<string, unknown>) => {
        const id = String(e.delivery_city ?? '');
        if (!porRuta[id]) porRuta[id] = { envios: 0, costo: 0 };
        porRuta[id].envios++;
        porRuta[id].costo += Number(e.total_cost ?? 0);
      });

      const filas = Object.entries(porRuta).map(([ciudad, v]) => ({
        ciudad, envios: v.envios, costo: v.costo,
      }));

      return buildReportData(
        'transporte-rutas', 'Volumen por Ruta', 'transport', periodo,
        [
          { titulo: 'Rutas', valor: filas.length, formato: 'numero' },
          { titulo: 'Total Costo', valor: filas.reduce((s, f) => s + f.costo, 0), formato: 'moneda' },
        ],
        [
          { key: 'ciudad', titulo: 'Ciudad Destino', tipo: 'texto' },
          { key: 'envios', titulo: 'Envíos', tipo: 'numero', alinear: 'right' },
          { key: 'costo', titulo: 'Costo Total', tipo: 'moneda', alinear: 'right' },
        ],
        filas,
        { envios: envios.length, costo: filas.reduce((s, f) => s + f.costo, 0) },
      );
    },
  },
];
