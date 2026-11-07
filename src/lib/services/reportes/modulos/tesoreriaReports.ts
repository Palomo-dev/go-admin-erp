// ============================================================
// Reportes de tesorería
// Lee `cash_movements` y `bank_transactions` con su categoría de tesorería.
// Antes vivía como pantalla de Finanzas (`/app/finanzas/reporte-categorias`);
// la agrupación es la misma función (`agruparCategorias`).
// ============================================================

import { supabase as browserSupabase } from '@/lib/supabase/config';
import { applyBranchFilter } from '@/lib/services/branchFilterHelper';
import {
  agruparCategorias,
  filaCategoriaDeBanco,
  filaCategoriaDeCaja,
} from '@/lib/finanzas/categoriasTesoreria';
import type { DefinicionModulo, PeriodoCierre, ReportData, ReportesClient } from '../types';
import { rangoDelPeriodo } from '../rangoPeriodo';
import { leerPaginado } from '../leerPaginado';

const SIN_CATEGORIA = 'Sin categoría';

export const tesoreriaReports: DefinicionModulo[] = [
  {
    id: 'categorias-tesoreria',
    modulo: 'finance',
    titulo: 'Ingresos y egresos por categoría',
    descripcion: 'Movimientos de caja y bancos del periodo agrupados por categoría de tesorería',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const [caja, banco] = await Promise.all([
        leerPaginado<Record<string, unknown>>((desde, hasta) => applyBranchFilter(
          db.from('cash_movements')
            .select('id, amount, created_at, branch_id, type, categoria_id, categorias_tesoreria(nombre)')
            .eq('organization_id', orgId)
            .gte('created_at', start)
            .lte('created_at', end),
          branchId,
        ).order('id').range(desde, hasta)),
        leerPaginado<Record<string, unknown>>((desde, hasta) => applyBranchFilter(
          db.from('bank_transactions')
            .select('id, amount, trans_date, branch_id, transaction_type, categoria_id, categorias_tesoreria(nombre)')
            .eq('organization_id', orgId)
            .gte('trans_date', start)
            .lte('trans_date', end),
          branchId,
        ).order('id').range(desde, hasta)),
      ]);

      const grupos = agruparCategorias([...caja.map(filaCategoriaDeCaja), ...banco.map(filaCategoriaDeBanco)]);
      const total = (tipo: 'ingreso' | 'egreso') => grupos.filter((g) => g.tipo === tipo).reduce((s, g) => s + g.total, 0);
      const ingresos = total('ingreso');
      const egresos = total('egreso');
      const sinCategoria = grupos.filter((g) => g.categoriaId == null).reduce((s, g) => s + g.movimientos, 0);

      return {
        id: 'categorias-tesoreria',
        titulo: 'Ingresos y egresos por categoría',
        modulo: 'finance',
        periodo,
        generadoEn: new Date().toISOString(),
        kpis: [
          { titulo: 'Ingresos', valor: ingresos, formato: 'moneda' },
          { titulo: 'Egresos', valor: egresos, formato: 'moneda' },
          { titulo: 'Neto', valor: ingresos - egresos, formato: 'moneda' },
          { titulo: 'Movimientos', valor: caja.length + banco.length, formato: 'numero' },
        ],
        columnas: [
          { key: 'categoria', titulo: 'Categoría', tipo: 'texto' },
          { key: 'tipo', titulo: 'Tipo', tipo: 'texto' },
          { key: 'movimientos', titulo: 'Movimientos', tipo: 'numero', alinear: 'right' },
          { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
        ],
        filas: grupos.map((g) => ({
          categoria: g.nombre,
          tipo: g.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
          movimientos: g.movimientos,
          total: g.total,
        })),
        lectura: sinCategoria > 0
          ? [{ tono: 'aviso', texto: `${sinCategoria} movimientos no tienen categoría y salen como «${SIN_CATEGORIA}».`, href: '/app/finanzas/categorias-tesoreria', etiquetaAccion: 'Ver categorías' }]
          : [],
      };
    },
  },
];
